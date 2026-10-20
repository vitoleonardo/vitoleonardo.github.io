import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import { sampleSky } from './atmosphere'
import { boulevardPlan } from './architecture/greenery'

function blankSky() {
  return { zenith: new Color(), sky: new Color(), low: new Color(), horizon: new Color(), glow: new Color(), cityGlow: new Color(), fog: new Color(), haze: new Color() }
}

describe('sky blend', () => {
  it('keeps the classic night untouched at vice 0', () => {
    expect(sampleSky(0, 0, blankSky()).zenith.getHexString()).toBe('05080f')
  })

  it('reaches the vice night at vice 1', () => {
    expect(sampleSky(0, 1, blankSky()).zenith.getHexString()).toBe('0a0320')
  })

  it('lands between both looks mid fade', () => {
    const classic = sampleSky(0, 0, blankSky()).horizon
    const vice = sampleSky(0, 1, blankSky()).horizon
    const half = sampleSky(0, 0.5, blankSky()).horizon
    expect(half.r).toBeCloseTo((classic.r + vice.r) / 2, 5)
  })
})

describe('boulevard palms', () => {
  it('plants the same street and riverfront rows every time', () => {
    const plan = boulevardPlan(77)
    expect(plan).toHaveLength(21)
    expect(boulevardPlan(77)).toEqual(plan)
  })
})
