type Point = { x: number; y: number }

const CURVE_SUBDIVISIONS = 48
const ARC_DEGREES_PER_SUBDIVISION = 3

function tokenize(d: string): (string | number)[] {
  const tokens: (string | number)[] = []
  const pattern = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(d)) !== null) {
    if (match[1]) tokens.push(match[1])
    else tokens.push(Number.parseFloat(match[2]))
  }
  return tokens
}

function pushQuadratic(out: Point[], p0: Point, p1: Point, p2: Point): void {
  for (let step = 1; step <= CURVE_SUBDIVISIONS; step++) {
    const t = step / CURVE_SUBDIVISIONS
    const u = 1 - t
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    })
  }
}

function pushCubic(out: Point[], p0: Point, p1: Point, p2: Point, p3: Point): void {
  for (let step = 1; step <= CURVE_SUBDIVISIONS; step++) {
    const t = step / CURVE_SUBDIVISIONS
    const u = 1 - t
    const a = u * u * u
    const b = 3 * u * u * t
    const c = 3 * u * t * t
    const e = t * t * t
    out.push({
      x: a * p0.x + b * p1.x + c * p2.x + e * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + e * p3.y,
    })
  }
}

function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const sign = ux * vy - uy * vx < 0 ? -1 : 1
  const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))
  return sign * Math.acos(Math.min(1, Math.max(-1, dot)))
}

function pushArc(
  out: Point[],
  start: Point,
  radiusX: number,
  radiusY: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  end: Point,
): void {
  if (radiusX === 0 || radiusY === 0 || (start.x === end.x && start.y === end.y)) {
    out.push({ ...end })
    return
  }
  const phi = (rotationDeg * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const halfDx = (start.x - end.x) / 2
  const halfDy = (start.y - end.y) / 2
  const x1p = cosPhi * halfDx + sinPhi * halfDy
  const y1p = -sinPhi * halfDx + cosPhi * halfDy
  let rx = Math.abs(radiusX)
  let ry = Math.abs(radiusY)
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const grow = Math.sqrt(lambda)
    rx *= grow
    ry *= grow
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  let factor = Math.sqrt(Math.max(0, numerator / denominator))
  if (largeArc === sweep) factor = -factor
  const cxp = (factor * rx * y1p) / ry
  const cyp = (-factor * ry * x1p) / rx
  const cx = cosPhi * cxp - sinPhi * cyp + (start.x + end.x) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (start.y + end.y) / 2
  const theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let deltaTheta = vectorAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && deltaTheta > 0) deltaTheta -= Math.PI * 2
  if (sweep && deltaTheta < 0) deltaTheta += Math.PI * 2
  const steps = Math.max(8, Math.ceil(Math.abs((deltaTheta * 180) / Math.PI) / ARC_DEGREES_PER_SUBDIVISION))
  for (let step = 1; step <= steps; step++) {
    const theta = theta1 + (deltaTheta * step) / steps
    const ex = rx * Math.cos(theta)
    const ey = ry * Math.sin(theta)
    out.push({ x: cosPhi * ex - sinPhi * ey + cx, y: sinPhi * ex + cosPhi * ey + cy })
  }
}

