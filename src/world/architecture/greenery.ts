import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
} from 'three'
import { composeMatrix, createRandom, cylinderBetween, instances, merge, place } from '../geometry'
import { floorBase, palette, towerSpec } from '../floors/kit'
import { createSceneClock } from '../floors/kit-upper'
import type { FrameState, Vec3 } from '../types'
import { bakeOcclusion, smooth } from './occlusion'
import { planter, planterRuns, plateTop, terraceList, type EdgeRun, type Point } from './terraces'

export const greenerySeed = 4817
export const plantKinds = ['clump', 'palm', 'fern', 'vine'] as const
export type PlantKind = (typeof plantKinds)[number]
const shadowCasters: readonly PlantKind[] = ['clump', 'palm']

export interface PlantDensity {
  plants: number
  vines: number
}

export const desktopDensity: PlantDensity = { plants: 1, vines: 1 }
export const mobileDensity: PlantDensity = { plants: 0.5, vines: 0.7 }

export interface Placement {
  position: Vec3
  yaw: number
  scale: number
  tint: Color
}

export type PlantingPlan = Readonly<Record<PlantKind, Placement[]>>

const clumpHeight = 2.2
const palmTrunk = { height: 2.4, radiusTop: 0.08, radiusBase: 0.13, fronds: 8 } as const
const fernReach = 0.8
const vineLength = 5
const perMetre = { clump: 0.9, palm: 0.3, fern: 1.6, vine: 1.4 } as const
const gardenFloor = floorBase.rocket
const gardenHalf = towerSpec.halfSize - 0.5
const gardenCells = { clump: 1.6, palm: 3.2, fern: 1.1 } as const
const gardenKeep = { clump: 0.62, palm: 0.75, fern: 0.6 } as const
const gardenPath = { fromX: 1, halfWidth: 1.1 } as const
const gardenFrontEdge = { minX: 0, maxX: 6.5, z: towerSpec.halfSize + 0.1 } as const
const deckLintel = { x: towerSpec.halfSize + towerSpec.wallThickness - 0.08, minZ: -3.6, maxZ: 3.6, y: floorBase.rocket + 3.05 } as const
const phaseWeights: Vec3 = [0.37, 0.11, 0.53]
const swayAmplitude = { across: 0.16, along: 0.11 } as const
const flutterAmplitude = 0.035
const gustSpeed = 0.6
const scatteredFill = 0.12

interface LeafProfile {
  length: number
  width: number
  bias: number
  taper: number
  notches: number
  notchDepth: number
  notchSharpness: number
  lift: number
  droop: number
  fold: number
  segments: number
}

const monsteraLeaf: LeafProfile = { length: 0.8, width: 0.62, bias: 0.7, taper: 0.9, notches: 4, notchDepth: 0.55, notchSharpness: 6, lift: 0.25, droop: 0.35, fold: -0.16, segments: 24 }
const bananaLeaf: LeafProfile = { length: 1.8, width: 0.5, bias: 1, taper: 0.45, notches: 3, notchDepth: 0.35, notchSharpness: 24, lift: 0.5, droop: 0.65, fold: -0.2, segments: 26 }
const palmFrond: LeafProfile = { length: 1.6, width: 0.5, bias: 0.5, taper: 0.8, notches: 16, notchDepth: 0.75, notchSharpness: 1.3, lift: 0.45, droop: 0.75, fold: 0.25, segments: 40 }
const fernFrond: LeafProfile = { length: 0.75, width: 0.22, bias: 0.6, taper: 0.7, notches: 18, notchDepth: 0.6, notchSharpness: 1.2, lift: 0.9, droop: 0.6, fold: 0.15, segments: 32 }
const pothosLeaf: LeafProfile = { length: 0.24, width: 0.2, bias: 0.65, taper: 0.9, notches: 0, notchDepth: 0, notchSharpness: 1, lift: 0.1, droop: 0.35, fold: -0.1, segments: 6 }

function halfWidth(profile: LeafProfile, t: number): number {
  const spread = Math.pow(Math.sin(Math.PI * Math.pow(t, profile.bias)), profile.taper)
  const notch = profile.notches > 0 ? Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * profile.notches * t), profile.notchSharpness) : 0
  return (profile.width / 2) * spread * (1 - profile.notchDepth * notch)
}

