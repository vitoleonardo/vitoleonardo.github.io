export type Look = 'classic' | 'vice'

const LOOK_KEY = 'vito-look'
const BLEND_SECONDS = 1.2

export function parseLook(value: string | null | undefined): Look {
  return value === 'vice' ? 'vice' : 'classic'
}

export function readLook(): Look {
  try {
    return parseLook(window.localStorage.getItem(LOOK_KEY))
  } catch {
    return 'classic'
  }
}

export function writeLook(look: Look): void {
  try {
    window.localStorage.setItem(LOOK_KEY, look)
  } catch {
    return
  }
}

export function lookTarget(look: Look): number {
  return look === 'vice' ? 1 : 0
}

export function stepLook(current: number, target: number, dt: number, reducedMotion: boolean): number {
  if (reducedMotion) return target
  const step = dt / BLEND_SECONDS
  if (Math.abs(target - current) <= step) return target
  return current + Math.sign(target - current) * step
}

export function easeLook(blend: number): number {
  const t = Math.min(1, Math.max(0, blend))
  return t * t * (3 - 2 * t)
}
