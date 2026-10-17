import {
  AdditiveBlending,
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type ColorRepresentation,
  type Texture,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { block, blockBetween, composeMatrix, createRandom, cylinderBetween, instances, merge, place, strut, tintVertices } from '../geometry'
import { averageTextureColor, createGlowTexture } from '../textures'
import type { FloorFactory, FrameState, InteractiveProxy, Vec3 } from '../types'
import {
  approach,
  chapterIndex,
  createEmitter,
  createProxy,
  disposeTree,
  emphasisOf,
  floorBase,
  palette,
  patchSurface,
  smoothstep,
  withSurfaceBreakup,
} from './kit'
import { breathe, createAreaEmitter, createSceneClock, litByArea, paintedSteelMaterial, withinChapters } from './kit-upper'

const serviceCount = 10
const deckTop = 0.12
const boardWidth = 0.14
const boardGap = 0.008
const fallbackPortraitAspect = 1017 / 866

interface DeckRegion {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

const deckRegions: readonly DeckRegion[] = [
  { minX: 2.05, maxX: 6.85, minZ: -6.95, maxZ: 6.85 },
  { minX: -2.2, maxX: 2.05, minZ: -6.95, maxZ: -2.05 },
]

const wall = { x: 2.6, z: -5.4, bottom: 1.3, height: 6, bezel: 0.14, depth: 0.52, lip: 0.05 } as const
const wallCentreY = deckTop + wall.bottom + wall.height / 2
const wallColumnOffset = 2.4
const wallColumnZ = wall.z - 0.64
const wallRearLegZ = -6.82
const wallLuminance = 1.15
const ledGridRows = 216
const spillLuminance = 2.2
const haloReach = 0.8
const haloMargin = 2.6
const haloStrength = 0.035

const booth = { x: 2.6, z: -4.3, width: 2.6, depth: 0.72, height: 1 } as const
const boothTop = deckTop + booth.height
const boothFront = booth.z + booth.depth / 2
const turntableOffset = 0.78
const equaliser = { width: booth.width - 0.34, height: 0.05, y: boothTop - 0.095 } as const

const rack = { x: 5.05, z: -4.15, yaw: -0.26, width: 0.6, depth: 0.6, pitch: 0.1, firstUnit: 0.17 } as const
const rackHeight = rack.firstUnit + serviceCount * rack.pitch + 0.07
const rackFace = 0.262

const crate = { x: 0.72, z: -4.05, yaw: 0.22, size: 0.37, height: 0.31 } as const
const sofa = { x: 4.75, z: 0.9, width: 2.3, depth: 0.86 } as const
const floorLamp = { x: 6.32, z: 2.75, shadeY: 1.5, shadeRadius: 0.24, shadeHeight: 0.3 } as const
const holeHalf = 1.8
const railHeight = 1.05

const gearBreakup = { cellsPerMetre: 4, roughnessSwing: 0.1, albedoSwing: 0.06, verticalStretch: 1 }
const aluminiumBreakup = { cellsPerMetre: 9, roughnessSwing: 0.1, albedoSwing: 0.06, verticalStretch: 6 }
const fabricBreakup = { cellsPerMetre: 6, roughnessSwing: 0.04, albedoSwing: 0.09, verticalStretch: 1 }

const sleeveColors = ['#C9B48A', '#2E4057', '#8C3B2E', '#D9D3C7', '#1E1F22', '#B5793A', '#4F6B5A', '#6E5A7E', '#C2402F', '#E1C16E'] as const

interface Parts {
  wood: BufferGeometry[]
  steel: BufferGeometry[]
  aluminium: BufferGeometry[]
  gear: BufferGeometry[]
  fabric: BufferGeometry[]
  warm: BufferGeometry[]
}

function createParts(): Parts {
  return { wood: [], steel: [], aluminium: [], gear: [], fabric: [], warm: [] }
}

function tinted(geometry: BufferGeometry, color: ColorRepresentation): BufferGeometry {
  return tintVertices(geometry, color)
}

function roundedBox(size: Vec3, centre: Vec3, radius: number, rotation: Vec3 = [0, 0, 0]): BufferGeometry {
  return place(new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius), centre, rotation)
}

function addDeck(parts: Parts): void {
  const random = createRandom(2809)
  const weathered = new Color('#6A5848')
  const board = new Color()
  for (const region of deckRegions) {
    for (let z = region.minZ; z + boardWidth <= region.maxZ + 1e-3; z += boardWidth + boardGap) {
      const joint = region.minX + (region.maxX - region.minX) * (0.3 + random() * 0.4)
      for (const [from, to] of [[region.minX, joint], [joint + 0.004, region.maxX]] as const) {
        board.copy(weathered).multiplyScalar(0.78 + random() * 0.36).offsetHSL((random() - 0.5) * 0.02, 0, 0)
        parts.wood.push(tinted(blockBetween([from, deckTop - 0.028, z], [to, deckTop, z + boardWidth]), board))
      }
    }
  }
  const fascia = new Color('#4A3D32')
  const edges: readonly (readonly [Vec3, Vec3])[] = [
    [[2.05, 0, -2.05], [2.075, deckTop, 6.85]],
    [[-2.2, 0, -2.075], [2.05, deckTop, -2.05]],
    [[-2.225, 0, -6.95], [-2.2, deckTop, -2.05]],
    [[2.05, 0, 6.85], [6.85, deckTop, 6.875]],
  ]
  for (const [min, max] of edges) parts.wood.push(tinted(blockBetween(min, max), fascia))
}

function addLightWall(parts: Parts, width: number): void {
  const half = width / 2
  const frameDepth = wall.depth
  const frameZ = wall.z + wall.lip - frameDepth / 2
  parts.steel.push(roundedBox([width + wall.bezel * 2, wall.bezel, frameDepth], [wall.x, wallCentreY + wall.height / 2 + wall.bezel / 2, frameZ], 0.02))
  parts.steel.push(roundedBox([width + wall.bezel * 2, wall.bezel, frameDepth], [wall.x, wallCentreY - wall.height / 2 - wall.bezel / 2, frameZ], 0.02))
  for (const side of [-1, 1]) {
    parts.steel.push(roundedBox([wall.bezel, wall.height, frameDepth], [wall.x + side * (half + wall.bezel / 2), wallCentreY, frameZ], 0.02))
  }
  parts.steel.push(block([width + 0.1, wall.height + 0.1, 0.36], [wall.x, wallCentreY, wall.z - 0.26]))
  for (const y of [-2.2, 0, 2.2]) {
    parts.steel.push(block([width - 0.4, 0.12, 0.06], [wall.x, wallCentreY + y, wall.z - 0.47]))
    parts.steel.push(block([width - 0.4, 0.02, 0.1], [wall.x, wallCentreY + y + 0.05, wall.z - 0.52]))
    parts.steel.push(block([width - 0.4, 0.02, 0.1], [wall.x, wallCentreY + y - 0.05, wall.z - 0.52]))
  }
  const columnTop = wallCentreY + wall.height / 2 + wall.bezel
  for (const side of [-1, 1]) {
    const x = wall.x + side * wallColumnOffset
    const height = columnTop - deckTop
    const centreY = deckTop + height / 2
    parts.steel.push(block([0.22, height, 0.018], [x, centreY, wallColumnZ + 0.11]))
    parts.steel.push(block([0.22, height, 0.018], [x, centreY, wallColumnZ - 0.11]))
    parts.steel.push(block([0.014, height, 0.22], [x, centreY, wallColumnZ]))
    parts.steel.push(block([0.46, 0.025, 0.46], [x, deckTop + 0.0125, wallColumnZ]))
    for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]] as const) {
      parts.steel.push(place(new CylinderGeometry(0.014, 0.014, 0.05, 6), [x + dx, deckTop + 0.04, wallColumnZ + dz]))
    }
    parts.steel.push(block([0.12, 4.1, 0.12], [x, deckTop + 2.05, wallRearLegZ]))
    parts.steel.push(block([0.32, 0.02, 0.32], [x, deckTop + 0.01, wallRearLegZ]))
    for (const y of [1.7, 4.0]) parts.steel.push(strut([x, deckTop + y, wallColumnZ - 0.11], [x, deckTop + y, wallRearLegZ + 0.06], 0.08))
    parts.steel.push(strut([x, deckTop + 0.15, wallColumnZ - 0.11], [x, deckTop + 1.7, wallRearLegZ + 0.06], 0.06))
    parts.steel.push(strut([x, deckTop + 1.7, wallRearLegZ + 0.06], [x, deckTop + 4.0, wallColumnZ - 0.11], 0.06))
    parts.steel.push(strut([x, deckTop + 4.0, wallRearLegZ + 0.06], [x, columnTop - 0.3, wallColumnZ - 0.11], 0.07))
  }
  parts.steel.push(block([0.3, 0.42, 0.16], [wall.x + wallColumnOffset + 0.2, deckTop + 1.0, wallColumnZ + 0.2]))
  parts.steel.push(cylinderBetween([wall.x + wallColumnOffset + 0.2, deckTop + 1.21, wallColumnZ + 0.2], [wall.x + wallColumnOffset + 0.2, wallCentreY - wall.height / 2 - 0.05, wallColumnZ + 0.2], 0.022, 8))
  parts.gear.push(tinted(cylinderBetween([wall.x + wallColumnOffset + 0.2, deckTop + 0.79, wallColumnZ + 0.2], [wall.x + wallColumnOffset + 0.2, deckTop + 0.02, wallColumnZ + 0.2], 0.012, 6), '#111214'))
  parts.gear.push(tinted(cylinderBetween([wall.x + wallColumnOffset + 0.2, deckTop + 0.012, wallColumnZ + 0.2], [booth.x + 0.9, deckTop + 0.012, booth.z - 0.3], 0.012, 6), '#111214'))
}