function leafGeometry(profile: LeafProfile, scale = 1): BufferGeometry {
  const shape = new Shape()
  shape.moveTo(0, 0)
  for (let step = 1; step < profile.segments; step += 1) {
    const t = step / profile.segments
    shape.lineTo(halfWidth(profile, t) * scale, t * profile.length * scale)
  }
  shape.lineTo(0, profile.length * scale)
  for (let step = profile.segments - 1; step >= 1; step -= 1) {
    const t = step / profile.segments
    shape.lineTo(-halfWidth(profile, t) * scale, t * profile.length * scale)
  }
  shape.closePath()
  const geometry = new ShapeGeometry(shape)
  const position = geometry.getAttribute('position')
  const length = profile.length * scale
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const x = position.getX(vertex)
    const along = position.getY(vertex) / length
    const arch = length * (profile.lift * along - (profile.lift + profile.droop) * along * along)
    position.setXYZ(vertex, x, arch + profile.fold * Math.abs(x), along * length)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

function orientedLeaf(profile: LeafProfile, base: Vec3, yaw: number, pitch: number, scale: number): BufferGeometry {
  return place(place(leafGeometry(profile, scale), [0, 0, 0], [-pitch, 0, 0]), base, [0, yaw, 0])
}

type Random = () => number

function between(random: Random, low: number, high: number): number {
  return low + (high - low) * random()
}

function broadLeafClump(random: Random): BufferGeometry {
  const parts: BufferGeometry[] = []
  const leaves = [monsteraLeaf, monsteraLeaf, monsteraLeaf, bananaLeaf, bananaLeaf]
  leaves.forEach((profile, index) => {
    const yaw = (index / leaves.length) * Math.PI * 2 + between(random, -0.4, 0.4)
    const banana = profile === bananaLeaf
    const height = banana ? between(random, 0.9, 1.5) : between(random, 0.45, 1.1)
    const reach = between(random, 0.1, 0.3)
    const base: Vec3 = [Math.sin(yaw) * reach, height, Math.cos(yaw) * reach]
    parts.push(cylinderBetween([0, 0, 0], base, 0.02, 5))
    parts.push(orientedLeaf(profile, base, yaw, between(random, 0.2, 0.6), between(random, 0.85, 1.15)))
  })
  const geometry = merge(parts)
  bakeOcclusion(geometry, (_x, y) => 0.45 + 0.55 * smooth(0, clumpHeight * 0.8, y))
  return withSway(geometry, (_x, y) => Math.pow(Math.min(1, y / clumpHeight), 1.6))
}

function palm(random: Random): BufferGeometry {
  const { height, radiusTop, radiusBase, fronds } = palmTrunk
  const parts: BufferGeometry[] = [place(new CylinderGeometry(radiusTop, radiusBase, height, 7), [0, height / 2, 0])]
  for (let frond = 0; frond < fronds; frond += 1) {
    const yaw = (frond / fronds) * Math.PI * 2 + between(random, -0.25, 0.25)
    parts.push(orientedLeaf(palmFrond, [0, height, 0], yaw, between(random, 0.35, 0.9), between(random, 0.85, 1.1)))
  }
  for (const yaw of [between(random, 0, Math.PI), between(random, Math.PI, Math.PI * 2)]) {
    parts.push(orientedLeaf(palmFrond, [0, height + 0.05, 0], yaw, 1.35, 0.55))
  }
  const geometry = merge(parts)
  bakeOcclusion(geometry, (x, y, z) => 0.5 + 0.5 * Math.max(smooth(0, height * 0.9, y) * 0.6, smooth(0, 1.2, Math.hypot(x, z))))
  return withSway(geometry, (x, y, z) => Math.pow(Math.min(1, y / height), 3) * 0.4 + Math.min(1, Math.hypot(x, z) / palmFrond.length) * 0.8)
}

function fernClump(random: Random): BufferGeometry {
  const parts: BufferGeometry[] = []
  const fronds = 9
  for (let frond = 0; frond < fronds; frond += 1) {
    const yaw = (frond / fronds) * Math.PI * 2 + between(random, -0.3, 0.3)
    parts.push(orientedLeaf(fernFrond, [0, 0.04, 0], yaw, between(random, 0.8, 1.3), between(random, 0.75, 1.15)))
  }
  const geometry = merge(parts)
  bakeOcclusion(geometry, (x, _y, z) => 0.4 + 0.6 * smooth(0, fernReach * 0.7, Math.hypot(x, z)))
  return withSway(geometry, (x, _y, z) => Math.pow(Math.min(1, Math.hypot(x, z) / fernReach), 1.5) * 0.8)
}

function vineStrand(random: Random, length: number, offset: Vec3): BufferGeometry[] {
  const parts: BufferGeometry[] = []
  const segments = Math.max(4, Math.round(length * 2))
  const phase = between(random, 0, Math.PI * 2)
  const points: Vec3[] = []
  for (let segment = 0; segment <= segments; segment += 1) {
    const drop = (segment / segments) * length
    points.push([offset[0] + 0.16 * Math.sin(drop * 0.9 + phase), offset[1] - drop, offset[2] + 0.16 * Math.cos(drop * 0.7 + phase)])
  }
  for (let segment = 0; segment < segments; segment += 1) {
    parts.push(cylinderBetween(points[segment], points[segment + 1], 0.012, 4))
  }
  const leafPitch = 0.3
  for (let drop = 0.2; drop < length; drop += leafPitch) {
    const segment = Math.min(segments - 1, Math.floor((drop / length) * segments))
    const t = (drop / length) * segments - segment
    const [ax, ay, az] = points[segment]
    const [bx, by, bz] = points[segment + 1]
    const base: Vec3 = [ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t]
    parts.push(orientedLeaf(pothosLeaf, base, between(random, 0, Math.PI * 2), between(random, -1.1, -0.5), between(random, 0.8, 1.2)))
  }
  return parts
}

function vine(random: Random): BufferGeometry {
  const parts = [...vineStrand(random, vineLength, [0, 0, 0]), ...vineStrand(random, vineLength * 0.6, [between(random, -0.2, 0.2), -0.1, between(random, -0.2, 0.2)])]
  const geometry = merge(parts)
  bakeOcclusion(geometry, (_x, y) => 0.55 + 0.45 * smooth(0, vineLength, -y))
  return withSway(geometry, (_x, y) => Math.pow(Math.min(1, -y / vineLength), 1.3))
}

function withSway(geometry: BufferGeometry, weight: (x: number, y: number, z: number) => number): BufferGeometry {
  const position = geometry.getAttribute('position')
  const sway = new Float32Array(position.count)
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    sway[vertex] = Math.min(1, Math.max(0, weight(position.getX(vertex), position.getY(vertex), position.getZ(vertex))))
  }
  geometry.setAttribute('aSway', new Float32BufferAttribute(sway, 1))
  return geometry
}

