import { expect, test } from 'vitest'
import { between, clamp01, quartOut, sineInOut, smooth, smoothstep } from './math'

test('clamp01 bounds values and treats NaN as zero', () => {
  expect(clamp01(-2)).toBe(0)
  expect(clamp01(0.4)).toBe(0.4)
  expect(clamp01(3)).toBe(1)
  expect(clamp01(Number.NaN)).toBe(0)
})

test('between maps a range onto 0..1', () => {
  expect(between(5, 0, 10)).toBe(0.5)
  expect(between(-1, 0, 10)).toBe(0)
  expect(between(11, 0, 10)).toBe(1)
})

test.each([smooth, sineInOut, quartOut])('%o eases from 0 to 1', (ease) => {
  expect(ease(0)).toBe(0)
  expect(ease(1)).toBe(1)
  expect(ease(0.25)).toBeLessThan(ease(0.75))
})

test('smoothstep is symmetric around the middle of its edges', () => {
  expect(smoothstep(100, 300, 200)).toBeCloseTo(0.5)
  expect(smoothstep(100, 300, 150) + smoothstep(100, 300, 250)).toBeCloseTo(1)
})
