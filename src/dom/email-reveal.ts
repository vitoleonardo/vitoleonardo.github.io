import { glyphPoolFor, pickGlyph } from './scramble-flip'

export const REVEAL_MS = 750
export const REVEAL_STEP_MS = 40

const STRUCTURAL_CHARACTER = /[^a-z0-9]/i

function frameCharacter(original: string, random: () => number): string {
  if (original !== '' && STRUCTURAL_CHARACTER.test(original)) return original
  return pickGlyph(glyphPoolFor(original), original, random())
}

export function revealProgress(elapsed: number): number {
  return Math.min(1, Math.max(0, elapsed / REVEAL_MS))
}

export function revealFrame(from: string, to: string, progress: number, random: () => number): string {
  if (progress <= 0) return from
  if (progress >= 1) return to
  const settled = Math.floor(progress * to.length)
  const length = Math.max(settled, Math.round(from.length + (to.length - from.length) * progress))
  let frame = to.slice(0, settled)
  for (let index = settled; index < length; index += 1) {
    frame += frameCharacter(to[index] ?? '', random)
  }
  return frame
}