function plantGeometries(seed: number): Record<PlantKind, BufferGeometry> {
  return {
    clump: broadLeafClump(createRandom(seed + 1)),
    palm: palm(createRandom(seed + 2)),
    fern: fernClump(createRandom(seed + 3)),
    vine: vine(createRandom(seed + 4)),
  }
}

function foliageTint(random: Random): Color {
  const tint = new Color(palette.foliage).lerp(new Color(palette.foliageLight), Math.pow(random(), 1.4))
  tint.r *= between(random, 0.9, 1.1)
  tint.g *= between(random, 0.92, 1.08)
  tint.b *= between(random, 0.85, 1.15)
  return tint
}

function alongRun(run: EdgeRun, t: number, outward: number): Point {
  return [run.from[0] + (run.to[0] - run.from[0]) * t + run.normal[0] * outward, run.from[1] + (run.to[1] - run.from[1]) * t + run.normal[1] * outward]
}

function stationsAlong(run: EdgeRun, density: number, random: Random): number[] {
  const length = Math.hypot(run.to[0] - run.from[0], run.to[1] - run.from[1])
  const count = Math.round(length * density)
  return Array.from({ length: count }, (_, index) => (index + 0.5) / count + between(random, -0.3, 0.3) / count)
}

function plantRows(plan: Record<PlantKind, Placement[]>, random: Random, density: PlantDensity): void {
  const lip = planter.inset + planter.width / 2 - 0.04
  for (const spec of terraceList) {
    const soil = plateTop(spec.level) + planter.height
    for (const run of planterRuns(spec)) {
      for (const t of stationsAlong(run, perMetre.clump * density.plants, random)) {
        const [x, z] = alongRun(run, t, between(random, -0.08, 0.08))
        plan.clump.push({ position: [x, soil, z], yaw: between(random, 0, Math.PI * 2), scale: between(random, 0.75, 1.1), tint: foliageTint(random) })
      }
      for (const t of stationsAlong(run, perMetre.palm * density.plants, random)) {
        const [x, z] = alongRun(run, t, 0)
        plan.palm.push({ position: [x, soil, z], yaw: between(random, 0, Math.PI * 2), scale: between(random, 0.8, 1.2), tint: foliageTint(random) })
      }
      for (const t of stationsAlong(run, perMetre.fern * density.plants, random)) {
        const [x, z] = alongRun(run, t, between(random, -0.14, 0.1))
        plan.fern.push({ position: [x, soil, z], yaw: between(random, 0, Math.PI * 2), scale: between(random, 0.7, 1.1), tint: foliageTint(random) })
      }
      for (const t of stationsAlong(run, perMetre.vine * density.vines, random)) {
        const [x, z] = alongRun(run, t, lip)
        plan.vine.push({ position: [x, plateTop(spec.level) + 0.05, z], yaw: between(random, 0, Math.PI * 2), scale: between(random, 0.5, 1.3), tint: foliageTint(random) })
      }
    }
  }
}

