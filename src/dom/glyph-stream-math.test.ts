import { describe, expect, it } from 'vitest'
import {
  buildRamp,
  dropRadius,
  glyphIndex,
  hash,
  mixOklab,
  parseHexColor,
  smoothstep,
  stepUnderdamped,
  strokeRadius,
} from './glyph-stream-math'

describe('parseHexColor', () => {
  it('reads six and three digit hex', () => {
    expect(parseHexColor('#8fa8ff')).toEqual({ r: 143, g: 168, b: 255 })
    expect(parseHexColor(' #fff ')).toEqual({ r: 255, g: 255, b: 255 })
  })
})

describe('mixOklab', () => {
  const head = parseHexColor('#5227ff')
  const tail = parseHexColor('#ff9ffc')

  it('returns the endpoints at 0 and 1', () => {
    expect(mixOklab(head, tail, 0)).toEqual(head)
    expect(mixOklab(head, tail, 1)).toEqual(tail)
  })

  it('clamps the amount', () => {
    expect(mixOklab(head, tail, -2)).toEqual(head)
    expect(mixOklab(head, tail, 5)).toEqual(tail)
  })

  it('builds a ramp that starts and ends on the colours', () => {
    const ramp = buildRamp(head, tail, 8)
    expect(ramp).toHaveLength(8)
    expect(ramp[0]).toEqual(head)
    expect(ramp[7]).toEqual(tail)
  })
})

describe('hash', () => {
  it('is deterministic and stays inside [0, 1)', () => {
    for (const seed of [0, 1, 42, 99999, 2 ** 31 - 1]) {
      const value = hash(seed)
      expect(value).toBe(hash(seed))
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('stepUnderdamped', () => {
  it('overshoots and then settles on the target', () => {
    let state = { position: 0, velocity: 0 }
    let peak = 0
    for (let frame = 0; frame < 240; frame += 1) {
      state = stepUnderdamped(state, 100, 30, 0.6, 1 / 120)
      peak = Math.max(peak, state.position)
    }
    expect(peak).toBeGreaterThan(100)
    expect(state.position).toBeCloseTo(100, 1)
  })
})

describe('strokeRadius', () => {
  it('thins when slow and swells with speed', () => {
    expect(strokeRadius(0, 14, 0.7)).toBeLessThan(strokeRadius(1600, 14, 0.7))
    expect(strokeRadius(5000, 14, 0.7)).toBe(strokeRadius(1600, 14, 0.7))
  })
})

describe('dropRadius', () => {
  it('starts at the base radius, shrinks with age and vanishes at the end', () => {
    expect(dropRadius(10, 0, 0.9, 1)).toBe(10)
    expect(dropRadius(10, 0.5, 0.9, 1)).toBeLessThan(10)
    expect(dropRadius(10, 1, 0.9, 1)).toBe(0)
  })

  it('pinches aged drops harder when breakup is higher', () => {
    expect(dropRadius(10, 0.7, 1, 3)).toBeLessThan(dropRadius(10, 0.7, 0, 3))
  })
})

describe('glyphIndex', () => {
  it('stays inside the pool and settles once the drop has aged', () => {
    for (let now = 0; now < 2; now += 0.05) {
      const index = glyphIndex(7, 0.1, now, 8, 36)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(36)
    }
    expect(glyphIndex(7, 0.5, 0.1, 8, 36)).toBe(glyphIndex(7, 0.9, 1.7, 8, 36))
  })

  it('scrambles a fresh drop over time', () => {
    const seen = new Set<number>()
    for (let now = 0; now < 4; now += 0.125) seen.add(glyphIndex(11, 0.05, now, 8, 36))
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('smoothstep', () => {
  it('clamps and eases between the edges', () => {
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(0, 1, 2)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBe(0.5)
  })
})
