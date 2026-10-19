import { describe, expect, test } from 'vitest'
import { createQualityGovernor, pickInitialTier, qualityTiers } from './quality'

const FRAME_MS = 1000 / 60

describe('pickInitialTier', () => {
  test('defaults phones and tablets to medium and strong desktops to high', () => {
    expect(pickInitialTier({ mobile: true, touch: true, cores: 8 })).toBe('medium')
    expect(pickInitialTier({ mobile: false, touch: true, cores: 8 })).toBe('medium')
    expect(pickInitialTier({ mobile: false, touch: false, cores: 4 })).toBe('medium')
    expect(pickInitialTier({ mobile: false, touch: false, cores: 8 })).toBe('high')
    expect(pickInitialTier({ mobile: false, touch: false, cores: 0 })).toBe('high')
    expect(pickInitialTier({ mobile: true, touch: true, cores: 2 })).toBe('low')
  })

  test('caps the pixel ratio per tier', () => {
    expect(qualityTiers.high.dpr).toBe(1.75)
    expect(qualityTiers.medium.dpr).toBe(1.35)
    expect(qualityTiers.low.dpr).toBe(1)
  })
})

describe('quality governor', () => {
  function run(governor: ReturnType<typeof createQualityGovernor>, frames: number, frameMs: number, from: number) {
    let now = from
    const changes: string[] = []
    for (let frame = 0; frame < frames; frame += 1) {
      now += frameMs
      const next = governor.sample(frameMs, now)
      if (next) changes.push(next)
    }
    return { now, changes }
  }

  test('ignores slow frames during the warm-up', () => {
    const governor = createQualityGovernor('high', 0)
    expect(run(governor, 60, 30, 0).changes).toEqual([])
    expect(governor.tier).toBe('high')
  })

  test('downgrades after 120 consecutive slow frames and never upgrades', () => {
    const governor = createQualityGovernor('high', 0)
    const warm = run(governor, 200, FRAME_MS, 0)
    const slow = run(governor, 119, 25, warm.now)
    expect(slow.changes).toEqual([])
    expect(run(governor, 1, 25, slow.now).changes).toEqual(['medium'])
    const fast = run(governor, 2000, FRAME_MS, slow.now + 25)
    expect(fast.changes).toEqual([])
    expect(governor.tier).toBe('medium')
  })

  test('a single fast frame resets the streak', () => {
    const governor = createQualityGovernor('high', 0)
    const warm = run(governor, 200, FRAME_MS, 0)
    const first = run(governor, 100, 25, warm.now)
    const reset = run(governor, 1, FRAME_MS, first.now)
    expect(run(governor, 100, 25, reset.now).changes).toEqual([])
  })

  test('stops at the lowest tier and waits after a pause', () => {
    const governor = createQualityGovernor('low', 0)
    expect(run(governor, 400, 40, 2000).changes).toEqual([])
    governor.pause(10_000)
    expect(governor.sample(40, 10_500)).toBeNull()
  })
})