function insideGarden(x: number, z: number): boolean {
  const { core } = towerSpec
  const inCore = x < core.maxX + 0.4 && z < core.maxZ + 0.4
  const onPath = x > gardenPath.fromX && Math.abs(z) < gardenPath.halfWidth
  return !inCore && !onPath
}

function gardenGrid(plan: Record<PlantKind, Placement[]>, random: Random, density: PlantDensity): void {
  for (const kind of ['clump', 'palm', 'fern'] as const) {
    const cell = gardenCells[kind]
    const keep = gardenKeep[kind] * density.plants
    for (let x = -gardenHalf + cell / 2; x < gardenHalf; x += cell) {
      for (let z = -gardenHalf + cell / 2; z < gardenHalf; z += cell) {
        const px = x + between(random, -0.35, 0.35) * cell
        const pz = z + between(random, -0.35, 0.35) * cell
        const roll = random()
        if (roll > keep || !insideGarden(px, pz)) continue
        const scale = kind === 'palm' ? between(random, 0.8, 1.1) : between(random, 0.8, 1.2)
        plan[kind].push({ position: [px, gardenFloor, pz], yaw: between(random, 0, Math.PI * 2), scale, tint: foliageTint(random) })
      }
    }
  }
}

function gardenSpill(plan: Record<PlantKind, Placement[]>, random: Random, density: PlantDensity): void {
  const frontCount = Math.round((gardenFrontEdge.maxX - gardenFrontEdge.minX) * 0.8 * density.vines)
  for (let index = 0; index < frontCount; index += 1) {
    const x = gardenFrontEdge.minX + ((index + 0.5) / frontCount) * (gardenFrontEdge.maxX - gardenFrontEdge.minX) + between(random, -0.3, 0.3)
    plan.vine.push({ position: [x, gardenFloor + 0.05, gardenFrontEdge.z], yaw: between(random, 0, Math.PI * 2), scale: between(random, 0.3, 0.65), tint: foliageTint(random) })
  }
  const lintelCount = Math.round((deckLintel.maxZ - deckLintel.minZ) * 0.6 * density.vines)
  for (let index = 0; index < lintelCount; index += 1) {
    const z = deckLintel.minZ + ((index + 0.5) / lintelCount) * (deckLintel.maxZ - deckLintel.minZ) + between(random, -0.3, 0.3)
    plan.vine.push({ position: [deckLintel.x, deckLintel.y, z], yaw: between(random, 0, Math.PI * 2), scale: between(random, 0.25, 0.45), tint: foliageTint(random) })
  }
}

export function plantingPlan(seed: number, density: PlantDensity): PlantingPlan {
  const random = createRandom(seed)
  const plan: Record<PlantKind, Placement[]> = { clump: [], palm: [], fern: [], vine: [] }
  plantRows(plan, random, density)
  gardenGrid(plan, random, density)
  gardenSpill(plan, random, density)
  return plan
}