function addBooth(parts: Parts): void {
  const { x, z, width, depth } = booth
  const back = z - depth / 2
  const carcassHeight = booth.height - 0.035
  const laminate = '#17181B'
  parts.gear.push(tinted(roundedBox([width + 0.06, 0.035, depth + 0.06], [x, boothTop - 0.0175, z], 0.008), laminate))
  parts.gear.push(tinted(roundedBox([width, carcassHeight - 0.07, 0.025], [x, deckTop + 0.07 + (carcassHeight - 0.07) / 2, boothFront - 0.0125], 0.006), laminate))
  for (const side of [-1, 1]) {
    parts.gear.push(tinted(roundedBox([0.025, carcassHeight, depth], [x + side * (width / 2 - 0.0125), deckTop + carcassHeight / 2, z], 0.006), laminate))
  }
  parts.gear.push(tinted(block([width - 0.05, 0.022, depth - 0.1], [x, deckTop + 0.48, z - 0.02]), laminate))
  parts.gear.push(tinted(block([width - 0.04, 0.07, 0.02], [x, deckTop + 0.035, boothFront - 0.06]), '#0C0D0F'))
  parts.gear.push(tinted(block([equaliser.width + 0.04, equaliser.height + 0.025, 0.012], [x, equaliser.y, boothFront + 0.001]), '#08090A'))
  for (const side of [-1, 1]) {
    const edgeX = x + side * (width / 2 - 0.005)
    parts.aluminium.push(block([0.032, carcassHeight - 0.02, 0.032], [edgeX, deckTop + carcassHeight / 2, boothFront - 0.002]))
    for (const y of [deckTop + 0.02, boothTop - 0.05]) parts.aluminium.push(place(new SphereGeometry(0.024, 12, 8), [edgeX, y, boothFront + 0.004]))
  }
  parts.aluminium.push(block([width, 0.022, 0.03], [x, boothTop - 0.046, boothFront - 0.001]))
  parts.aluminium.push(block([width, 0.022, 0.03], [x, deckTop + 0.081, boothFront - 0.001]))
  parts.gear.push(tinted(block([0.06, 0.02, 0.06], [x - width / 2 + 0.2, deckTop + 0.49 + 0.01, back + 0.15]), '#111214'))

  for (const side of [-1, 1]) addTurntable(parts, x + side * turntableOffset, z - 0.02, side < 0)
  addMixer(parts, x, z)
  addHeadphones(parts, x - 0.36, z + 0.05)
  addGooseneck(parts, x + 0.21, z - 0.27)
}

