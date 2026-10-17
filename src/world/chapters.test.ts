import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, test } from 'vitest'
import { applyLensShift, compositionShift } from './camera-rig'
import { chapters, scrollWeights } from './chapters'
import { resolvePose, worldChannelNames } from './interp'
import type { CameraPose, ChapterId, Vec3 } from './types'

const chapterOrder: ChapterId[] = [
  'hero',
  'index',
  'stop-frontend',
  'stop-backend',
  'stop-cloud',
  'stop-data',
  'stop-ai-products',
  'stop-ai-coding',
  'stop-teaching',
  'about',
  'say-hi',
]

const expectedWeights: Record<ChapterId, number> = {
  hero: 1.2,
  index: 1.4,
  'stop-frontend': 1.3,
  'stop-backend': 1.2,
  'stop-cloud': 1.2,
  'stop-data': 1.2,
  'stop-ai-products': 1.2,
  'stop-ai-coding': 1.6,
  'stop-teaching': 1.3,
  about: 1.4,
  'say-hi': 1.2,
}

const contractInteractions = [
  ...Array.from({ length: 7 }, (_, floor) => `index-floor-${floor}`),
  'frontend-hih',
  'frontend-baysal',
  'frontend-fakhari',
  ...Array.from({ length: 10 }, (_, service) => `lounge-service-${service}`),
  'say-hi-beacon',
  'rocket-launch',
]

interface LandmarkFrame {
  focal: Vec3
  extent: readonly Vec3[]
}

const landmarkFrames: Record<ChapterId, LandmarkFrame> = {
  hero: { focal: [0, 14, 0], extent: [[-7, 0, 7], [7, 0, 7], [-7, 28, 7], [7, 28, 7]] },
  index: { focal: [0, 14, 0], extent: [[-7, 0, 7], [7, 0, 7], [-7, 28, 7], [7, 28, 7], [15, 20, 4]] },
  'stop-frontend': {
    focal: [1.2, 1.75, -2.6],
    extent: [[-3.9, 0.75, -0.65], [6.1, 0.75, -0.45], [-3.9, 2.75, -0.65], [6.1, 2.75, -0.45]],
  },
  'stop-backend': {
    focal: [1.7, 5.2, -3],
    extent: [[0.2, 4.4, -6.2], [3.2, 4.4, -6.2], [0.2, 6.6, -6.2], [3.2, 6.6, -6.2], [3.2, 4.4, 1.5], [3.2, 6.6, 1.5]],
  },
  'stop-cloud': { focal: [-5.3, 9, 1], extent: [[-6.7, 8, 3.4], [-3.9, 8, 3.4], [-6.7, 9.9, -1.4], [-3.9, 9.9, -1.4]] },
  'stop-data': {
    focal: [1.4, 13.5, 0.6],
    extent: [[-0.7, 13.7, 0.6], [3.5, 13.7, 0.6], [1.4, 14.95, 0.6], [1.4, 12.24, 2.7], [1.4, 13.7, 5]],
  },
  'stop-ai-products': { focal: [0, 17.6, -0.5], extent: [[-2, 16.5, -2], [2, 18.5, 2], [2, 16.5, -2], [-2, 18.5, 2]] },
  'stop-ai-coding': { focal: [11, 24.5, 0], extent: [[11, 22, 0], [11, 29, 0]] },
  'stop-teaching': { focal: [0, 26, 0], extent: [[3, 24.5, 0], [-3, 24.5, 0], [0, 27.5, 3], [0, 27.5, -3]] },
  about: { focal: [-1, 29, -1.5], extent: [[-3, 28.5, -3.5], [1, 28.5, 0.5], [-3, 30.5, -3.5], [1, 30.5, 0.5]] },
  'say-hi': { focal: [-3, 40, -3], extent: [[-7, 28, 7], [7, 28, 7], [7, 28, -7]] },
}

const chaptersById = chapters.map((chapter) => [chapter.id, chapter] as const)
const desktopViewport = { width: 1440, height: 900 }
const mobileViewport = { width: 390, height: 844 }
const READING_ZONE_RIGHT_EDGE = 0.4
const BOTTOM_SHEET_TOP = 0.5
const MOBILE_RAIL_BOTTOM = 0.1

function screenPosition(pose: CameraPose, point: Vec3, mobile: boolean): { x: number; y: number } {
  const { width, height } = mobile ? mobileViewport : desktopViewport
  const camera = new PerspectiveCamera(pose.fov, width / height, 0.1, 400)
  camera.position.set(...pose.position)
  camera.lookAt(new Vector3(...pose.target))
  applyLensShift(camera, width, height, compositionShift(mobile))
  camera.updateMatrixWorld()
  const projected = new Vector3(...point).project(camera)
  return { x: (projected.x + 1) / 2, y: (1 - projected.y) / 2 }
}

