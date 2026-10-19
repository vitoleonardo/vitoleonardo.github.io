import type { BufferGeometry } from 'three'
import { block, blockBetween, merge } from '../geometry'
import { towerSpec } from '../floors/kit'
import { plateBottom, plateTop, terraceList, type TerraceSide } from './terraces'
import type { Vec3 } from '../types'

const wall = towerSpec.halfSize + towerSpec.wallThickness
const slabFront = towerSpec.halfSize + 0.15
export const fin = { depth: 0.55, width: 0.22, pitch: 1, bottom: 0.3, top: 24, slabGap: 0.12, minimumStub: 0.6 } as const
const crownFin = { depth: 0.4, width: 0.14, bottom: 24.5, top: 28.9 } as const
const band = { height: 0.8, proud: 0.32, frontDrop: 0.32 } as const
const deck = { halfDepth: 4.3, clearance: 19.5 } as const

type Face = TerraceSide | 'back'

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

function finTop(face: Face, along: number): number {
  const underDeck = face === 'east' && Math.abs(along) < deck.halfDepth
  return underDeck ? deck.clearance : fin.top
}

export function finSegments(face: Face, along: number): (readonly [bottom: number, top: number])[] {
  const top = finTop(face, along)
  const slabs = terraceList
    .filter((spec) => spec.side === face)
    .map((spec) => [plateBottom(spec.level) - fin.slabGap, plateTop(spec.level) + fin.slabGap] as const)
    .sort((a, b) => a[0] - b[0])
  const segments: (readonly [number, number])[] = []
  let cursor: number = fin.bottom
  for (const [slabBottom, slabTop] of slabs) {
    if (slabBottom > cursor) segments.push([cursor, Math.min(slabBottom, top)])
    cursor = slabTop
  }
  if (cursor < top) segments.push([cursor, top])
  return segments.filter(([bottom, segmentTop]) => segmentTop - bottom >= fin.minimumStub)
}

function finPieces(): BufferGeometry[] {
  const pieces: BufferGeometry[] = []
  for (const face of faces) {
    const reach = face === 'back' ? towerSpec.halfSize - 1 : towerSpec.halfSize
    for (let along = -reach; along <= reach + 1e-6; along += fin.pitch) {
      const [x, , z] = finAnchor(face, along, fin.depth)
      for (const [bottom, top] of finSegments(face, along)) {
        pieces.push(block([fin.depth, top - bottom, fin.width], [x, (bottom + top) / 2, z], [0, outwardYaw(face), 0]))
      }
      const crowned = Math.round(along + reach) % 2 === 0
      if (!crowned) continue
      const [cx, , cz] = finAnchor(face, along, crownFin.depth)
      pieces.push(block([crownFin.depth, crownFin.top - crownFin.bottom, crownFin.width], [cx, (crownFin.bottom + crownFin.top) / 2, cz], [0, outwardYaw(face), 0]))
    }
  }
  return pieces
}

function bandPieces(): BufferGeometry[] {
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
  return pieces
}

export function finConcreteGeometry(): BufferGeometry {
  return merge([...finPieces(), ...bandPieces()])
}
