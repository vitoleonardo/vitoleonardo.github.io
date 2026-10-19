export interface Point {
  x: number
  y: number
}

export interface Flip {
  startsAt: number
  endsAt: number
  swappedAt: number
}

export interface NearbyLetter {
  index: number
  distance: number
}

export type FlipPhase = 'pending' | 'swap' | 'hold' | 'done'

export const SCRAMBLE_GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#/↑↓'
export const DIGIT_GLYPHS = '0123456789'
export const FLIP_COOLDOWN_MS = 600
export const FLIP_MIN_MS = 180
export const FLIP_MAX_MS = 300
export const GLYPH_SWAP_MS = 55
export const MAX_START_DELAY_MS = 90
export const VERTICAL_WEIGHT = 2

export function glyphPoolFor(original: string): string {
  return /^\d$/.test(original) ? DIGIT_GLYPHS : SCRAMBLE_GLYPHS
}

export function pickGlyph(pool: string, original: string, random: number): string {
  const glyphs = Array.from(pool).filter((glyph) => glyph !== original.toUpperCase())
  const index = Math.min(glyphs.length - 1, Math.floor(random * glyphs.length))
  return glyphs[index]
}

export function flipDuration(random: number): number {
  return FLIP_MIN_MS + Math.min(1, Math.max(0, random)) * (FLIP_MAX_MS - FLIP_MIN_MS)
}

export function canStartFlip(lastStartedAt: number | undefined, now: number): boolean {
  return lastStartedAt === undefined || now - lastStartedAt >= FLIP_COOLDOWN_MS
}

export function startDelay(distance: number, radius: number): number {
  if (radius <= 0) return 0
  return Math.min(1, Math.max(0, distance / radius)) * MAX_START_DELAY_MS
}

export function lettersNear(
  centers: readonly Point[],
  pointer: Point,
  radius: number,
  verticalWeight = VERTICAL_WEIGHT,
): NearbyLetter[] {
  const nearby: NearbyLetter[] = []
  centers.forEach((center, index) => {
    const distance = Math.hypot(center.x - pointer.x, (center.y - pointer.y) * verticalWeight)
    if (distance <= radius) nearby.push({ index, distance })
  })
  return nearby.sort((first, second) => first.distance - second.distance)
}

export function flipPhase(flip: Flip, now: number): FlipPhase {
  if (now >= flip.endsAt) return 'done'
  if (now < flip.startsAt) return 'pending'
  return now - flip.swappedAt >= GLYPH_SWAP_MS ? 'swap' : 'hold'
}
