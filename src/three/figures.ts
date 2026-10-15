import { MOBILE_FIGURE_PATHS } from '../figures/paths'
import { buildShape, FIGURE_POINT_COUNT, SHAPES } from '../figures/shapes'
import type { FigureId } from '../types'
import { samplePathData } from './svg-path'

export const PATH_POINT_COUNT = FIGURE_POINT_COUNT
export const FIGURE_IDS = Object.keys(SHAPES) as FigureId[]

export type FigureVariant = 'desktop' | 'mobile'

export interface Figure {
  id: FigureId
  variant: FigureVariant
  points: Float32Array
  radius: Float32Array
  fill: boolean
}

const MOBILE_FILLET = 100
const cache = new Map<string, Figure>()

function mobileFigure(id: FigureId): Figure | null {
  const source = MOBILE_FIGURE_PATHS[id]
  if (!source) return null
  const flat = samplePathData(source.d, PATH_POINT_COUNT, MOBILE_FILLET)
  const points = new Float32Array(PATH_POINT_COUNT * 3)
  for (let i = 0; i < PATH_POINT_COUNT; i++) {
    points[i * 3] = flat[i * 2]
    points[i * 3 + 1] = flat[i * 2 + 1]
  }
  const radius = new Float32Array(PATH_POINT_COUNT).fill(1)
  const desktopRadius = SHAPES[id].radius
  if (desktopRadius) for (let i = 0; i < PATH_POINT_COUNT; i++) radius[i] = desktopRadius(points[i * 3], points[i * 3 + 1])
  return { id, variant: 'mobile', points, radius, fill: true }
}

export function getFigure(id: FigureId, variant: FigureVariant): Figure {
  const key = `${variant}:${id}`
  let figure = cache.get(key)
  if (figure) return figure
  figure = variant === 'mobile' ? mobileFigure(id) ?? undefined : undefined
  if (!figure) {
    const desktopKey = `desktop:${id}`
    figure = cache.get(desktopKey)
    if (!figure) {
      const built = buildShape(id)
      figure = { id, variant: 'desktop', points: built.points, radius: built.radius, fill: false }
      cache.set(desktopKey, figure)
    }
  }
  cache.set(key, figure)
  return figure
}

export function sampleAllFigures(variant: FigureVariant): void {
  for (const id of FIGURE_IDS) getFigure(id, variant)
}

export function lastIndexWhere(figure: Figure, test: (x: number, y: number) => boolean): number {
  let found = -1
  for (let i = 0; i < PATH_POINT_COUNT; i++) if (test(figure.points[i * 3], figure.points[i * 3 + 1])) found = i
  return found
}