function flattenSvgPath(d: string): Point[] {
  const tokens = tokenize(d)
  const out: Point[] = []
  let index = 0
  let command = ''
  let current: Point = { x: 0, y: 0 }
  let subpathStart: Point = { x: 0, y: 0 }
  let lastControl: Point | null = null
  let lastCommand = ''

  const nextNumber = (): number => {
    const value = tokens[index++]
    if (typeof value !== 'number') throw new Error(`Malformed path data near token ${index}`)
    return value
  }

  while (index < tokens.length) {
    const token = tokens[index]
    if (typeof token === 'string') {
      command = token
      index++
    } else if (command === 'M') {
      command = 'L'
    } else if (command === 'm') {
      command = 'l'
    }
    const relative = command === command.toLowerCase()
    const base = relative ? current : { x: 0, y: 0 }
    const upper = command.toUpperCase()

    switch (upper) {
      case 'M': {
        current = { x: base.x + nextNumber(), y: base.y + nextNumber() }
        subpathStart = { ...current }
        out.push({ ...current })
        lastControl = null
        break
      }
      case 'L': {
        current = { x: base.x + nextNumber(), y: base.y + nextNumber() }
        out.push({ ...current })
        lastControl = null
        break
      }
      case 'H': {
        current = { x: (relative ? current.x : 0) + nextNumber(), y: current.y }
        out.push({ ...current })
        lastControl = null
        break
      }
      case 'V': {
        current = { x: current.x, y: (relative ? current.y : 0) + nextNumber() }
        out.push({ ...current })
        lastControl = null
        break
      }
      case 'Q':
      case 'T': {
        let control: Point
        if (upper === 'Q') {
          control = { x: base.x + nextNumber(), y: base.y + nextNumber() }
        } else {
          const reflectable = lastControl && (lastCommand === 'Q' || lastCommand === 'T')
          control = reflectable && lastControl
            ? { x: 2 * current.x - lastControl.x, y: 2 * current.y - lastControl.y }
            : { ...current }
        }
        const end = { x: base.x + nextNumber(), y: base.y + nextNumber() }
        pushQuadratic(out, current, control, end)
        lastControl = control
        current = end
        break
      }
      case 'C':
      case 'S': {
        let firstControl: Point
        if (upper === 'C') {
          firstControl = { x: base.x + nextNumber(), y: base.y + nextNumber() }
        } else {
          const reflectable = lastControl && (lastCommand === 'C' || lastCommand === 'S')
          firstControl = reflectable && lastControl
            ? { x: 2 * current.x - lastControl.x, y: 2 * current.y - lastControl.y }
            : { ...current }
        }
        const secondControl = { x: base.x + nextNumber(), y: base.y + nextNumber() }
        const end = { x: base.x + nextNumber(), y: base.y + nextNumber() }
        pushCubic(out, current, firstControl, secondControl, end)
        lastControl = secondControl
        current = end
        break
      }
      case 'A': {
        const radiusX = nextNumber()
        const radiusY = nextNumber()
        const rotation = nextNumber()
        const largeArc = nextNumber() !== 0
        const sweep = nextNumber() !== 0
        const end = { x: base.x + nextNumber(), y: base.y + nextNumber() }
        pushArc(out, current, radiusX, radiusY, rotation, largeArc, sweep, end)
        current = end
        lastControl = null
        break
      }
      case 'Z': {
        current = { ...subpathStart }
        out.push({ ...current })
        lastControl = null
        break
      }
      default:
        throw new Error(`Unsupported path command ${command}`)
    }
    lastCommand = upper
  }
  return out
}

function resamplePolyline(points: Point[], count: number): Float32Array {
  const samples = new Float32Array(count * 2)
  if (points.length === 0) return samples
  const cumulative = new Float64Array(points.length)
  for (let i = 1; i < points.length; i++) {
    cumulative[i] = cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }
  const total = cumulative[points.length - 1]
  let segment = 1
  for (let sample = 0; sample < count; sample++) {
    const target = count === 1 ? 0 : (total * sample) / (count - 1)
    while (segment < points.length - 1 && cumulative[segment] < target) segment++
    const from = points[Math.max(0, segment - 1)]
    const to = points[Math.min(points.length - 1, segment)]
    const span = cumulative[Math.min(points.length - 1, segment)] - cumulative[Math.max(0, segment - 1)]
    const local = span > 0 ? (target - cumulative[segment - 1]) / span : 0
    samples[sample * 2] = from.x + (to.x - from.x) * local
    samples[sample * 2 + 1] = from.y + (to.y - from.y) * local
  }
  return samples
}

const SHARP_CORNER_DEGREES = 25
const CORNER_FILLET_RADIUS = 40
const CORNER_FILLET_STEPS = 12

function roundSharpCorners(points: Point[], radius = CORNER_FILLET_RADIUS): Point[] {
  if (points.length < 3) return points
  const rounded: Point[] = [points[0]]
  const threshold = Math.cos((SHARP_CORNER_DEGREES * Math.PI) / 180)
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1]
    const corner = points[i]
    const after = points[i + 1]
    const inLength = Math.hypot(corner.x - before.x, corner.y - before.y)
    const outLength = Math.hypot(after.x - corner.x, after.y - corner.y)
    if (inLength < 1e-6 || outLength < 1e-6) {
      rounded.push(corner)
      continue
    }
    const inX = (corner.x - before.x) / inLength
    const inY = (corner.y - before.y) / inLength
    const outX = (after.x - corner.x) / outLength
    const outY = (after.y - corner.y) / outLength
    if (inX * outX + inY * outY > threshold) {
      rounded.push(corner)
      continue
    }
    const filletRadius = Math.min(radius, inLength / 2, outLength / 2)
    const entry = { x: corner.x - inX * filletRadius, y: corner.y - inY * filletRadius }
    const exit = { x: corner.x + outX * filletRadius, y: corner.y + outY * filletRadius }
    rounded.push(entry)
    for (let step = 1; step <= CORNER_FILLET_STEPS; step++) {
      const t = step / CORNER_FILLET_STEPS
      const u = 1 - t
      rounded.push({
        x: u * u * entry.x + 2 * u * t * corner.x + t * t * exit.x,
        y: u * u * entry.y + 2 * u * t * corner.y + t * t * exit.y,
      })
    }
  }
  rounded.push(points[points.length - 1])
  return rounded
}

export function samplePathData(d: string, count: number, filletRadius = CORNER_FILLET_RADIUS): Float32Array {
  return resamplePolyline(roundSharpCorners(flattenSvgPath(d), filletRadius), count)
}