function addTurntable(parts: Parts, x: number, z: number, playing: boolean): void {
  const top = boothTop
  parts.gear.push(tinted(roundedBox([0.46, 0.1, 0.36], [x, top + 0.05, z], 0.012), '#1C1D20'))
  const platterX = x - 0.05
  parts.aluminium.push(place(new CylinderGeometry(0.152, 0.152, 0.018, 48), [platterX, top + 0.109, z]))
  parts.gear.push(tinted(place(new CylinderGeometry(0.149, 0.149, 0.004, 48), [platterX, top + 0.12, z]), '#0A0A0B'))
  parts.gear.push(tinted(place(new CylinderGeometry(0.05, 0.05, 0.0046, 32), [platterX, top + 0.1205, z]), playing ? '#B8452F' : '#D8C9A3'))
  parts.aluminium.push(place(new CylinderGeometry(0.004, 0.004, 0.022, 8), [platterX, top + 0.13, z]))
  const pivot: Vec3 = [x + 0.165, top + 0.13, z - 0.11]
  parts.aluminium.push(place(new CylinderGeometry(0.028, 0.032, 0.03, 20), [pivot[0], top + 0.115, pivot[2]]))
  const stylus: Vec3 = playing ? [platterX + 0.06, top + 0.128, z + 0.1] : [x + 0.175, top + 0.13, z + 0.12]
  parts.aluminium.push(cylinderBetween(pivot, stylus, 0.0045, 8))
  parts.aluminium.push(cylinderBetween(pivot, [pivot[0] + 0.01, pivot[1], pivot[2] - 0.06], 0.012, 10))
  parts.gear.push(tinted(block([0.022, 0.01, 0.048], [stylus[0], stylus[1] - 0.004, stylus[2] + 0.012]), '#121315'))
  parts.gear.push(tinted(block([0.014, 0.004, 0.12], [x + 0.19, top + 0.101, z + 0.07]), '#09090A'))
  parts.aluminium.push(block([0.032, 0.012, 0.016], [x + 0.19, top + 0.107, z + 0.06]))
  parts.aluminium.push(block([0.042, 0.008, 0.03], [x - 0.19, top + 0.104, z + 0.15]))
}

function addMixer(parts: Parts, x: number, z: number): void {
  const top = boothTop
  parts.gear.push(tinted(roundedBox([0.3, 0.075, 0.38], [x, top + 0.0375, z], 0.01), '#202226'))
  for (let column = 0; column < 4; column += 1) {
    const knobX = x - 0.105 + column * 0.07
    for (const knobZ of [z - 0.14, z - 0.09, z - 0.04]) {
      parts.gear.push(tinted(place(new CylinderGeometry(0.011, 0.012, 0.016, 12), [knobX, top + 0.083, knobZ]), '#3A3D42'))
    }
    parts.gear.push(tinted(block([0.006, 0.003, 0.09], [knobX, top + 0.0765, z + 0.06]), '#08090A'))
    parts.gear.push(tinted(block([0.018, 0.014, 0.024], [knobX, top + 0.082, z + 0.03 + column * 0.012]), '#D8D4CC'))
  }
  parts.gear.push(tinted(block([0.12, 0.003, 0.006], [x, top + 0.0765, z + 0.15]), '#08090A'))
  parts.gear.push(tinted(block([0.024, 0.014, 0.018], [x + 0.01, top + 0.082, z + 0.15]), '#D8D4CC'))
}

