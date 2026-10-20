import { describe, expect, it } from 'vitest'
import { easeLook, lookTarget, parseLook, stepLook } from './look'

describe('look', () => {
  it('falls back to classic for anything but vice', () => {
    expect(parseLook('vice')).toBe('vice')
    expect(parseLook('classic')).toBe('classic')
    expect(parseLook(null)).toBe('classic')
    expect(parseLook('neon')).toBe('classic')
  })

  it('maps looks to blend targets', () => {
    expect(lookTarget('classic')).toBe(0)
    expect(lookTarget('vice')).toBe(1)
  })

  it('steps toward the target without overshooting', () => {
    let blend = 0
    for (let frame = 0; frame < 200; frame += 1) blend = stepLook(blend, 1, 1 / 60, false)
    expect(blend).toBe(1)
    expect(stepLook(0.5, 0, 1 / 60, false)).toBeLessThan(0.5)
    expect(stepLook(0.999, 1, 1 / 60, false)).toBe(1)
  })

  it('snaps under reduced motion', () => {
    expect(stepLook(0, 1, 1 / 60, true)).toBe(1)
    expect(stepLook(1, 0, 1 / 60, true)).toBe(0)
  })

  it('eases within the unit range', () => {
    expect(easeLook(0)).toBe(0)
    expect(easeLook(1)).toBe(1)
    expect(easeLook(0.5)).toBeCloseTo(0.5)
    expect(easeLook(2)).toBe(1)
  })
})
