import { describe, expect, test } from 'vitest'
import { towerSpec } from '../floors/kit'
import { fin, finSegments } from './fins'
import { desktopDensity, greenerySeed, mobileDensity, plantCounts, plantKinds, plantingPlan } from './greenery'
import { frontCut, plateBottom, plateTop, planterRuns, terraceHalfSize, terraceList, terracePieces } from './terraces'

const wall = towerSpec.halfSize + towerSpec.wallThickness
const epsilon = 1e-6

describe('terraces', () => {
  test('only the three listed terraces exist', () => {
    const pieces = terracePieces()
    expect(pieces.map(({ spec }) => spec)).toEqual([
      { level: 5, side: 'west' },
      { level: 6, side: 'west' },
      { level: 3, side: 'east' },
    ])
    expect(pieces).toHaveLength(terraceList.length)
  })

  test('every terrace plate contains the tower footprint', () => {
    for (const { level } of terraceList) {
      const angle = (level * 3.5 * Math.PI) / 180
      expect(terraceHalfSize(level)).toBeGreaterThan(wall * (Math.cos(angle) + Math.sin(angle)))
    }
  })

  test('plates stay behind the front cutaway and outside the interior on their own side', () => {
    for (const { spec, polygon } of terracePieces()) {
      expect(polygon.length).toBeGreaterThanOrEqual(3)
      for (const [x, z] of polygon) {
        expect(z).toBeLessThanOrEqual(frontCut + epsilon)
        if (spec.side === 'west') expect(x).toBeLessThanOrEqual(-wall + epsilon)
        else expect(x).toBeGreaterThanOrEqual(wall - epsilon)
      }
    }
  })

  test('nothing overhangs the launch deck or the rocket column', () => {
    for (const { spec, polygon } of terracePieces()) {
      if (spec.level < 5) continue
      for (const [x] of polygon) expect(x).toBeLessThanOrEqual(wall + epsilon)
    }
  })

  test('planter troughs clear the fin depth', () => {
    for (const spec of terraceList) {
      const runs = planterRuns(spec)
      expect(runs.length).toBeGreaterThan(0)
      for (const run of runs) {
        for (const [x, z] of [run.from, run.to]) {
          expect(Math.max(Math.abs(x) - wall, Math.abs(z) - wall)).toBeGreaterThan(fin.depth)
        }
      }
    }
  })
})

describe('fins around terraces', () => {
  test('fins stop under each terrace slab and resume above it', () => {
    for (const spec of terraceList) {
      const segments = finSegments(spec.side, 0)
      const below = segments.find(([, top]) => Math.abs(top - (plateBottom(spec.level) - fin.slabGap)) < epsilon)
      expect(below).toBeDefined()
      for (const [bottom, top] of segments) {
        const overlaps = bottom < plateTop(spec.level) && top > plateBottom(spec.level)
        expect(overlaps).toBe(false)
      }
    }
  })

  test('faces without terraces keep one continuous fin', () => {
    expect(finSegments('back', 0)).toEqual([[fin.bottom, fin.top]])
  })
})

describe('greenery', () => {
  test('instance counts are deterministic for a seed', () => {
    const first = plantCounts(plantingPlan(greenerySeed, desktopDensity))
    const second = plantCounts(plantingPlan(greenerySeed, desktopDensity))
    expect(first).toEqual(second)
    for (const kind of plantKinds) expect(first[kind]).toBeGreaterThan(0)
  })

  test('a different seed changes the planting', () => {
    const base = plantingPlan(greenerySeed, desktopDensity)
    const other = plantingPlan(greenerySeed + 1, desktopDensity)
    expect(base.clump.map(({ yaw }) => yaw)).not.toEqual(other.clump.map(({ yaw }) => yaw))
  })

  test('mobile plants fewer instances than desktop and keeps vines', () => {
    const desktop = plantCounts(plantingPlan(greenerySeed, desktopDensity))
    const mobile = plantCounts(plantingPlan(greenerySeed, mobileDensity))
    for (const kind of plantKinds) expect(mobile[kind]).toBeLessThan(desktop[kind])
    expect(mobile.vine).toBeGreaterThan(desktop.vine * 0.5)
  })

  test('the garden keeps the stair core and the deck path clear', () => {
    const { core } = towerSpec
    const plan = plantingPlan(greenerySeed, desktopDensity)
    for (const kind of ['clump', 'palm', 'fern'] as const) {
      for (const { position: [x, y, z] } of plan[kind]) {
        if (y !== 20) continue
        expect(x < core.maxX + 0.4 && z < core.maxZ + 0.4).toBe(false)
        expect(x > 1 && Math.abs(z) < 1.1).toBe(false)
      }
    }
  })
})
