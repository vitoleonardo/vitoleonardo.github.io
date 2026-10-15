import { expect, test } from 'vitest'
import { samplePathData } from './svg-path'

function pointAt(samples: Float32Array, index: number): [number, number] {
  return [samples[index * 2], samples[index * 2 + 1]]
}

test('a straight line samples to evenly spaced points from start to end', () => {
  const samples = samplePathData('M 0 0 L 100 0', 11)
  for (let i = 0; i < 11; i++) {
    const [x, y] = pointAt(samples, i)
    expect(x).toBeCloseTo(i * 10)
    expect(y).toBeCloseTo(0)
  }
})

test('arcs stay on their circle', () => {
  const samples = samplePathData('M 100 0 A 100 100 0 1 1 -100 0 A 100 100 0 1 1 100 0', 64)
  for (let i = 0; i < 64; i++) {
    const [x, y] = pointAt(samples, i)
    expect(Math.hypot(x, y)).toBeCloseTo(100, 0)
  }
})

test('relative commands resolve against the current point', () => {
  const absolute = samplePathData('M 10 10 L 60 10 L 60 60', 20, 0)
  const relative = samplePathData('M 10 10 l 50 0 l 0 50', 20, 0)
  expect(Array.from(relative)).toEqual(Array.from(absolute))
})

test('sharp corners are filleted so the tube never kinks', () => {
  const samples = samplePathData('M 0 0 L 200 0 L 200 200', 200, 40)
  const touchesCorner = Array.from({ length: 200 }, (_, i) => pointAt(samples, i)).some(([x, y]) => Math.hypot(x - 200, y) < 5)
  expect(touchesCorner).toBe(false)
})

test('malformed path data is rejected', () => {
  expect(() => samplePathData('M 0 0 L 10', 4)).toThrow(/Malformed path data/)
})