function addHeadphones(parts: Parts, x: number, z: number): void {
  const top = boothTop
  parts.gear.push(tinted(place(new TorusGeometry(0.085, 0.011, 8, 24, Math.PI), [x, top + 0.012, z], [-Math.PI / 2, 0, 0.3]), '#141416'))
  for (const side of [-1, 1]) {
    const cupX = x + Math.cos(0.3) * 0.085 * side
    const cupZ = z - Math.sin(0.3) * 0.085 * side
    parts.gear.push(tinted(place(new CylinderGeometry(0.044, 0.046, 0.034, 20), [cupX, top + 0.017, cupZ]), '#18191B'))
  }
}

function addGooseneck(parts: Parts, x: number, z: number): void {
  const top = boothTop
  parts.aluminium.push(place(new CylinderGeometry(0.03, 0.034, 0.014, 20), [x, top + 0.007, z]))
  const neck = new CatmullRomCurve3([
    new Vector3(x, top + 0.01, z),
    new Vector3(x, top + 0.2, z),
    new Vector3(x - 0.05, top + 0.33, z + 0.08),
    new Vector3(x - 0.13, top + 0.34, z + 0.2),
  ])
  parts.steel.push(new TubeGeometry(neck, 40, 0.0065, 8, false))
  const head: Vec3 = [x - 0.15, top + 0.325, z + 0.23]
  parts.steel.push(place(new CylinderGeometry(0.016, 0.026, 0.055, 16, 1, true), head, [0.35, 0, 0]))
  parts.warm.push(tinted(place(new CylinderGeometry(0.022, 0.022, 0.004, 16), [head[0], head[1] - 0.026, head[2] + 0.008], [0.35, 0, 0]), new Color(1, 1, 1)))
}

function addCrate(parts: Parts): void {
  const random = createRandom(331)
  const local: BufferGeometry[] = []
  const sleeves: BufferGeometry[] = []
  const { size, height } = crate
  const half = size / 2 - 0.012
  const wood = '#6B5139'
  local.push(tinted(block([size, 0.015, size], [0, 0.0075, 0]), wood))
  for (const [dx, dz] of [[-half, -half], [half, -half], [-half, half], [half, half]] as const) {
    local.push(tinted(block([0.026, height, 0.026], [dx, height / 2, dz]), '#5A4430'))
  }
  for (const y of [0.05, 0.15, 0.26]) {
    for (const side of [-1, 1]) {
      local.push(tinted(block([size, 0.05, 0.014], [0, y, side * (size / 2 - 0.007)]), wood))
      local.push(tinted(block([0.014, 0.05, size], [side * (size / 2 - 0.007), y, 0]), wood))
    }
  }
  for (let sleeve = 0; sleeve < 22; sleeve += 1) {
    const z = -half + 0.02 + sleeve * 0.0145
    const color = sleeveColors[Math.floor(random() * sleeveColors.length)]
    const lean = (random() - 0.5) * 0.12 - 0.18
    sleeves.push(tinted(block([0.312, 0.312, 0.005], [0, 0.17 + random() * 0.012, z], [lean, 0, 0]), new Color(color).multiplyScalar(0.7 + random() * 0.3)))
  }
  const placed = merge([...local, ...sleeves])
  parts.gear.push(place(placed, [crate.x, deckTop, crate.z], [0, crate.yaw, 0]))
  const leaning = tinted(block([0.312, 0.312, 0.005], [0, 0.156, 0], [-0.22, 0, 0]), new Color(sleeveColors[3]).multiplyScalar(0.85))
  parts.gear.push(place(leaning, [crate.x + 0.02, deckTop, crate.z + crate.size / 2 + 0.07], [0, crate.yaw + 0.1, 0]))
}

function rackPoint(localX: number, y: number, localZ: number): Vec3 {
  const cos = Math.cos(rack.yaw)
  const sin = Math.sin(rack.yaw)
  return [rack.x + localX * cos + localZ * sin, deckTop + y, rack.z - localX * sin + localZ * cos]
}

function rackUnitY(unit: number): number {
  return rack.firstUnit + unit * rack.pitch + rack.pitch / 2
}

type UnitKind = 'switch' | 'server' | 'storage'

const unitKinds: readonly UnitKind[] = ['switch', 'server', 'server', 'storage', 'server', 'server', 'storage', 'server', 'server', 'switch']

