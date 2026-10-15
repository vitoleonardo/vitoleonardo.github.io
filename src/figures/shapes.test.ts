import { expect, test } from 'vitest'
import type { FigureId } from '../types'
import { buildShape, chaikin, FIGURE_POINT_COUNT, resampleEven, SHAPES, type Point } from './shapes'

const FIGURE_IDS = Object.keys(SHAPES) as FigureId[]

function spacing(points: Float32Array): number[] {
  const gaps: number[] = []
  for (let i = 1; i < points.length / 3; i++) {
    gaps.push(Math.hypot(points[i * 3] - points[(i - 1) * 3], points[i * 3 + 1] - points[(i - 1) * 3 + 1], points[i * 3 + 2] - points[(i - 1) * 3 + 2]))
  }
  return gaps
}

test.each(FIGURE_IDS)('%s builds the shared point count with finite coordinates and radii', (id) => {
  const shape = buildShape(id)
  expect(shape.points).toHaveLength(FIGURE_POINT_COUNT * 3)
  expect(shape.radius).toHaveLength(FIGURE_POINT_COUNT)
  expect(shape.points.every(Number.isFinite)).toBe(true)
  expect(shape.radius.every((radius) => radius > 0 && radius <= 1)).toBe(true)
})

test('chaikin keeps both endpoints and rounds the corner', () => {
  const corner: Point[] = [[0, 0], [100, 0], [100, 100]]
  const smoothed = chaikin(corner)
  expect(smoothed[0]).toEqual([0, 0])
  expect(smoothed[smoothed.length - 1]).toEqual([100, 100])
  expect(smoothed.some(([x, y]) => x === 100 && y === 0)).toBe(false)
})

test('resampleEven spaces points evenly along the arc', () => {
  const polyline: Point[] = [[0, 0], [10, 0], [10, 300], [400, 300]]
  const step = 700 / 199
  const gaps = spacing(resampleEven(polyline, 200))
  const cornerCuts = gaps.filter((gap) => Math.abs(gap - step) > 1e-3)
  gaps.forEach((gap) => expect(gap).toBeLessThanOrEqual(step + 1e-3))
  expect(cornerCuts.length).toBeLessThanOrEqual(2)
})
