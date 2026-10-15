import type { FigureId } from '../types'

export type Point = [number, number, number?]

export interface ShapeSpec {
  points: Point[]
  smooth: boolean
  radius?: (x: number, y: number) => number
}

export interface BuiltShape {
  key: FigureId
  points: Float32Array
  radius: Float32Array
}

export const FIGURE_POINT_COUNT = 520
const VIDEO_TO_STAGE_Y = 80
const CHAIKIN_ITERATIONS = 5

export const HERO_IMPACT = { x: 1040, y: 560 }
export const SUN_REST = { x: 1040, y: 190, radius: 64 }
export const SUN_IMPACT_Y = 500
const INDEX_LINE_Y = 308
export const AGENT_LOOP = { x: 880, y: 330, radius: 150 }
export const TEACHING_SPIRAL = { x: 900, y: 300, outer: 200, inner: 22, turns: 3.2 }
export const SAY_HI_LOOP = { x: 640, y: 360, radius: 250 }
export const DATA_BRAID = { mergeX: 905, taperFrom: 560, taperTo: 900, thin: 0.22 }
const BACKEND_LANES = [100, 195, 290, 385, 480]
const BACKEND_TURN = { left: 660, right: 1210, reach: 1.5 }
const BACKEND_SAG = 6

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, steps: number): Point[] {
  const out: Point[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
  return out
}

function arc(
  cx: number,
  cy: number,
  radiusFrom: number,
  radiusTo: number,
  angleFrom: number,
  angleTo: number,
  depthFrom = 0,
  depthTo = 0,
): Point[] {
  const steps = Math.max(8, Math.ceil(Math.abs(angleTo - angleFrom) / (Math.PI / 36)))
  const out: Point[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const angle = angleFrom + (angleTo - angleFrom) * t
    const radius = radiusFrom + (radiusTo - radiusFrom) * t
    out.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), depthFrom + (depthTo - depthFrom) * t])
  }
  return out
}

function roundedCorner(from: Point, corner: Point, to: Point, reach: number): Point[] {
  const toward = (target: Point): Point => {
    const dx = target[0] - corner[0]
    const dy = target[1] - corner[1]
    const length = Math.hypot(dx, dy) || 1
    const step = Math.min(reach * 2, length / 2)
    return [corner[0] + (dx / length) * step, corner[1] + (dy / length) * step]
  }
  return [toward(from), corner, toward(to)]
}

function uTurn(x: number, fromY: number, toY: number, inward: number, stretch: number): Point[] {
  const reach = Math.abs(toY - fromY) * stretch
  return [[x + inward * reach, fromY], [x, fromY], [x, toY], [x + inward * reach, toY]]
}

function wave(): Point[] {
  const out: Point[] = []
  for (let x = -80; x <= 1360; x += 10) out.push([x, 540 + 42 * Math.sin((x - 200) / 170)])
  return out
}

const TURN = Math.PI * 2
const LOOP_DEPTH = -40

