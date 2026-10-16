import { expect, test } from 'vitest'
import { planTop, type Span } from './anchor'

const SCREEN = 852
const SIZE = 2 * SCREEN
const PAGE = { top: 0, bottom: 12000 }
const screenAt = (top: number): Span => ({ top, bottom: top + SCREEN })
const holds = (top: number, span: Span): boolean => top <= span.top && top + SIZE >= span.bottom

test('a pair of stages that fits is covered whole, with the screen in the middle where possible', () => {
  const cover = { top: 1900.5, bottom: 3300.25 }
  const top = planTop(cover, screenAt(2300), PAGE, SIZE, null)
  expect(holds(top, cover)).toBe(true)
  expect(top).toBe(1874)
})

test('the canvas stays put while it still covers the stages', () => {
  const cover = { top: 1900, bottom: 3300 }
  expect(planTop(cover, screenAt(2700), PAGE, SIZE, 1800)).toBe(1800)
})

test('a new pair moves the canvas once and keeps it there', () => {
  const next = { top: 3100, bottom: 4400 }
  const moved = planTop(next, screenAt(3300), PAGE, SIZE, 1800)
  expect(holds(moved, next)).toBe(true)
  expect(planTop(next, screenAt(3900), PAGE, SIZE, moved)).toBe(moved)
})

test('stages taller than the canvas get a window that follows the screen', () => {
  const cover = { top: 0, bottom: 4000 }
  const first = planTop(cover, screenAt(1000), PAGE, SIZE, null)
  expect(holds(first, screenAt(1000))).toBe(true)
  expect(planTop(cover, screenAt(1100), PAGE, SIZE, first)).toBe(first)
  const moved = planTop(cover, screenAt(1500), PAGE, SIZE, first)
  expect(moved).not.toBe(first)
  expect(holds(moved, screenAt(1500))).toBe(true)
})

test('the window stops at the end of the stages', () => {
  expect(planTop({ top: 0, bottom: 4000 }, screenAt(3148), PAGE, SIZE, null)).toBe(4000 - SIZE)
})

test('the canvas never reaches past the end of the page', () => {
  const page = { top: 0, bottom: 9000 }
  expect(planTop({ top: 7900, bottom: 9160 }, screenAt(8148), page, SIZE, null)).toBe(9000 - SIZE)
})

test('a host shorter than the canvas keeps it at the top', () => {
  expect(planTop({ top: 0, bottom: 923 }, screenAt(0), { top: 0, bottom: 923 }, SIZE, null)).toBe(0)
  expect(planTop({ top: 0, bottom: 923 }, screenAt(0), { top: 0, bottom: 923 }, SIZE, 0)).toBe(0)
})

test('every plan covers what is on screen in whole pixels', () => {
  let seed = 7
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  let current: number | null = null
  for (let i = 0; i < 2000; i++) {
    const start = random() * 8000
    const cover = { top: start, bottom: start + 200 + random() * 3000 }
    const screen = screenAt(cover.top - SCREEN + random() * (cover.bottom - cover.top + SCREEN))
    const top = planTop(cover, screen, PAGE, SIZE, current)
    const visible = { top: Math.max(cover.top, screen.top), bottom: Math.min(cover.bottom, screen.bottom) }
    expect(Number.isInteger(top)).toBe(true)
    expect(holds(top, cover.bottom - cover.top <= SIZE ? cover : visible)).toBe(true)
    expect(top).toBeGreaterThanOrEqual(PAGE.top)
    expect(top + SIZE).toBeLessThanOrEqual(PAGE.bottom)
    current = top
  }
})
