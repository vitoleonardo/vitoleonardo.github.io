import { CanvasTexture, CylinderGeometry, Mesh, MeshBasicMaterial, MultiplyBlending, PlaneGeometry, SRGBColorSpace, type BufferGeometry, type Texture } from 'three'
import { merge, place } from '../geometry'
import { createBeamMaterial, floorBase, palette, towerSpec } from '../floors/kit'
import type { FrameState, Vec3 } from '../types'

const wall = towerSpec.halfSize + towerSpec.wallThickness
const decalLift = 0.006
const decalSize = 128
const shadowCore = 0.4
const bandUv = { column: 0.5, dark: 0.5, light: 1 } as const

const streetLampXs = [-30, -18, -8, 8, 18, 30] as const
const streetLampZ = 10.6
const lampHead: Vec3 = [0, 4.955, 11.65]
const bollardXs = [-15, -13, -11, -3.4, -1.8, 10.2, 12, 13.8] as const
const bikeStandXs = [-6.2, -5.2, -4.2] as const
const rackRowXs = [-2.8, 0.2, 3.2, 6] as const
const deskSpots: readonly (readonly [number, number])[] = [[-3.6, 2.6], [-3.6, 4.9], [3.8, 2.6], [3.8, 4.9]]
const rocketPad: Vec3 = [11, floorBase.rocket + 0.3, 0]
const launchTowerFoot: Vec3 = [13.4, floorBase.rocket + 0.3, -2.2]
const loungeDeck = floorBase.lounge + 0.12
const deckUnderside = { top: floorBase.rocket - towerSpec.slabThickness, height: 1.85, halfDepth: 4 } as const

interface Blob {
  at: Vec3
  size: readonly [number, number]
}

interface Band {
  at: Vec3
  width: number
  height: number
  yaw: number
}

function blobs(): Blob[] {
  const list: Blob[] = []
  for (const x of bollardXs) list.push({ at: [x, 0, 10.55], size: [0.7, 0.7] })
  for (const x of bikeStandXs) list.push({ at: [x, 0, 9.2], size: [1, 1.4] })
  list.push({ at: [1.2, 0, 10.4], size: [0.9, 0.9] })
  for (const x of streetLampXs) list.push({ at: [x, 0, streetLampZ], size: [1.1, 1.1] })
  for (const [x, z] of deskSpots) list.push({ at: [x, floorBase.frontend, z], size: [2.8, 1.3] })
  for (const x of rackRowXs) list.push({ at: [x, floorBase.backend + 0.3, -1], size: [1.7, 11.4] })
  list.push({ at: rocketPad, size: [4.2, 4.2] })
  list.push({ at: launchTowerFoot, size: [2.2, 2.2] })
  list.push({ at: [4.75, loungeDeck, 0.9], size: [2.9, 1.5] })
  list.push({ at: [2.6, loungeDeck, -4.3], size: [3.1, 1.3] })
  list.push({ at: [5.05, loungeDeck, -4.15], size: [1.1, 1.1] })
  return list
}

function bands(): Band[] {
  const list: Band[] = []
  for (let level = 1; level < towerSpec.levels; level += 1) {
    const soffit = level * towerSpec.floorHeight - towerSpec.slabThickness
    const lintel = soffit - 0.55
    const centre = (soffit + lintel) / 2
    list.push({ at: [wall + 0.01, centre, 0], width: towerSpec.halfSize * 2, height: soffit - lintel, yaw: Math.PI / 2 })
    list.push({ at: [-wall - 0.01, centre, 0], width: towerSpec.halfSize * 2, height: soffit - lintel, yaw: -Math.PI / 2 })
    list.push({ at: [0, centre, -wall - 0.01], width: wall * 2, height: soffit - lintel, yaw: Math.PI })
  }
  list.push({
    at: [wall + 0.012, deckUnderside.top - deckUnderside.height / 2, 0],
    width: deckUnderside.halfDepth * 2,
    height: deckUnderside.height,
    yaw: Math.PI / 2,
  })
  return list
}

function createShadowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = decalSize
  canvas.height = decalSize
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas unavailable for the contact shadow texture')
  const centre = decalSize / 2
  const gradient = context.createRadialGradient(centre, centre, 0, centre, centre, centre)
  const core = Math.round(shadowCore * 255)
  gradient.addColorStop(0, `rgb(${core}, ${core}, ${core})`)
  gradient.addColorStop(0.45, `rgb(${Math.round((shadowCore + 0.35) * 255)}, ${Math.round((shadowCore + 0.35) * 255)}, ${Math.round((shadowCore + 0.35) * 255)})`)
  gradient.addColorStop(1, 'rgb(255, 255, 255)')
  context.fillStyle = 'rgb(255, 255, 255)'
  context.fillRect(0, 0, decalSize, decalSize)
  context.fillStyle = gradient
  context.fillRect(0, 0, decalSize, decalSize)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function bandGeometry(): BufferGeometry {
  const plane = new PlaneGeometry(1, 1)
  const uv = plane.getAttribute('uv')
  for (let vertex = 0; vertex < uv.count; vertex += 1) {
    const top = plane.getAttribute('position').getY(vertex) > 0
    uv.setXY(vertex, bandUv.column, top ? bandUv.dark : bandUv.light)
  }
  return plane
}

function decalGeometry(): BufferGeometry {
  const blob = new PlaneGeometry(1, 1)
  const band = bandGeometry()
  const pieces: BufferGeometry[] = []
  for (const { at, size } of blobs()) {
    pieces.push(place(blob.clone(), [at[0], at[1] + decalLift, at[2]], [-Math.PI / 2, 0, 0], [size[0], size[1], 1]))
  }
  for (const { at, width, height, yaw } of bands()) {
    pieces.push(place(band.clone(), at, [0, yaw, 0], [width, height, 1]))
  }
  blob.dispose()
  band.dispose()
  return merge(pieces)
}

function lampShaftGeometry(): BufferGeometry {
  const height = lampHead[1] - 0.05
  const cone = new CylinderGeometry(0.22, 2.1, height, 20, 1, true)
  return merge(streetLampXs.map((x) => place(cone.clone(), [x, height / 2, lampHead[2]])))
}

export interface Grounding {
  decals: Mesh
  shafts: Mesh
  textures: readonly Texture[]
  update(frame: FrameState): void
}

export function createGrounding(withShafts: boolean): Grounding {
  const shadowTexture = createShadowTexture()
  const decalMaterial = new MeshBasicMaterial({
    map: shadowTexture,
    blending: MultiplyBlending,
    premultipliedAlpha: true,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
  const decals = new Mesh(decalGeometry(), decalMaterial)
  decals.name = 'contact-shadows'
  decals.renderOrder = -1

  const shaftMaterial = createBeamMaterial(palette.warm, true, 2.2)
  const shafts = new Mesh(lampShaftGeometry(), shaftMaterial)
  shafts.name = 'lamp-shafts'
  shafts.visible = withShafts

  return {
    decals,
    shafts,
    textures: [shadowTexture],
    update(frame) {
      const { world } = frame
      const strength = (0.05 + 0.22 * world.rain) * (1 - world.dawn)
      shaftMaterial.uniforms.uIntensity.value = strength
      shafts.visible = withShafts && strength > 0.01
    },
  }
}