export function plantCounts(plan: PlantingPlan): Record<PlantKind, number> {
  return { clump: plan.clump.length, palm: plan.palm.length, fern: plan.fern.length, vine: plan.vine.length }
}

function placementMatrix({ position, yaw, scale }: Placement): Matrix4 {
  return composeMatrix(position, [0, yaw, 0], [scale, scale, scale])
}

function placementPhase({ position }: Placement): number {
  return position[0] * phaseWeights[0] + position[1] * phaseWeights[1] + position[2] * phaseWeights[2]
}

const swayVertex = `
float swayWave = sin( uWind * 0.9 + aPhase ) * 0.6 + sin( uWind * 1.5 + aPhase * 1.7 ) * 0.4;
float swayGust = 0.45 + 0.55 * smoothstep( -0.4, 1.0, sin( uWind * ${gustSpeed.toFixed(2)} - aPhase * 0.35 ) );
float swayReach = aSway * swayGust;
transformed.xz += swayWave * swayReach * vec2( ${swayAmplitude.across.toFixed(3)}, ${swayAmplitude.along.toFixed(3)} );
float flutter = sin( uWind * 6.1 + aPhase * 3.0 + position.x * 9.0 + position.z * 7.0 ) * 0.6 + sin( uWind * 9.7 + position.y * 11.0 ) * 0.4;
transformed.y += flutter * aSway * aSway * swayGust * ${flutterAmplitude.toFixed(3)};
transformed.x += flutter * aSway * aSway * ${(flutterAmplitude * 0.5).toFixed(4)};
`

function foliageMaterial(wind: { value: number }): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.72, metalness: 0, side: DoubleSide, vertexColors: true })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSway;\nattribute float aPhase;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${swayVertex}`)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * ${scatteredFill.toFixed(2)};`,
    )
  }
  material.customProgramCacheKey = () => 'foliage-wind'
  return material
}

function instancedFoliage(kind: PlantKind, geometry: BufferGeometry, placements: readonly Placement[], material: MeshStandardMaterial): Mesh {
  geometry.setAttribute('aPhase', new InstancedBufferAttribute(new Float32Array(placements.map(placementPhase)), 1))
  const mesh = instances(geometry, material, placements.map(placementMatrix), placements.map(({ tint }) => tint))
  mesh.name = `foliage-${kind}`
  return mesh
}

function bakedFoliage(geometries: Record<PlantKind, BufferGeometry>, plan: PlantingPlan, material: MeshStandardMaterial): Mesh {
  const parts: BufferGeometry[] = []
  for (const kind of plantKinds) {
    for (const placement of plan[kind]) {
      const part = geometries[kind].clone().applyMatrix4(placementMatrix(placement))
      const color = part.getAttribute('color')
      for (let vertex = 0; vertex < color.count; vertex += 1) {
        color.setXYZ(vertex, color.getX(vertex) * placement.tint.r, color.getY(vertex) * placement.tint.g, color.getZ(vertex) * placement.tint.b)
      }
      part.setAttribute('aPhase', new Float32BufferAttribute(new Float32Array(color.count).fill(placementPhase(placement)), 1))
      parts.push(part)
    }
    geometries[kind].dispose()
  }
  const mesh = new Mesh(merge(parts), material)
  mesh.name = 'foliage-baked'
  return mesh
}

export interface Greenery {
  root: Group
  update(frame: FrameState): void
}

export function createGreenery(mobile: boolean): Greenery {
  const root = new Group()
  root.name = 'greenery'
  const wind = { value: 0 }
  const clock = createSceneClock()
  const material = foliageMaterial(wind)
  const plan = plantingPlan(greenerySeed, mobile ? mobileDensity : desktopDensity)
  const geometries = plantGeometries(greenerySeed)
  if (mobile) {
    const baked = bakedFoliage(geometries, plan, material)
    baked.receiveShadow = true
    root.add(baked)
  } else {
    for (const kind of plantKinds) {
      const mesh = instancedFoliage(kind, geometries[kind], plan[kind], material)
      mesh.castShadow = shadowCasters.includes(kind)
      mesh.receiveShadow = true
      root.add(mesh)
    }
  }
  return {
    root,
    update(frame) {
      wind.value = clock(frame)
    },
  }
}
