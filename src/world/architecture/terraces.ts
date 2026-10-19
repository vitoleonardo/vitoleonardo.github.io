import { BoxGeometry, Color, ExtrudeGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, Shape, type BufferGeometry, type InstancedMesh } from 'three'
import { block, composeMatrix, cylinderBetween, instances, merge, place } from '../geometry'
import { palette, steelMaterial, towerSpec } from '../floors/kit'
import { distanceOutsideTower } from './occlusion'

const wall = towerSpec.halfSize + towerSpec.wallThickness
export const frontCut = towerSpec.halfSize - 0.1
const twistPerLevel = (3.5 * Math.PI) / 180
const terraceMargin = 0.7
const edgeLight = { height: 0.05, depth: 0.05, inset: 0.08, drop: 0.02 } as const
export const plate = { thickness: 0.36, drop: 0.36 } as const
const railing = { height: 1.05, postPitch: 1.3, postRadius: 0.02, railRadius: 0.025, inset: 0.12 } as const
export const planter = { width: 0.45, height: 0.5, inset: 0.3, wallClearance: 0.9, minimumRun: 0.9 } as const
const edgeSamples = 48

export type TerraceSide = 'west' | 'east'

export interface TerraceSpec {
  level: number
  side: TerraceSide
}

export const terraceList: readonly TerraceSpec[] = [
  { level: 5, side: 'west' },
  { level: 6, side: 'west' },
  { level: 3, side: 'east' },
]

export type Point = readonly [x: number, z: number]

interface HalfPlane {
  a: number
  b: number
  c: number
}

export interface EdgeRun {
  from: Point
  to: Point
  normal: Point
}

export interface TerracePiece {
  spec: TerraceSpec
  polygon: Point[]
}

export function terraceHalfSize(level: number): number {
  const angle = level * twistPerLevel
  return wall * (Math.cos(angle) + Math.sin(angle)) + terraceMargin
}

export function plateTop(level: number): number {
  return level * towerSpec.floorHeight - plate.drop
}

export function plateBottom(level: number): number {
  return plateTop(level) - plate.thickness
}

function rotatedSquare(level: number): Point[] {
  const half = terraceHalfSize(level)
  const angle = level * twistPerLevel
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return ([[-half, -half], [half, -half], [half, half], [-half, half]] as const).map(([x, z]): Point => [x * cos - z * sin, x * sin + z * cos])
}

function clipPlanes({ side }: TerraceSpec): HalfPlane[] {
  const front: HalfPlane = { a: 0, b: 1, c: frontCut }
  const outward: HalfPlane = side === 'west' ? { a: 1, b: 0, c: -wall } : { a: -1, b: 0, c: -wall }
  return [outward, front]
}

function insideHalfPlane({ a, b, c }: HalfPlane, [x, z]: Point): boolean {
  return a * x + b * z <= c + 1e-6
}

function clip(polygon: readonly Point[], plane: HalfPlane): Point[] {
  const { a, b, c } = plane
  const output: Point[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[(index + polygon.length - 1) % polygon.length]
    const currentInside = insideHalfPlane(plane, current)
    const previousInside = insideHalfPlane(plane, previous)
    if (currentInside !== previousInside) {
      const t = (c - a * previous[0] - b * previous[1]) / (a * (current[0] - previous[0]) + b * (current[1] - previous[1]))
      output.push([previous[0] + (current[0] - previous[0]) * t, previous[1] + (current[1] - previous[1]) * t])
    }
    if (currentInside) output.push(current)
  }
  return output
}

export function terracePolygon(spec: TerraceSpec): Point[] {
  return clipPlanes(spec).reduce<Point[]>((polygon, plane) => clip(polygon, plane), rotatedSquare(spec.level))
}

export function terracePieces(): TerracePiece[] {
  return terraceList.map((spec) => ({ spec, polygon: terracePolygon(spec) })).filter(({ polygon }) => polygon.length >= 3)
}

export function terraceEdges(spec: TerraceSpec, inset: number, wallClearance = 0, minimumRun = 0): EdgeRun[] {
  const square = rotatedSquare(spec.level)
  const planes = clipPlanes(spec)
  const edges: EdgeRun[] = []
  for (let index = 0; index < square.length; index += 1) {
    const from = square[index]
    const to = square[(index + 1) % square.length]
    const midLength = Math.hypot(from[0] + to[0], from[1] + to[1])
    const normal: Point = [(from[0] + to[0]) / midLength, (from[1] + to[1]) / midLength]
    const onPlate = (point: Point) => planes.every((plane) => insideHalfPlane(plane, point)) && distanceOutsideTower(point[0], point[1]) >= wallClearance
    let run: Point[] = []
    const flush = () => {
      if (run.length >= 2) {
        const [start, end] = [run[0], run[run.length - 1]]
        if (Math.hypot(end[0] - start[0], end[1] - start[1]) >= minimumRun) edges.push({ from: start, to: end, normal })
      }
      run = []
    }
    for (let sample = 0; sample <= edgeSamples; sample += 1) {
      const t = sample / edgeSamples
      const point: Point = [from[0] + (to[0] - from[0]) * t - normal[0] * inset, from[1] + (to[1] - from[1]) * t - normal[1] * inset]
      if (onPlate(point)) run.push(point)
      else flush()
    }
    flush()
  }
  return edges
}

