import { expect, test } from 'vitest'
import { NO_BUFFER, resizedBuffer } from './buffer'

test('the first measurement always allocates', () => {
  expect(resizedBuffer(NO_BUFFER, 393, 852, 3, 1.5)).toEqual({ width: 393, height: 852, pixelRatio: 1.5 })
})

test('an unchanged size keeps the buffer', () => {
  const current = { width: 393, height: 852, pixelRatio: 1.5 }
  expect(resizedBuffer(current, 393, 852, 3, 1.5)).toBeNull()
})

test('a pixel ratio change above the cap keeps the buffer', () => {
  const current = { width: 393, height: 852, pixelRatio: 1.5 }
  expect(resizedBuffer(current, 393, 852, 2, 1.5)).toBeNull()
})

test('a new height or pixel ratio reallocates once', () => {
  const current = { width: 393, height: 852, pixelRatio: 1.5 }
  expect(resizedBuffer(current, 393, 659, 3, 1.5)).toEqual({ width: 393, height: 659, pixelRatio: 1.5 })
  expect(resizedBuffer(current, 393, 852, 1, 1.5)).toEqual({ width: 393, height: 852, pixelRatio: 1 })
})

test('a missing device pixel ratio counts as 1', () => {
  expect(resizedBuffer(NO_BUFFER, 100, 100, 0, 2)?.pixelRatio).toBe(1)
})