describe('chapter ledger', () => {
  test('lists the eleven chapters in DOM order', () => {
    expect(chapters.map((chapter) => chapter.id)).toEqual(chapterOrder)
  })

  test('scroll weights match the section weights', () => {
    expect(scrollWeights).toEqual(expectedWeights)
    for (const chapter of chapters) expect(chapter.scrollWeight).toBe(expectedWeights[chapter.id])
  })

  test('records a landmark and a change for every chapter', () => {
    for (const chapter of chapters) {
      expect(chapter.landmark.length).toBeGreaterThan(10)
      expect(chapter.change.length).toBeGreaterThan(10)
      expect(chapter.landmark).not.toMatch(/\u2014/)
      expect(chapter.change).not.toMatch(/\u2014/)
    }
  })

  test.each(chaptersById)('%s has finite desktop and mobile poses', (_, chapter) => {
    for (const pose of [resolvePose(chapter, false), resolvePose(chapter, true)]) {
      expect([...pose.position, ...pose.target].every(Number.isFinite)).toBe(true)
      expect(new Vector3(...pose.position).distanceTo(new Vector3(...pose.target))).toBeGreaterThan(3)
      expect(pose.fov).toBeGreaterThanOrEqual(20)
      expect(pose.fov).toBeLessThanOrEqual(75)
    }
  })

  test('world channels are complete and inside their ranges', () => {
    for (const chapter of chapters) {
      expect(Object.keys(chapter.world).sort()).toEqual([...worldChannelNames].sort())
      for (const name of worldChannelNames) {
        const ceiling = name === 'floorsLit' ? 7 : 1
        expect(chapter.world[name]).toBeGreaterThanOrEqual(0)
        expect(chapter.world[name]).toBeLessThanOrEqual(ceiling)
      }
    }
  })

  test('the floors cascade on inside the index chapter', () => {
    const lit = chapters.map((chapter) => chapter.world.floorsLit)
    expect(lit.slice(0, 2)).toEqual([1, 1])
    expect(lit.slice(2).every((floors) => floors === 7)).toBe(true)
  })

  test('the launch runs across the ai-coding chapter and stays complete afterwards', () => {
    const launchFrom = chapterOrder.indexOf('stop-ai-coding')
    const launch = chapters.map((chapter) => chapter.world.launch)
    expect(launch.slice(0, launchFrom + 1).every((value) => value === 0)).toBe(true)
    expect(launch.slice(launchFrom + 1).every((value) => value === 1)).toBe(true)
    expect(chapters[launchFrom].world.red).toBe(1)
  })

  test('bloom stays off before the ai-coding chapter', () => {
    const bloomFrom = chapterOrder.indexOf('stop-ai-coding')
    chapters.forEach((chapter, index) => {
      if (index < bloomFrom) expect(chapter.world.bloom).toBe(0)
      else expect(chapter.world.bloom).toBeGreaterThan(0)
    })
  })

  test('owns every contract interaction exactly once', () => {
    const owned = chapters.flatMap((chapter) => chapter.interactions)
    expect(new Set(owned).size).toBe(owned.length)
    expect([...owned].sort()).toEqual([...contractInteractions].sort())
  })

  test('consecutive chapters move the camera to a new place', () => {
    for (const mobile of [false, true]) {
      chapters.slice(1).forEach((chapter, index) => {
        const previous = resolvePose(chapters[index], mobile)
        const current = resolvePose(chapter, mobile)
        const travel = new Vector3(...previous.position).distanceTo(new Vector3(...current.position))
        const retarget = new Vector3(...previous.target).distanceTo(new Vector3(...current.target))
        expect(travel + retarget).toBeGreaterThan(4)
      })
    }
  })
})

describe('composition', () => {
  test.each(chaptersById)('%s keeps its landmark right of the desktop reading zone', (id, chapter) => {
    const pose = resolvePose(chapter, false)
    const { focal, extent } = landmarkFrames[id]
    const centre = screenPosition(pose, focal, false)
    expect(centre.x).toBeGreaterThanOrEqual(0.5)
    expect(centre.x).toBeLessThanOrEqual(0.95)
    expect(centre.y).toBeGreaterThanOrEqual(0.05)
    expect(centre.y).toBeLessThanOrEqual(0.95)
    for (const point of extent) {
      expect(screenPosition(pose, point, false).x).toBeGreaterThanOrEqual(READING_ZONE_RIGHT_EDGE)
    }
  })

  test.each(chaptersById)('%s keeps its landmark above the mobile bottom sheet', (id, chapter) => {
    const pose = resolvePose(chapter, true)
    const { focal, extent } = landmarkFrames[id]
    const centre = screenPosition(pose, focal, true)
    expect(centre.x).toBeGreaterThanOrEqual(0.1)
    expect(centre.x).toBeLessThanOrEqual(0.9)
    expect(centre.y).toBeGreaterThanOrEqual(0.05)
    expect(centre.y).toBeLessThanOrEqual(0.5)
    for (const point of extent) {
      const { y } = screenPosition(pose, point, true)
      expect(y).toBeLessThanOrEqual(BOTTOM_SHEET_TOP)
      expect(y).toBeGreaterThanOrEqual(MOBILE_RAIL_BOTTOM)
    }
  })
})