export function planterRuns(spec: TerraceSpec): EdgeRun[] {
  return terraceEdges(spec, planter.inset + planter.width / 2, planter.wallClearance, planter.minimumRun)
}

export function runLength({ from, to }: EdgeRun): number {
  return Math.hypot(to[0] - from[0], to[1] - from[1])
}

export function runYaw({ from, to }: EdgeRun): number {
  return -Math.atan2(to[1] - from[1], to[0] - from[0])
}

function plateGeometry(): BufferGeometry[] {
  return terracePieces().map(({ spec, polygon }) => {
    const shape = new Shape()
    polygon.forEach(([x, z], index) => (index === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)))
    shape.closePath()
    return place(new ExtrudeGeometry(shape, { depth: plate.thickness, bevelEnabled: false }), [0, plateBottom(spec.level), 0], [-Math.PI / 2, 0, 0])
  })
}

function planterGeometry(): BufferGeometry[] {
  const parts: BufferGeometry[] = []
  for (const spec of terraceList) {
    const bottom = plateTop(spec.level)
    for (const run of planterRuns(spec)) {
      const centre: Point = [(run.from[0] + run.to[0]) / 2, (run.from[1] + run.to[1]) / 2]
      parts.push(block([runLength(run), planter.height, planter.width], [centre[0], bottom + planter.height / 2, centre[1]], [0, runYaw(run), 0]))
    }
  }
  return parts
}

export function terraceConcreteGeometry(): BufferGeometry {
  return merge([...plateGeometry(), ...planterGeometry()])
}

function railingGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = []
  for (const spec of terraceList) {
    const deckTop = plateTop(spec.level)
    for (const run of terraceEdges(spec, railing.inset, 0, railing.postPitch)) {
      const { from: start, to: end } = run
      const posts = Math.max(1, Math.round(runLength(run) / railing.postPitch))
      for (let post = 0; post <= posts; post += 1) {
        const t = post / posts
        const x = start[0] + (end[0] - start[0]) * t
        const z = start[1] + (end[1] - start[1]) * t
        parts.push(cylinderBetween([x, deckTop, z], [x, deckTop + railing.height, z], railing.postRadius, 6))
      }
      for (const height of [railing.height, railing.height * 0.55]) {
        parts.push(cylinderBetween([start[0], deckTop + height, start[1]], [end[0], deckTop + height, end[1]], railing.railRadius, 6))
      }
    }
  }
  return merge(parts)
}

interface EdgeLights {
  mesh: InstancedMesh
  levels: readonly number[]
}

function edgeLights(): EdgeLights {
  const matrices: Matrix4[] = []
  const levels: number[] = []
  for (const spec of terraceList) {
    const y = plateBottom(spec.level) - edgeLight.drop
    for (const run of terraceEdges(spec, edgeLight.inset, 0, railing.postPitch)) {
      const centre: Point = [(run.from[0] + run.to[0]) / 2, (run.from[1] + run.to[1]) / 2]
      matrices.push(composeMatrix([centre[0], y, centre[1]], [0, runYaw(run), 0], [runLength(run), edgeLight.height, edgeLight.depth]))
      levels.push(spec.level)
    }
  }
  const mesh = instances(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), matrices, matrices.map(() => '#000000'))
  mesh.name = 'terrace-edge-lights'
  return { mesh, levels }
}

export interface Terraces {
  root: Group
  setEdgeLight(intensityOfLevel: (level: number) => number): void
}

export function createTerraces(): Terraces {
  const root = new Group()
  root.name = 'terraces'
  const railings = new Mesh(railingGeometry(), steelMaterial({ color: '#2A2E35', roughness: 0.42 }))
  railings.name = 'terrace-railings'
  railings.castShadow = true
  railings.receiveShadow = true
  const lights = edgeLights()
  const warm = new Color(palette.warm)
  const scratch = new Color()
  root.add(railings, lights.mesh)
  return {
    root,
    setEdgeLight(intensityOfLevel) {
      lights.levels.forEach((level, index) => {
        lights.mesh.setColorAt(index, scratch.copy(warm).multiplyScalar(intensityOfLevel(level)))
      })
      if (lights.mesh.instanceColor) lights.mesh.instanceColor.needsUpdate = true
    },
  }
}
