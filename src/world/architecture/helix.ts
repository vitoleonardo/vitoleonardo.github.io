import { BoxGeometry, Color, ExtrudeGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, Shape, type BufferGeometry, type InstancedMesh } from 'three'
import { block, composeMatrix, cylinderBetween, instances, merge, place, projectWorldUVs } from '../geometry'
import { concreteMaterial, createEmitter, palette, steelMaterial, towerSpec, type Emitter } from '../floors/kit'
import { bakeOcclusion, wallShade } from './occlusion'
import type { SharedTextures } from '../types'

const wall = towerSpec.halfSize + towerSpec.wallThickness
export const frontCut = towerSpec.halfSize - 0.1
const twistPerLevel = (3.5 * Math.PI) / 180
const terraceMargin = 0.7
const deckLevel = 5
export const topTerrace = 6
const edgeLight = { height: 0.05, depth: 0.05, inset: 0.08, drop: 0.02 } as const
const plate = { thickness: 0.36, drop: 0.36 } as const
const railing = { height: 1.05, postPitch: 1.3, postRadius: 0.02, railRadius: 0.025, inset: 0.12 } as const
const spine = { z: towerSpec.core.minZ + (towerSpec.core.maxZ - towerSpec.core.minZ) / 2, width: 0.14, proud: 0.06, bottom: 0.4, top: 30.8 } as const
const concreteTile = 2.4

export type Point = readonly [x: number, z: number]

interface HalfPlane {
  a: number
  b: number
  c: number
}

interface Edge {
  from: Point
  to: Point
  normal: Point
}

export function helixHalfSize(level: number): number {
  const angle = level * twistPerLevel
  return wall * (Math.cos(angle) + Math.sin(angle)) + terraceMargin
}

function rotatedSquare(level: number): Point[] {
  const half = helixHalfSize(level)
  const angle = level * twistPerLevel
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return ([[-half, -half], [half, -half], [half, half], [-half, half]] as const).map(([x, z]): Point => [x * cos - z * sin, x * sin + z * cos])
}

function clip(polygon: readonly Point[], { a, b, c }: HalfPlane): Point[] {
  const inside = ([x, z]: Point) => a * x + b * z <= c
  const output: Point[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[(index + polygon.length - 1) % polygon.length]
    const currentInside = inside(current)
    const previousInside = inside(previous)
    if (currentInside !== previousInside) {
      const t = (c - a * previous[0] - b * previous[1]) / (a * (current[0] - previous[0]) + b * (current[1] - previous[1]))
      output.push([previous[0] + (current[0] - previous[0]) * t, previous[1] + (current[1] - previous[1]) * t])
    }
    if (currentInside) output.push(current)
  }
  return output
}

function hasEastTerrace(level: number): boolean {
  return level < deckLevel
}

export function terracePieces(level: number): Point[][] {
  const square = rotatedSquare(level)
  const front: HalfPlane = { a: 0, b: 1, c: frontCut }
  const west = clip(clip(square, { a: 1, b: 0, c: -wall }), front)
  const east = hasEastTerrace(level) ? clip(clip(square, { a: -1, b: 0, c: -wall }), front) : []
  const back = clip(clip(clip(square, { a: 0, b: 1, c: -wall }), { a: 1, b: 0, c: wall }), { a: -1, b: 0, c: wall })
  return [west, east, back].filter((polygon) => polygon.length >= 3)
}

function outerEdges(level: number): Edge[] {
  const square = rotatedSquare(level)
  const edges: Edge[] = []
  const onPlate = ([x, z]: Point) => {
    if (z > frontCut + 1e-3) return false
    if (x <= -wall + 1e-3) return true
    if (x >= wall - 1e-3) return hasEastTerrace(level)
    return z <= -wall + 1e-3
  }
  const samples = 48
  for (let index = 0; index < square.length; index += 1) {
    const from = square[index]
    const to = square[(index + 1) % square.length]
    const midLength = Math.hypot(from[0] + to[0], from[1] + to[1])
    const normal: Point = [(from[0] + to[0]) / midLength, (from[1] + to[1]) / midLength]
    let run: Point[] = []
    const flush = () => {
      if (run.length >= 2) {
        const [start, end] = [run[0], run[run.length - 1]]
        if (Math.hypot(end[0] - start[0], end[1] - start[1]) > railing.postPitch) edges.push({ from: start, to: end, normal })
      }
      run = []
    }
    for (let sample = 0; sample <= samples; sample += 1) {
      const t = sample / samples
      const point: Point = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
      if (onPlate(point)) run.push(point)
      else flush()
    }
    flush()
  }
  return edges
}

function plateGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = []
  for (let level = 1; level <= topTerrace; level += 1) {
    const bottom = level * towerSpec.floorHeight - plate.drop - plate.thickness
    for (const polygon of terracePieces(level)) {
      const shape = new Shape()
      polygon.forEach(([x, z], index) => (index === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)))
      shape.closePath()
      parts.push(place(new ExtrudeGeometry(shape, { depth: plate.thickness, bevelEnabled: false }), [0, bottom, 0], [-Math.PI / 2, 0, 0]))
    }
  }
  return bakeOcclusion(projectWorldUVs(merge(parts), concreteTile), wallShade(1.6, 0.5))
}

function railingGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = []
  for (let level = 1; level <= topTerrace; level += 1) {
    const deckTop = level * towerSpec.floorHeight - plate.drop
    for (const { from, to, normal } of outerEdges(level)) {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1])
      const start: Point = [from[0] - normal[0] * railing.inset, from[1] - normal[1] * railing.inset]
      const end: Point = [to[0] - normal[0] * railing.inset, to[1] - normal[1] * railing.inset]
      const posts = Math.max(1, Math.round(length / railing.postPitch))
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

function spineGeometry(): BufferGeometry {
  return block([spine.proud * 2, spine.top - spine.bottom, spine.width], [-wall - spine.proud + 0.02, (spine.top + spine.bottom) / 2, spine.z])
}

interface EdgeLights {
  mesh: InstancedMesh
  levels: readonly number[]
}

function edgeLights(): EdgeLights {
  const matrices: Matrix4[] = []
  const levels: number[] = []
  for (let level = 1; level <= topTerrace; level += 1) {
    const y = level * towerSpec.floorHeight - plate.drop - plate.thickness - edgeLight.drop
    for (const { from, to, normal } of outerEdges(level)) {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1])
      const centre: Point = [(from[0] + to[0]) / 2 - normal[0] * edgeLight.inset, (from[1] + to[1]) / 2 - normal[1] * edgeLight.inset]
      const yaw = -Math.atan2(to[1] - from[1], to[0] - from[0])
      matrices.push(composeMatrix([centre[0], y, centre[1]], [0, yaw, 0], [length, edgeLight.height, edgeLight.depth]))
      levels.push(level)
    }
  }
  const mesh = instances(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), matrices, matrices.map(() => '#000000'))
  mesh.name = 'terrace-edge-lights'
  return { mesh, levels }
}

export interface Helix {
  root: Group
  spine: Emitter
  setEdgeLight(intensityOfLevel: (level: number) => number): void
}

export function createHelix(textures: SharedTextures): Helix {
  const root = new Group()
  root.name = 'helix-terraces'
  const plates = new Mesh(plateGeometry(), concreteMaterial(textures, { vertexColors: true }))
  plates.name = 'terrace-plates'
  const railings = new Mesh(railingGeometry(), steelMaterial({ color: '#2A2E35', roughness: 0.42 }))
  railings.name = 'terrace-railings'
  for (const mesh of [plates, railings]) {
    mesh.castShadow = true
    mesh.receiveShadow = true
  }
  const spineEmitter = createEmitter(palette.warm, 1.2)
  const spineMesh = new Mesh(spineGeometry(), spineEmitter.material)
  spineMesh.name = 'stair-spine'
  const lights = edgeLights()
  const warm = new Color(palette.warm)
  const scratch = new Color()
  root.add(plates, railings, spineMesh, lights.mesh)
  return {
    root,
    spine: spineEmitter,
    setEdgeLight(intensityOfLevel) {
      lights.levels.forEach((level, index) => {
        lights.mesh.setColorAt(index, scratch.copy(warm).multiplyScalar(intensityOfLevel(level)))
      })
      if (lights.mesh.instanceColor) lights.mesh.instanceColor.needsUpdate = true
    },
  }
}
