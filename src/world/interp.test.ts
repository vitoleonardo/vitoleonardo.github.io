import { describe, expect, test } from 'vitest'
import { chapters } from './chapters'
import {
  clamp,
  createChannels,
  damp,
  interpolateChannels,
  lerp,
  presentedState,
  resolvePose,
  segmentState,
  smoothstep,
  splitProgress,
  tallScreenCorrection,
  worldChannelNames,
} from './interp'
import type { ConductorState, WorldChannels } from './types'

const last = chapters.length - 1

function channelsAt(progress: number): WorldChannels {
  const { a, b, t } = segmentState(progress, chapters)
  return interpolateChannels(a.world, b.world, t)
}

function sweep(from: number, to: number, steps: number): number[] {
  return Array.from({ length: steps + 1 }, (_, step) => lerp(from, to, step / steps))
}

describe('scalar helpers', () => {
  test('clamp, lerp and smoothstep stay inside their ranges', () => {
    expect(clamp(-1, 0, 1)).toBe(0)
    expect(clamp(2, 0, 1)).toBe(1)
    expect(lerp(2, 6, 0.25)).toBe(3)
    expect(smoothstep(0, 1, -0.5)).toBe(0)
    expect(smoothstep(0, 1, 1.5)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
  })

  test('damp converges independently of how the time is sliced', () => {
    let fine = 0
    for (let frame = 0; frame < 60; frame += 1) fine = damp(fine, 1, 5.2, 1 / 60)
    let coarse = 0
    for (let frame = 0; frame < 30; frame += 1) coarse = damp(coarse, 1, 5.2, 1 / 30)
    expect(fine).toBeCloseTo(coarse, 10)
    expect(damp(0.4, 0.4, 5.2, 1 / 60)).toBe(0.4)
  })
})

describe('splitProgress and segmentState', () => {
  test('clamps out-of-range and non-finite progress', () => {
    expect(splitProgress(-3, chapters.length)).toEqual({ index: 0, next: 1, local: 0 })
    expect(splitProgress(99, chapters.length)).toEqual({ index: last, next: last, local: 0 })
    expect(splitProgress(Number.NaN, chapters.length)).toEqual({ index: 0, next: 1, local: 0 })
  })

  test('integer progress lands exactly on the authored chapter', () => {
    chapters.forEach((chapter, index) => {
      const segment = segmentState(index, chapters)
      expect(segment.a).toBe(chapter)
      expect(segment.t).toBe(0)
      expect(channelsAt(index)).toEqual(chapter.world)
    })
  })

  test('the hand-over at every boundary is continuous', () => {
    for (let boundary = 1; boundary <= last; boundary += 1) {
      const before = channelsAt(boundary - 1e-7)
      const after = channelsAt(boundary)
      for (const name of worldChannelNames) expect(before[name]).toBeCloseTo(after[name], 5)
    }
  })

  test('the ease is monotonic inside a segment', () => {
    let previous = -1
    for (const progress of sweep(3, 3.999, 200)) {
      const { t } = segmentState(progress, chapters)
      expect(t).toBeGreaterThanOrEqual(previous)
      previous = t
    }
  })
})

describe('interpolateChannels', () => {
  test('covers every world channel', () => {
    expect([...worldChannelNames].sort()).toEqual(Object.keys(createChannels()).sort())
  })

  test('the same progress yields the same state forward and backward', () => {
    const forward = new Map(sweep(0, last, 400).map((progress) => [progress, channelsAt(progress)]))
    for (const progress of sweep(0, last, 400).reverse()) {
      expect(channelsAt(progress)).toEqual(forward.get(progress))
    }
  })

  test('clamps t and writes into the provided target', () => {
    const target = createChannels()
    const { world: a } = chapters[0]
    const { world: b } = chapters[1]
    expect(interpolateChannels(a, b, -1, target)).toBe(target)
    expect(target).toEqual(a)
    expect(interpolateChannels(a, b, 2)).toEqual(b)
  })
})

describe('poses and composition helpers', () => {
  test('resolvePose picks the breakpoint override', () => {
    const hero = chapters[0]
    expect(resolvePose(hero, true)).toBe(hero.camera.mobile)
    expect(resolvePose(hero, false)).toEqual({
      position: hero.camera.position,
      target: hero.camera.target,
      fov: hero.camera.fov,
    })
  })

  test('tall-screen correction only applies beyond the authored aspect and is capped', () => {
    expect(tallScreenCorrection(1440, 900, false)).toEqual({ pullback: 0, fovOpen: 0 })
    expect(tallScreenCorrection(390, 844, true)).toEqual({ pullback: 0, fovOpen: 0 })
    const tallDesktop = tallScreenCorrection(900, 1400, false)
    expect(tallDesktop.pullback).toBeGreaterThan(0)
    expect(tallDesktop.fovOpen).toBeGreaterThan(0)
    expect(tallScreenCorrection(100, 10000, true)).toEqual(tallScreenCorrection(100, 20000, true))
  })

  test('presentedState snaps to the nearest chapter under reduced motion', () => {
    const state: ConductorState = {
      exact: 4.62,
      smooth: 4.1,
      index: 4,
      next: 5,
      localExact: 0.62,
      localSmooth: 0.1,
      direction: 1,
    }
    const out = { ...state }
    expect(presentedState(state, true, chapters.length, out)).toMatchObject({ smooth: 5, localSmooth: 0, exact: 4.62 })
    expect(presentedState(state, false, chapters.length, out)).toMatchObject({ smooth: 4.1 })
    expect(out.localSmooth).toBeCloseTo(0.1)
  })
})