function addRack(parts: Parts): void {
  const frame: BufferGeometry[] = []
  const units: BufferGeometry[] = []
  const halfWidth = rack.width / 2 - 0.0175
  const halfDepth = rack.depth / 2 - 0.0175
  for (const [dx, dz] of [[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [-halfWidth, halfDepth], [halfWidth, halfDepth]] as const) {
    frame.push(block([0.035, rackHeight - 0.1, 0.035], [dx, 0.07 + (rackHeight - 0.1) / 2, dz]))
    units.push(tinted(place(new CylinderGeometry(0.026, 0.026, 0.022, 14), [dx * 0.85, 0.03, dz * 0.85], [0, 0, Math.PI / 2]), '#0E0F11'))
    units.push(tinted(block([0.02, 0.03, 0.03], [dx * 0.85, 0.055, dz * 0.85]), '#1A1B1E'))
  }
  frame.push(block([rack.width, 0.035, rack.depth], [0, 0.0725, 0]))
  frame.push(block([rack.width, 0.035, rack.depth], [0, rackHeight - 0.0175, 0]))
  for (const side of [-1, 1]) {
    frame.push(block([0.018, rackHeight - 0.16, 0.012], [side * 0.245, 0.09 + (rackHeight - 0.16) / 2, rackFace - 0.02]))
    frame.push(block([0.018, rackHeight - 0.16, 0.012], [side * 0.245, 0.09 + (rackHeight - 0.16) / 2, -rackFace + 0.02]))
  }
  for (let unit = 0; unit < serviceCount; unit += 1) {
    const y = rackUnitY(unit)
    const kind = unitKinds[unit]
    const shade = kind === 'storage' ? '#2C3036' : unit % 2 === 0 ? '#23262B' : '#1D2024'
    units.push(tinted(roundedBox([0.47, rack.pitch - 0.014, 0.5], [0, y, 0], 0.006), shade))
    units.push(tinted(block([0.56, rack.pitch - 0.016, 0.006], [0, y, rackFace - 0.003]), '#16181C'))
    if (kind === 'switch') {
      for (let port = 0; port < 12; port += 1) units.push(tinted(block([0.018, 0.014, 0.004], [-0.17 + port * 0.025, y, rackFace + 0.001]), '#060708'))
    } else if (kind === 'storage') {
      for (let bay = 0; bay < 4; bay += 1) units.push(tinted(block([0.085, rack.pitch - 0.034, 0.004], [-0.16 + bay * 0.092, y, rackFace + 0.001]), '#3A3F46'))
    } else {
      for (let slot = 0; slot < 5; slot += 1) units.push(tinted(block([0.07, 0.004, 0.004], [-0.17 + slot * 0.075, y + 0.012, rackFace + 0.001]), '#0B0C0E'))
      for (let slot = 0; slot < 5; slot += 1) units.push(tinted(block([0.07, 0.004, 0.004], [-0.17 + slot * 0.075, y - 0.012, rackFace + 0.001]), '#0B0C0E'))
    }
  }
  const cable = new CatmullRomCurve3([
    new Vector3(0.12, rackHeight - 0.2, -rackFace + 0.05),
    new Vector3(0.18, 0.6, -rackFace - 0.04),
    new Vector3(0.1, 0.05, -rackFace - 0.12),
  ])
  units.push(tinted(new TubeGeometry(cable, 16, 0.014, 6, false), '#111214'))
  const transform: Vec3 = [rack.x, deckTop, rack.z]
  parts.steel.push(place(merge(frame), transform, [0, rack.yaw, 0]))
  parts.gear.push(place(merge(units), transform, [0, rack.yaw, 0]))
}

function addSofa(parts: Parts): void {
  const { x, z, width, depth } = sofa
  const baseY = deckTop + 0.08
  parts.fabric.push(roundedBox([width, 0.24, depth], [x, baseY + 0.12, z], 0.03))
  const seatWidth = (width - 0.4) / 3
  for (let seat = 0; seat < 3; seat += 1) {
    const seatX = x - width / 2 + 0.2 + seatWidth / 2 + seat * seatWidth
    parts.fabric.push(roundedBox([seatWidth - 0.01, 0.14, 0.66], [seatX, baseY + 0.31, z - 0.08], 0.05))
    parts.fabric.push(roundedBox([seatWidth - 0.01, 0.4, 0.17], [seatX, baseY + 0.5, z + 0.3], 0.07, [0.16, 0, 0]))
  }
  for (const side of [-1, 1]) parts.fabric.push(roundedBox([0.2, 0.5, depth], [x + side * (width / 2 - 0.1), baseY + 0.25, z], 0.05))
  parts.fabric.push(roundedBox([0.4, 0.38, 0.12], [x - width / 2 + 0.42, baseY + 0.55, z + 0.08], 0.05, [0.25, 0.3, -0.12]))
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    parts.steel.push(block([0.05, 0.08, 0.05], [x + dx * (width / 2 - 0.12), deckTop + 0.04, z + dz * (depth / 2 - 0.1)]))
  }
}

function addFloorLamp(parts: Parts): void {
  const { x, z, shadeY, shadeRadius, shadeHeight } = floorLamp
  const hub: Vec3 = [x, deckTop + 0.75, z]
  for (let leg = 0; leg < 3; leg += 1) {
    const angle = (leg / 3) * Math.PI * 2 + 0.4
    parts.steel.push(cylinderBetween([x + Math.cos(angle) * 0.32, deckTop, z + Math.sin(angle) * 0.32], hub, 0.011, 6))
  }
  parts.steel.push(cylinderBetween(hub, [x, shadeY - shadeHeight / 2 + 0.05, z], 0.012, 8))
  parts.warm.push(tinted(place(new CylinderGeometry(shadeRadius, shadeRadius * 1.05, shadeHeight, 36, 1, true), [x, shadeY, z]), new Color(0.32, 0.32, 0.32)))
  parts.warm.push(tinted(place(new CylinderGeometry(shadeRadius * 0.98, shadeRadius * 0.98, 0.004, 36), [x, shadeY - shadeHeight / 2 + 0.01, z]), new Color(1, 1, 1)))
  parts.steel.push(place(new TorusGeometry(shadeRadius * 1.05, 0.005, 6, 36), [x, shadeY - shadeHeight / 2, z], [Math.PI / 2, 0, 0]))
  parts.steel.push(place(new TorusGeometry(shadeRadius, 0.005, 6, 36), [x, shadeY + shadeHeight / 2, z], [Math.PI / 2, 0, 0]))
}

