import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, test } from 'vitest'
import { createCameraPath, createCameraRig, seamWeight } from './camera-rig'
import { chapters } from './chapters'
import { resolvePose } from './interp'
import { entrance } from './tower'
import type { Vec3 } from './types'

interface Volume {
  name: string
  min: [number, number, number]
  max: [number, number, number]
}

const CLEARANCE = 0.3
const ENTRANCE_CLEARANCE = 1.2
const SAMPLES_PER_CHAPTER = 1000
const TOWER_HALF = 7
const ROOF = 28
const WALL = 0.2
const lastChapter = chapters.length - 1

const slabs: Volume[] = Array.from({ length: 7 }, (_, slab) => {
  const top = 4 * (slab + 1)
  return { name: `slab ${slab + 1}`, min: [-TOWER_HALF, top - 0.35, -TOWER_HALF], max: [TOWER_HALF, top, TOWER_HALF] }
})

const structure: Volume[] = [
  { name: 'west wall', min: [-TOWER_HALF - WALL, 0, -TOWER_HALF], max: [-TOWER_HALF + WALL, ROOF, TOWER_HALF] },
  { name: 'east wall', min: [TOWER_HALF - WALL, 0, -TOWER_HALF], max: [TOWER_HALF + WALL, ROOF, TOWER_HALF] },
  { name: 'back wall', min: [-TOWER_HALF, 0, -TOWER_HALF - WALL], max: [TOWER_HALF, ROOF, -TOWER_HALF + WALL] },
  { name: 'stair core', min: [-7, 0, -7], max: [-4, ROOF, -3] },
  { name: 'launch deck', min: [7, 19.6, -4], max: [15, 20, 4] },
  { name: 'rocket flight column', min: [10, 20, -1], max: [12, 120, 1] },
  { name: 'antenna mast', min: [-3.3, ROOF, -3.3], max: [-2.7, 40.5, -2.7] },
  { name: 'street', min: [-200, -10, -200], max: [200, 0, 200] },
]

function insideVolume(point: Vector3, volume: Volume): boolean {
  return (
    point.x > volume.min[0] - CLEARANCE &&
    point.x < volume.max[0] + CLEARANCE &&
    point.y > volume.min[1] - CLEARANCE &&
    point.y < volume.max[1] + CLEARANCE &&
    point.z > volume.min[2] - CLEARANCE &&
    point.z < volume.max[2] + CLEARANCE
  )
}

function collisions(mobile: boolean, volumes: readonly Volume[]): string[] {
  const path = createCameraPath(chapters, mobile)
  const point = new Vector3()
  const hits: string[] = []
  const samples = lastChapter * SAMPLES_PER_CHAPTER
  for (let sample = 0; sample <= samples; sample += 1) {
    const progress = sample / SAMPLES_PER_CHAPTER
    path.position(progress, point)
    for (const volume of volumes) {
      if (insideVolume(point, volume)) hits.push(`${volume.name} at progress ${progress.toFixed(3)}`)
    }
  }
  return hits
}

interface EntrancePart {
  name: string
  distance(point: Vector3): number
}

const closest = new Vector3()
const scratch = new Vector3()

function segmentDistance(point: Vector3, from: Vector3, to: Vector3): number {
  const span = scratch.subVectors(to, from)
  const t = Math.min(1, Math.max(0, closest.subVectors(point, from).dot(span) / span.lengthSq()))
  return closest.copy(from).addScaledVector(span, t).distanceTo(point)
}

function doorLeaf(name: string, side: -1 | 1): EntrancePart {
  const hinge = new Vector3(entrance.x - side * entrance.halfWidth, 0, entrance.hingeZ)
  const edge = hinge
    .clone()
    .add(new Vector3(side * Math.cos(entrance.leafOpenAngle), 0, Math.sin(entrance.leafOpenAngle)).multiplyScalar(entrance.leafWidth))
  return {
    name,
    distance(point) {
      const flat = new Vector3(point.x, 0, point.z)
      const below = Math.max(0, -point.y, point.y - entrance.height)
      return Math.hypot(segmentDistance(flat, hinge, edge), below)
    },
  }
}

function canopy(): EntrancePart {
  const [x, y, z] = entrance.canopyCenter
  const [width, height, depth] = entrance.canopySize
  const min = new Vector3(entrance.x + x - width / 2, y - height / 2, z - depth / 2)
  const max = new Vector3(entrance.x + x + width / 2, y + height / 2, z + depth / 2)
  return {
    name: 'entrance canopy',
    distance: (point) => closest.copy(point).clamp(min, max).distanceTo(point),
  }
}

function brace(name: string, side: -1 | 1): EntrancePart {
  const toWorld = ([x, y, z]: Vec3) => new Vector3(entrance.x + side * x, y, z)
  const low = toWorld(entrance.braceLow)
  const high = toWorld(entrance.braceHigh)
  return { name, distance: (point) => segmentDistance(point, low, high) }
}

const entranceParts: EntrancePart[] = [
  doorLeaf('west door leaf', 1),
  doorLeaf('east door leaf', -1),
  canopy(),
  brace('west canopy brace', -1),
  brace('east canopy brace', 1),
]

