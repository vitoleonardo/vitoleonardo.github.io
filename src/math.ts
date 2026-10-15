export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : Number.isFinite(value) ? value : 0
}

export function between(value: number, from: number, to: number): number {
  return clamp01((value - from) / (to - from))
}

export function smooth(value: number): number {
  const x = clamp01(value)
  return x * x * (3 - 2 * x)
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  return smooth(between(value, edge0, edge1))
}

export function sineInOut(value: number): number {
  return 0.5 - 0.5 * Math.cos(clamp01(value) * Math.PI)
}

export function quartOut(value: number): number {
  return 1 - Math.pow(1 - clamp01(value), 4)
}