function addHoleRailing(parts: Parts): void {
  const sides: readonly (readonly [readonly [number, number], readonly [number, number]])[] = [
    [[-holeHalf, -holeHalf], [holeHalf, -holeHalf]],
    [[-holeHalf, -holeHalf], [-holeHalf, holeHalf]],
    [[-holeHalf, holeHalf], [holeHalf, holeHalf]],
  ]
  for (const [from, to] of sides) {
    parts.steel.push(cylinderBetween([from[0], railHeight, from[1]], [to[0], railHeight, to[1]], 0.024, 10))
    parts.steel.push(cylinderBetween([from[0], 0.55, from[1]], [to[0], 0.55, to[1]], 0.012, 8))
    const alongX = from[1] === to[1]
    const kickMin: Vec3 = alongX ? [from[0], 0, from[1] - 0.004] : [from[0] - 0.004, 0, from[1]]
    const kickMax: Vec3 = alongX ? [to[0], 0.1, to[1] + 0.004] : [to[0] + 0.004, 0.1, to[1]]
    parts.steel.push(blockBetween(kickMin, kickMax))
    for (let t = 0; t <= 1.001; t += 0.25) {
      const x = from[0] + (to[0] - from[0]) * t
      const z = from[1] + (to[1] - from[1]) * t
      parts.steel.push(cylinderBetween([x, 0, z], [x, railHeight, z], 0.021, 10))
      parts.steel.push(place(new CylinderGeometry(0.06, 0.06, 0.012, 14), [x, 0.006, z]))
    }
  }
}

const ledWallFragmentHeader = `
uniform float uWallPower;
uniform vec2 uLedGrid;
uniform vec3 uWallOff;
`

const ledWallFragment = `
  vec2 ledCell = vMapUv * uLedGrid;
  vec2 ledLocal = fract( ledCell ) - 0.5;
  float ledDot = 1.0 - smoothstep( 0.26, 0.46, length( ledLocal ) );
  vec2 ledFootprint = fwidth( ledCell );
  float ledVisible = 1.0 - smoothstep( 0.12, 0.38, max( ledFootprint.x, ledFootprint.y ) );
  float ledMask = mix( 1.0, 0.3 + 1.4 * ledDot, ledVisible * 0.8 );
  vec2 wallEdge = min( vMapUv, 1.0 - vMapUv );
  float wallFalloff = 0.9 + 0.1 * smoothstep( 0.0, 0.1, min( wallEdge.x, wallEdge.y ) );
  diffuseColor.rgb = uWallOff + ( diffuseColor.rgb * wallFalloff * ledMask + 0.01 ) * uWallPower;
`

interface LedWallMaterial {
  material: MeshBasicMaterial
  setPower(power: number): void
}

function createLedWallMaterial(portrait: Texture, aspect: number): LedWallMaterial {
  const uniforms = {
    uWallPower: { value: 0 },
    uLedGrid: { value: new Vector2(Math.round(ledGridRows * aspect), ledGridRows) },
    uWallOff: { value: new Color('#0B0D10') },
  }
  const material = new MeshBasicMaterial({ map: portrait })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ledWallFragmentHeader}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${ledWallFragment}`)
  }
  material.customProgramCacheKey = () => 'led-wall'
  return {
    material,
    setPower(power) {
      uniforms.uWallPower.value = power
    },
  }
}

const equaliserVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`

const haloVertexShader = `
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`

const haloFragmentShader = `
uniform vec3 uColor;
uniform vec2 uHalfSize;
uniform float uReach;
varying vec2 vLocal;
void main() {
  float outside = length( max( abs( vLocal ) - uHalfSize, 0.0 ) );
  float glow = exp( -outside / uReach ) * smoothstep( 0.0, 0.08, outside );
  gl_FragColor = vec4( uColor * glow, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function createHaloMaterial(color: Color, halfWidth: number, halfHeight: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: color }, uHalfSize: { value: new Vector2(halfWidth, halfHeight) }, uReach: { value: haloReach } },
    vertexShader: haloVertexShader,
    fragmentShader: haloFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

const equaliserFragmentShader = `
uniform vec3 uColor;
uniform float uLevel;
uniform float uTime;
varying vec2 vUv;
float equaliserHash( float seed ) {
  return fract( sin( seed * 91.17 ) * 43758.5453 );
}
float equaliserNoise( float value ) {
  float cell = floor( value );
  float blend = fract( value );
  blend = blend * blend * ( 3.0 - 2.0 * blend );
  return mix( equaliserHash( cell ), equaliserHash( cell + 1.0 ), blend );
}
void main() {
  float bars = 32.0;
  float bar = floor( vUv.x * bars );
  float within = fract( vUv.x * bars );
  float gap = smoothstep( 0.1, 0.24, within ) * ( 1.0 - smoothstep( 0.76, 0.9, within ) );
  float centre = 1.0 - abs( ( bar + 0.5 ) / bars * 2.0 - 1.0 );
  float drift = equaliserNoise( bar * 0.41 + uTime * 0.16 ) * 0.6 + equaliserNoise( bar * 0.13 - uTime * 0.09 + 7.0 ) * 0.4;
  float height = 0.3 + 0.35 * centre + 0.16 * drift;
  float lit = 1.0 - smoothstep( height - 0.06, height + 0.06, vUv.y );
  float glow = gap * ( 0.05 + 0.95 * lit ) * ( 0.75 + 0.25 * vUv.y );
  gl_FragColor = vec4( uColor * glow * uLevel, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function createEqualiserMaterial(color: ColorRepresentation): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uLevel: { value: 0 }, uTime: { value: 0 } },
    vertexShader: equaliserVertexShader,
    fragmentShader: equaliserFragmentShader,
  })
}

