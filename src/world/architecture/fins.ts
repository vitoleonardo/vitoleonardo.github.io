import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, type BufferGeometry } from 'three'
import { blockBetween, composeMatrix, instances, merge, projectWorldUVs } from '../geometry'
import { concreteMaterial, towerSpec, withSurfaceBreakup } from '../floors/kit'
import { bakeOcclusion, smooth } from './occlusion'
import type { SharedTextures, Vec3 } from '../types'

const wall = towerSpec.halfSize + towerSpec.wallThickness
const slabFront = towerSpec.halfSize + 0.15
const fin = { depth: 0.55, width: 0.22, pitch: 1, bottom: 0.3, top: 24 } as const
const crownFin = { depth: 0.4, width: 0.14, bottom: 24.5, top: 28.9 } as const
const band = { height: 0.8, proud: 0.32, frontDrop: 0.32 } as const
const deck = { halfDepth: 4.3, clearance: 19.5 } as const
const concreteTile = 2.4

type Face = 'west' | 'east' | 'back'

const faces: readonly Face[] = ['west', 'east', 'back']

function outwardYaw(face: Face): number {
  if (face === 'west') return Math.PI
  if (face === 'back') return Math.PI / 2
  return 0
}

function finAnchor(face: Face, along: number, depth: number): Vec3 {
  const offset = wall + depth / 2
  if (face === 'west') return [-offset, 0, along]
  if (face === 'east') return [offset, 0, along]
  return [along, 0, -offset]
}

function finSpan(face: Face, along: number): readonly [number, number] {
  const underDeck = face === 'east' && Math.abs(along) < deck.halfDepth
  return [fin.bottom, underDeck ? deck.clearance : fin.top]
}

function finMatrices(): Matrix4[] {
  const matrices: Matrix4[] = []
  for (const face of faces) {
    const reach = face === 'back' ? towerSpec.halfSize - 1 : towerSpec.halfSize
    for (let along = -reach; along <= reach + 1e-6; along += fin.pitch) {
      const [bottom, top] = finSpan(face, along)
      const [x, , z] = finAnchor(face, along, fin.depth)
      matrices.push(composeMatrix([x, (bottom + top) / 2, z], [0, outwardYaw(face), 0], [fin.depth, top - bottom, fin.width]))
      const crowned = Math.round(along + reach) % 2 === 0
      if (!crowned) continue
      const [cx, , cz] = finAnchor(face, along, crownFin.depth)
      matrices.push(
        composeMatrix([cx, (crownFin.bottom + crownFin.top) / 2, cz], [0, outwardYaw(face), 0], [crownFin.depth, crownFin.top - crownFin.bottom, crownFin.width]),
      )
    }
  }
  return matrices
}

function finGeometry(): BufferGeometry {
  return bakeOcclusion(new BoxGeometry(1, 1, 1), (x) => 0.45 + 0.55 * smooth(-0.5, 0.5, x))
}

function bandGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  for (let level = 1; level < towerSpec.levels; level += 1) {
    const top = level * towerSpec.floorHeight
    const bottom = top - band.height
    const frontTop = top - band.frontDrop
    pieces.push(blockBetween([-wall - band.proud, bottom, -wall - band.proud], [-wall, top, slabFront]))
    pieces.push(blockBetween([wall, bottom, -wall - band.proud], [wall + band.proud, top, slabFront]))
    pieces.push(blockBetween([-wall, bottom, -wall - band.proud], [wall, top, -wall]))
    pieces.push(blockBetween([-wall - band.proud, bottom, slabFront], [wall + band.proud, frontTop, slabFront + band.proud]))
  }
  return bakeOcclusion(projectWorldUVs(merge(pieces), concreteTile), (_x, _y, _z, normalY) => (normalY < -0.5 ? 0.5 : 1))
}

export function createFins(textures: SharedTextures): Group {
  const root = new Group()
  root.name = 'brutalist-fins'
  const finMaterial = withSurfaceBreakup(
    new MeshStandardMaterial({ color: '#4A4E56', roughness: 0.92, metalness: 0, vertexColors: true }),
    { cellsPerMetre: 1.3, roughnessSwing: 0.08, albedoSwing: 0.14, verticalStretch: 6 },
  )
  const fins = instances(finGeometry(), finMaterial, finMatrices())
  fins.name = 'fins'
  const bands = new Mesh(bandGeometry(), concreteMaterial(textures, { vertexColors: true }))
  bands.name = 'slab-bands'
  for (const mesh of [fins, bands]) {
    mesh.castShadow = true
    mesh.receiveShadow = true
  }
  root.add(fins, bands)
  return root
}