export const SHAPES: Record<FigureId, ShapeSpec> = {
  hero: { smooth: false, points: [[-80, 560], [1360, 560]] },
  index: { smooth: false, points: [[-80, INDEX_LINE_Y], [1360, INDEX_LINE_Y]] },
  frontend: {
    smooth: true,
    points: [
      [-80, 480],
      [540, 480],
      [620, 470],
      ...roundedCorner([620, 470], [620, 130], [1210, 130], 100),
      ...roundedCorner([620, 130], [1210, 130], [1210, 480], 88),
      ...roundedCorner([1210, 130], [1210, 480], [700, 480], 88),
      [700, 480],
    ],
  },
  backend: {
    smooth: true,
    points: [
      [-80, 480],
      [600, 480],
      ...roundedCorner([600, 480], [600, BACKEND_LANES[0]], [BACKEND_TURN.right, BACKEND_LANES[0]], 110),
      ...BACKEND_LANES.slice(0, -1).flatMap((y, lane): Point[] => {
        const rightward = lane % 2 === 0
        const x = rightward ? BACKEND_TURN.right : BACKEND_TURN.left
        const sag: Point = [(BACKEND_TURN.left + BACKEND_TURN.right) / 2, y + BACKEND_SAG]
        return [sag, ...uTurn(x, y, BACKEND_LANES[lane + 1], rightward ? -1 : 1, BACKEND_TURN.reach)]
      }),
      [(BACKEND_TURN.left + 1360) / 2, BACKEND_LANES[BACKEND_LANES.length - 1] + BACKEND_SAG],
      [1360, BACKEND_LANES[BACKEND_LANES.length - 1]],
    ],
  },
  cloud: {
    smooth: true,
    points: [[-80, 480], [640, 480], [640, 390], [780, 390], [780, 300], [920, 300], [920, 210], [1060, 210], [1060, 120], [1360, 120]],
  },
  data: {
    smooth: false,
    points: [[-80, 470], ...cubic([-80, 470], [500, 470], [700, 400], [1360, 400], 160)],
    radius: (x) => DATA_BRAID.thin + (1 - DATA_BRAID.thin) * smoothstep(DATA_BRAID.taperFrom, DATA_BRAID.taperTo, x),
  },
  'ai-products': {
    smooth: true,
    points: [
      [-80, 480],
      [AGENT_LOOP.x, AGENT_LOOP.y + AGENT_LOOP.radius],
      ...arc(AGENT_LOOP.x, AGENT_LOOP.y, AGENT_LOOP.radius, AGENT_LOOP.radius, TURN / 4, TURN / 4 - 1.25 * TURN, 0, LOOP_DEPTH),
      [1360, AGENT_LOOP.y, LOOP_DEPTH],
    ],
  },
  'ai-coding': {
    smooth: true,
    points: [[-80, 480], [700, 480], ...cubic([700, 480], [880, 480], [940, 420], [940, 330], 24), [940, 175]],
  },
  teaching: {
    smooth: true,
    points: [
      [-80, 520],
      [640, 520],
      [700, 500],
      [700, TEACHING_SPIRAL.y],
      ...arc(
        TEACHING_SPIRAL.x,
        TEACHING_SPIRAL.y,
        TEACHING_SPIRAL.outer,
        TEACHING_SPIRAL.inner,
        Math.PI,
        Math.PI + TEACHING_SPIRAL.turns * TURN,
      ),
    ],
  },
  about: { smooth: false, points: wave() },
  'say-hi': {
    smooth: true,
    points: [
      [SAY_HI_LOOP.x, -80],
      [SAY_HI_LOOP.x, SAY_HI_LOOP.y - SAY_HI_LOOP.radius],
      ...arc(SAY_HI_LOOP.x, SAY_HI_LOOP.y, SAY_HI_LOOP.radius, SAY_HI_LOOP.radius, -TURN / 4, -TURN / 4 + TURN * 0.985, 0, LOOP_DEPTH),
    ],
  },
}

export function chaikin(points: Point[], iterations = CHAIKIN_ITERATIONS): Point[] {
  let current = points
  for (let pass = 0; pass < iterations; pass++) {
    const next: Point[] = [current[0]]
    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i]
      const b = current[i + 1]
      const az = a[2] ?? 0
      const bz = b[2] ?? 0
      next.push(
        [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, az * 0.75 + bz * 0.25],
        [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, az * 0.25 + bz * 0.75],
      )
    }
    next.push(current[current.length - 1])
    current = next
  }
  return current
}

export function resampleEven(points: Point[], count = FIGURE_POINT_COUNT): Float32Array {
  const lengths = [0]
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0]
    const dy = points[i][1] - points[i - 1][1]
    lengths.push(lengths[i - 1] + Math.hypot(dx, dy))
  }
  const total = lengths[lengths.length - 1]
  const out = new Float32Array(count * 3)
  let segment = 1
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1)
    while (segment < points.length - 1 && lengths[segment] < target) segment++
    const span = lengths[segment] - lengths[segment - 1]
    const t = span > 0 ? Math.min(1, Math.max(0, (target - lengths[segment - 1]) / span)) : 0
    const a = points[segment - 1]
    const b = points[segment]
    out[i * 3] = a[0] + (b[0] - a[0]) * t
    out[i * 3 + 1] = a[1] + (b[1] - a[1]) * t
    out[i * 3 + 2] = (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t
  }
  return out
}

export function buildShape(key: FigureId, spec: ShapeSpec = SHAPES[key], count = FIGURE_POINT_COUNT): BuiltShape {
  const smoothed = spec.smooth ? chaikin(spec.points) : spec.points
  const points = resampleEven(smoothed, count)
  const radius = new Float32Array(count).fill(1)
  for (let i = 0; i < count; i++) {
    if (spec.radius) radius[i] = spec.radius(points[i * 3], points[i * 3 + 1])
    points[i * 3 + 1] += VIDEO_TO_STAGE_Y
  }
  return { key, points, radius }
}

export function toStageY(videoY: number): number {
  return videoY + VIDEO_TO_STAGE_Y
}