const woodGrainAlbedo = `
  float grainField = surfaceFbm( vSurfacePosition * vec3( 0.55, 7.0, 24.0 ) );
  float grainLines = 0.5 + 0.5 * sin( vSurfacePosition.z * 210.0 + grainField * 9.0 );
  diffuseColor.rgb *= 0.84 + 0.2 * grainField + 0.07 * grainLines;
`

const woodGrainRoughness = `
  roughnessFactor = clamp( roughnessFactor + ( grainField - 0.5 ) * 0.18 - grainLines * 0.04, 0.3, 1.0 );
`

function imageAspect(texture: Texture): number {
  const image = texture.image as { width?: number; height?: number } | null
  if (!image?.width || !image.height || image.width < 8) return fallbackPortraitAspect
  return image.width / image.height
}

function luminanceOf(color: Color): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
}

export const createLoungeFloor: FloorFactory = (context) => {
  const { textures } = context
  const root = new Group()
  root.name = 'lounge'
  root.position.y = floorBase.lounge

  const aspect = imageAspect(textures.portrait)
  const wallWidth = wall.height * aspect
  const areaEmitter = createAreaEmitter({ centre: [wall.x, floorBase.lounge + wallCentreY, wall.z], width: wallWidth, height: wall.height, yaw: 0 })
  const portraitAverage = averageTextureColor(textures.portrait, '#5A5F7A')
  const spillColor = portraitAverage.clone().lerp(new Color('#7F93C9'), 0.35)
  spillColor.multiplyScalar(spillLuminance / Math.max(luminanceOf(spillColor), 1e-3))

  const parts = createParts()
  addDeck(parts)
  addLightWall(parts, wallWidth)
  addBooth(parts)
  addCrate(parts)
  addRack(parts)
  addSofa(parts)
  addFloorLamp(parts)
  addHoleRailing(parts)

  const woodMaterial = litByArea(
    patchSurface(new MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0 }), {
      key: 'deck-wood',
      albedo: woodGrainAlbedo,
      roughness: woodGrainRoughness,
    }),
    areaEmitter,
  )
  const steelMaterial = litByArea(
    paintedSteelMaterial({ paint: '#24272D', cellsPerMetre: 3.2, chipShare: 0.1, groundY: floorBase.lounge + deckTop, grimeHeight: 0.4 }),
    areaEmitter,
  )
  const aluminiumMaterial = litByArea(
    withSurfaceBreakup(new MeshStandardMaterial({ color: '#A7ABB1', roughness: 0.36, metalness: 1 }), aluminiumBreakup),
    areaEmitter,
  )
  const gearMaterial = litByArea(
    withSurfaceBreakup(new MeshStandardMaterial({ vertexColors: true, roughness: 0.46, metalness: 0.1 }), gearBreakup),
    areaEmitter,
  )
  const fabricMaterial = litByArea(
    withSurfaceBreakup(new MeshStandardMaterial({ color: '#3B4250', roughness: 0.96, metalness: 0 }), fabricBreakup),
    areaEmitter,
  )

  const wood = new Mesh(merge(parts.wood), woodMaterial)
  wood.receiveShadow = true
  const steel = new Mesh(merge(parts.steel), steelMaterial)
  const aluminium = new Mesh(merge(parts.aluminium), aluminiumMaterial)
  const gear = new Mesh(merge(parts.gear), gearMaterial)
  const fabric = new Mesh(merge(parts.fabric), fabricMaterial)
  for (const mesh of [steel, gear]) mesh.castShadow = true
  for (const mesh of [steel, gear, fabric]) mesh.receiveShadow = true

  const warmEmitter = createEmitter(palette.warm, 1, { vertexColors: true, side: DoubleSide })
  const warmLights = new Mesh(merge(parts.warm), warmEmitter.material)

  const ledWall = createLedWallMaterial(textures.portrait, aspect)
  const diffuser = new Mesh(new PlaneGeometry(wallWidth, wall.height), ledWall.material)
  diffuser.position.set(wall.x, wallCentreY, wall.z)

  const wallHaloColor = new Color(0, 0, 0)
  const wallHaloMaterial = createHaloMaterial(wallHaloColor, wallWidth / 2 + wall.bezel, wall.height / 2 + wall.bezel)
  const wallHalo = new Mesh(new PlaneGeometry(wallWidth + haloMargin * 2, wall.height + haloMargin * 2), wallHaloMaterial)
  wallHalo.position.set(wall.x, wallCentreY, wall.z + wall.lip + 0.02)
  wallHalo.renderOrder = 2

  const equaliserMaterial = createEqualiserMaterial(palette.warm)
  const equaliserStrip = new Mesh(new PlaneGeometry(equaliser.width, equaliser.height), equaliserMaterial)
  equaliserStrip.position.set(booth.x, equaliser.y, boothFront + 0.008)

  const glow = createGlowTexture()
  const warm = new Color(palette.warm)
  const poolStrengths = [0.22, 0.3, 0.22] as const
  const poolMatrices = [
    composeMatrix([floorLamp.x - 0.15, deckTop + 0.003, floorLamp.z - 0.1], [-Math.PI / 2, 0, 0], [2.6, 2.6, 1]),
    composeMatrix([booth.x + 0.06, boothTop + 0.002, booth.z - 0.02], [-Math.PI / 2, 0, 0], [0.7, 0.55, 1]),
    composeMatrix([booth.x + 0.04, boothTop + 0.077, booth.z - 0.02], [-Math.PI / 2, 0, 0], [0.32, 0.36, 1]),
  ]

  const idleLed = new Color(palette.signal).lerp(new Color('#7FA0FF'), 0.35)
  const hoverLed = new Color(palette.warm)
  const ledColor = new Color()
  const ledMatrices = Array.from({ length: serviceCount }, (_, unit) =>
    composeMatrix(rackPoint(0.2, rackUnitY(unit), rackFace + 0.004), [0, rack.yaw, 0]),
  )
  const leds = instances(
    new RoundedBoxGeometry(0.05, 0.016, 0.006, 2, 0.003),
    new MeshBasicMaterial(),
    ledMatrices,
    ledMatrices.map(() => idleLed),
  )
  const haloMatrices = Array.from({ length: serviceCount }, (_, unit) =>
    composeMatrix(rackPoint(0.2, rackUnitY(unit), rackFace + 0.012), [0, rack.yaw, 0], [0.16, 0.08, 1]),
  )
  const glows = instances(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, blending: AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }),
    [...poolMatrices, ...haloMatrices],
    [...poolMatrices, ...haloMatrices].map(() => warm),
  )
  glows.renderOrder = 2

  const ledEmphasis = new Array<number>(serviceCount).fill(0)
  const ledTarget = new Array<number>(serviceCount).fill(0)
  const proxies: InteractiveProxy[] = Array.from({ length: serviceCount }, (_, unit) =>
    createProxy({
      id: `lounge-service-${unit}`,
      chapters: ['about'],
      geometry: new BoxGeometry(rack.width + 0.04, rack.pitch - 0.006, 0.3),
      position: rackPoint(0, rackUnitY(unit), rackFace - 0.1),
      rotationY: rack.yaw,
      onState(state) {
        ledTarget[unit] = emphasisOf(state)
      },
    }),
  )

  root.add(wood, steel, aluminium, gear, fabric, warmLights, diffuser, wallHalo, equaliserStrip, glows, leds, ...proxies.map((proxy) => proxy.object))

  const closeDetails = [aluminium, warmLights, equaliserStrip, glows, leds]
  const clock = createSceneClock()
  let power = 0

  function wallPowerTarget(progress: number): number {
    const arrival = smoothstep(chapterIndex.teaching - 0.3, chapterIndex.about - 0.15, progress)
    const farewell = 1 - 0.4 * smoothstep(chapterIndex.about + 0.2, chapterIndex.sayHi - 0.1, progress)
    return arrival * farewell
  }

  function update(frame: FrameState): void {
    const { world, reducedMotion, dt } = frame
    const time = clock(frame)
    const detailed = withinChapters(frame.progress.smooth, chapterIndex.aiCoding + 0.5, chapterIndex.about + 0.75)
    for (const detail of closeDetails) detail.visible = detailed
    const target = wallPowerTarget(frame.progress.smooth)
    power = reducedMotion ? target : approach(power, target, 1.6, dt)

    ledWall.setPower(power * wallLuminance)
    areaEmitter.radiance.copy(spillColor).multiplyScalar(power)
    wallHaloColor.copy(spillColor).multiplyScalar(power * haloStrength)

    const practical = 0.3 + 0.7 * world.practicals
    warmEmitter.set(1.6 * practical)
    poolStrengths.forEach((strength, index) => glows.setColorAt(index, ledColor.copy(warm).multiplyScalar(strength * practical)))
    equaliserMaterial.uniforms.uLevel.value = 0.9 * practical * (0.35 + 0.65 * power)
    equaliserMaterial.uniforms.uTime.value = time

    for (let unit = 0; unit < serviceCount; unit += 1) {
      ledEmphasis[unit] = reducedMotion ? ledTarget[unit] : approach(ledEmphasis[unit], ledTarget[unit], 8, dt)
      const calm = reducedMotion ? 1 : breathe(time, 4.6 + unit * 0.37, 0.1, unit * 0.17)
      ledColor.copy(idleLed).lerp(hoverLed, ledEmphasis[unit]).multiplyScalar((1.4 + ledEmphasis[unit] * 1.6) * calm)
      leds.setColorAt(unit, ledColor)
      glows.setColorAt(poolStrengths.length + unit, ledColor.multiplyScalar(0.28))
    }
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true
    if (glows.instanceColor) glows.instanceColor.needsUpdate = true
  }

  function dispose(): void {
    disposeTree(root)
    glow.dispose()
  }

  return { id: 'lounge', root, proxies, update, dispose }
}
