import { describe, expect, test } from 'vitest'
import { anchorsFromLayout, chapterAt, progressFromScroll } from './conductor'

const viewport = 900
const weights = [1.2, 1.4, 1.3, 1.2, 1.2, 1.2, 1.2, 1.6, 1.3, 1.4, 1.2]
const heights = weights.map((weight) => weight * viewport)
const tops = heights.map((_, index) => heights.slice(0, index).reduce((sum, height) => sum + height, 0))
const maxScroll = heights.reduce((sum, height) => sum + height, 0) - viewport
const anchors = anchorsFromLayout(tops, maxScroll)

describe('anchorsFromLayout', () => {
  test('starts at zero, follows section tops and stays inside the scroll range', () => {
    expect(anchors[0]).toBe(0)
    expect(anchors.slice(1)).toEqual(tops.slice(1))
    expect(Math.max(...anchors)).toBeLessThanOrEqual(maxScroll)
  })

  test('forces strictly increasing anchors when sections collapse or overflow', () => {
    const collapsed = anchorsFromLayout([40, 500, 500, 2000], 1000)
    expect(collapsed).toEqual([0, 500, 501, 1000])
  })
})

describe('progressFromScroll', () => {
  test('section tops map to whole chapters', () => {
    anchors.forEach((anchor, index) => expect(progressFromScroll(anchor, anchors)).toBe(index))
  })

  test('a chapter spends its own section height going from 0 to 1', () => {
    const indexChapter = 1
    const halfway = tops[indexChapter] + heights[indexChapter] / 2
    expect(progressFromScroll(halfway, anchors)).toBeCloseTo(1.5)
    const heavier = progressFromScroll(tops[7] + 900, anchors) - 7
    const lighter = progressFromScroll(tops[3] + 900, anchors) - 3
    expect(heavier).toBeLessThan(lighter)
  })

  test('clamps above the first and below the last anchor', () => {
    expect(progressFromScroll(-200, anchors)).toBe(0)
    expect(progressFromScroll(maxScroll + 500, anchors)).toBe(anchors.length - 1)
  })

  test('is monotonic and identical when scrolling back', () => {
    const samples = Array.from({ length: 501 }, (_, step) => (step / 500) * maxScroll)
    const forward = samples.map((y) => progressFromScroll(y, anchors))
    forward.slice(1).forEach((progress, index) => expect(progress).toBeGreaterThanOrEqual(forward[index]))
    const backward = [...samples].reverse().map((y) => progressFromScroll(y, anchors))
    expect(backward.reverse()).toEqual(forward)
  })

  test('falls back to the first chapter without enough anchors', () => {
    expect(progressFromScroll(300, [0])).toBe(0)
  })
})

describe('chapterAt', () => {
  test('owns the chapter whose composition is nearest', () => {
    expect(chapterAt(0.49, 11)).toBe(0)
    expect(chapterAt(0.5, 11)).toBe(1)
    expect(chapterAt(-1, 11)).toBe(0)
    expect(chapterAt(42, 11)).toBe(10)
  })
})
