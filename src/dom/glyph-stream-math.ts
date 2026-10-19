import type { Spring } from './cursor-math'

export interface Rgb {
  r: number
  g: number
  b: number
}

export function stepUnderdamped(state: Spring, target: number, omega: number, zeta: number, seconds: number): Spring {
  const acceleration = omega * omega * (target - state.position) - 2 * zeta * omega * state.velocity
  const velocity = state.velocity + acceleration * seconds
  return { position: state.position + velocity * seconds, velocity }
}

export function hash(seed: number): number {
  let value = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b)
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296
}

export function parseHexColor(hex: string): Rgb {
  const digits = hex.trim().replace('#', '')
  const expanded = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits
  const value = Number.parseInt(expanded.slice(0, 6), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

function toLinear(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

function toGamma(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear))
  const normalized = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055
  return Math.round(normalized * 255)
}

function toOklab({ r, g, b }: Rgb): [number, number, number] {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function fromOklab([L, a, b]: [number, number, number]): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return {
    r: toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  }
}

export function mixOklab(from: Rgb, to: Rgb, amount: number): Rgb {
  const t = Math.min(1, Math.max(0, amount))
  const a = toOklab(from)
  const b = toOklab(to)
  return fromOklab([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
}

export function buildRamp(from: Rgb, to: Rgb, steps: number): Rgb[] {
  return Array.from({ length: steps }, (_, index) => mixOklab(from, to, index / (steps - 1)))
}

export function rgbString({ r, g, b }: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function strokeRadius(speed: number, cellSize: number, thickness: number): number {
  const swell = Math.min(1, speed / 1600)
  return cellSize * thickness * (0.55 + swell * 1.6)
}

export function dropRadius(base: number, age: number, breakup: number, seed: number): number {
  const evaporated = base * (1 - age) ** 0.6
  const pinch = 1 - breakup * smoothstep(0.3, 1, age) * (0.3 + 0.7 * hash(seed))
  return evaporated * pinch
}

export function glyphIndex(seed: number, age: number, now: number, scramblePerSecond: number, poolSize: number): number {
  const scrambling = age < 0.35
  const phase = scrambling ? Math.floor(now * scramblePerSecond) : 0
  return Math.floor(hash(seed + phase * 7919) * poolSize)
}