function entranceApproaches(mobile: boolean): string[] {
  const path = createCameraPath(chapters, mobile)
  const point = new Vector3()
  const hits: string[] = []
  const samples = lastChapter * SAMPLES_PER_CHAPTER
  for (let sample = 0; sample <= samples; sample += 1) {
    const progress = sample / SAMPLES_PER_CHAPTER
    path.position(progress, point)
    for (const part of entranceParts) {
      const distance = part.distance(point)
      if (distance < ENTRANCE_CLEARANCE) hits.push(`${part.name} ${distance.toFixed(2)} m at progress ${progress.toFixed(3)}`)
    }
  }
  return hits
}

describe('entrance model', () => {
  test('opens both leaves outward to the street', () => {
    const point = new Vector3(entrance.x, entrance.height / 2, entrance.hingeZ + entrance.leafWidth * 0.9)
    for (const part of entranceParts.slice(0, 2)) expect(part.distance(point)).toBeLessThan(entrance.halfWidth)
    expect(entranceParts[2].distance(new Vector3(entrance.x, entrance.canopyCenter[1], entrance.canopyCenter[2]))).toBe(0)
  })
})

describe.each([
  ['desktop', false],
  ['mobile', true],
] as const)('%s camera path', (_, mobile) => {
  test('never enters a floor slab', () => {
    expect(collisions(mobile, slabs)).toEqual([])
  })

  test('never passes through walls, the stair core, the deck, the rocket, the mast or the street', () => {
    expect(collisions(mobile, structure)).toEqual([])
  })

  test('keeps 1.2 m away from the door leaves, the canopy and its braces', () => {
    expect(entranceApproaches(mobile)).toEqual([])
  })

  test('passes through every authored endpoint', () => {
    const path = createCameraPath(chapters, mobile)
    chapters.forEach((chapter, index) => {
      const pose = resolvePose(chapter, mobile)
      expect(path.position(index, new Vector3()).distanceTo(new Vector3(...pose.position))).toBeLessThan(1e-6)
      expect(path.target(index, new Vector3()).distanceTo(new Vector3(...pose.target))).toBeLessThan(1e-6)
      expect(path.fov(index)).toBeCloseTo(pose.fov)
    })
  })

  test('turns the view smoothly without target flips', () => {
    const path = createCameraPath(chapters, mobile)
    const position = new Vector3()
    const target = new Vector3()
    const direction = new Vector3()
    const previous = new Vector3()
    const step = 0.005
    for (let progress = 0; progress <= lastChapter; progress += step) {
      direction.subVectors(path.target(progress, target), path.position(progress, position)).normalize()
      if (progress > 0) expect((direction.angleTo(previous) * 180) / Math.PI).toBeLessThan(3)
      previous.copy(direction)
    }
  })
})

describe('camera rig', () => {
  test('places the camera on the authored endpoint looking at its target', () => {
    const camera = new PerspectiveCamera()
    const rig = createCameraRig(camera, chapters, { width: 1440, height: 900, mobile: false })
    const chapter = 5
    rig.update({ progress: chapter, dt: 1 / 60, parallax: false })
    rig.root.updateMatrixWorld(true)
    const pose = resolvePose(chapters[chapter], false)
    const position = camera.getWorldPosition(new Vector3())
    const forward = camera.getWorldDirection(new Vector3())
    const expected = new Vector3(...pose.target).sub(new Vector3(...pose.position)).normalize()
    expect(position.distanceTo(new Vector3(...pose.position))).toBeLessThan(1e-6)
    expect(forward.angleTo(expected)).toBeLessThan(1e-6)
    expect(camera.fov).toBeCloseTo(pose.fov)
  })

  test('switches curves on the breakpoint while keeping progress', () => {
    const camera = new PerspectiveCamera()
    const rig = createCameraRig(camera, chapters, { width: 1440, height: 900, mobile: false })
    rig.setViewport({ width: 390, height: 844, mobile: true })
    rig.update({ progress: 2, dt: 1 / 60, parallax: false })
    rig.root.updateMatrixWorld(true)
    const mobilePose = resolvePose(chapters[2], true)
    expect(camera.getWorldPosition(new Vector3()).distanceTo(new Vector3(...mobilePose.position))).toBeLessThan(1e-6)
  })

  test('pointer parallax is clamped and fades out mid-travel', () => {
    const camera = new PerspectiveCamera()
    const rig = createCameraRig(camera, chapters, { width: 1440, height: 900, mobile: false })
    const [inputRig] = rig.root.children
    rig.setPointer(5, -5)
    for (let frame = 0; frame < 600; frame += 1) rig.update({ progress: 3, dt: 1 / 60, parallax: true })
    const atChapter = inputRig.position.length()
    expect(atChapter).toBeGreaterThan(0)
    expect(atChapter).toBeLessThan(0.2)
    for (let frame = 0; frame < 600; frame += 1) rig.update({ progress: 3.5, dt: 1 / 60, parallax: true })
    expect(inputRig.position.length()).toBeLessThan(1e-3)
    expect(seamWeight(3)).toBe(1)
    expect(seamWeight(3.5)).toBe(0)
  })
})
