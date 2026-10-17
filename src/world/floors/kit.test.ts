import { describe, expect, test } from 'vitest'
import { breathLimits, breathing, lightLaneCount, lightLedger, lightWeight } from './kit'

const progressSamples = Array.from({ length: 1101 }, (_, step) => step / 100)

describe('light ledger', () => {
  test('every light sits in an existing lane with an ordered window', () => {
    for (const light of lightLedger) {
      expect(light.lane).toBeGreaterThanOrEqual(0)
      expect(light.lane).toBeLessThan(lightLaneCount)
      const [riseStart, fullStart, fullEnd, fallEnd] = light.window
      expect(riseStart).toBeLessThanOrEqual(fullStart)
      expect(fullStart).toBeLessThanOrEqual(fullEnd)
      expect(fullEnd).toBeLessThanOrEqual(fallEnd)
    }
  })

  test('lights sharing a lane are never lit at the same time', () => {
    for (const progress of progressSamples) {
      for (let lane = 0; lane < lightLaneCount; lane += 1) {
        const lit = lightLedger.filter((light) => light.lane === lane && lightWeight(light.window, progress) > 0)
        expect(lit.map((light) => light.id).length, `lane ${lane} at ${progress}`).toBeLessThanOrEqual(1)
      }
    }
  })

  test('ids are unique', () => {
    const ids = lightLedger.map((light) => light.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('breathing lights stay slow and shallow', () => {
    for (const light of lightLedger) {
      if (!light.breath) continue
      expect(light.breath.period).toBeGreaterThanOrEqual(breathLimits.minimumPeriod)
      expect(light.breath.depth).toBeLessThanOrEqual(breathLimits.maximumDepth)
    }
    const swing = progressSamples.map((time) => breathing({ period: 4, depth: 0.2 }, time))
    expect(Math.max(...swing)).toBeLessThanOrEqual(1.2 + 1e-9)
    expect(Math.min(...swing)).toBeGreaterThanOrEqual(0.8 - 1e-9)
  })

  test('weights fade smoothly between zero and one', () => {
    const window = [1.15, 1.85, 2.15, 2.85] as const
    expect(lightWeight(window, 1)).toBe(0)
    expect(lightWeight(window, 2)).toBe(1)
    expect(lightWeight(window, 3)).toBe(0)
    expect(lightWeight(window, 1.5)).toBeCloseTo(0.5)
  })
})
