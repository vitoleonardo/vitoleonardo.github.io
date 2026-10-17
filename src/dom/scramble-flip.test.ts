import { describe, expect, it } from 'vitest'
import {
  canStartFlip,
  DIGIT_GLYPHS,
  FLIP_COOLDOWN_MS,
  FLIP_MAX_MS,
  FLIP_MIN_MS,
  flipDuration,
  flipPhase,
  GLYPH_SWAP_MS,
  glyphPoolFor,
  lettersNear,
  MAX_START_DELAY_MS,
  pickGlyph,
  SCRAMBLE_GLYPHS,
  startDelay,
} from './scramble-flip'

describe('glyphPoolFor', () => {
  it('flips digits to digits so numbers keep reading as numbers', () => {
    expect(glyphPoolFor('7')).toBe(DIGIT_GLYPHS)
  })

  it('flips letters and symbols through the full split-flap set', () => {
    expect(glyphPoolFor('k')).toBe(SCRAMBLE_GLYPHS)
    expect(glyphPoolFor('+')).toBe(SCRAMBLE_GLYPHS)
  })
})

describe('pickGlyph', () => {
  it('only picks glyphs from the pool', () => {
    for (let step = 0; step <= 20; step += 1) {
      expect(Array.from(SCRAMBLE_GLYPHS)).toContain(pickGlyph(SCRAMBLE_GLYPHS, 'a', step / 20))
    }
  })

  it('never picks the letter it replaces, whatever its case', () => {
    for (let step = 0; step <= 40; step += 1) {
      expect(pickGlyph(SCRAMBLE_GLYPHS, 'q', step / 40)).not.toBe('Q')
      expect(pickGlyph(DIGIT_GLYPHS, '3', step / 40)).not.toBe('3')
    }
  })

  it('survives the upper edge of the random range', () => {
    expect(pickGlyph(DIGIT_GLYPHS, '0', 1)).toBe('9')
  })
})

describe('flipDuration', () => {
  it('stays within 180 and 300 ms', () => {
    expect(flipDuration(0)).toBe(FLIP_MIN_MS)
    expect(flipDuration(1)).toBe(FLIP_MAX_MS)
    expect(flipDuration(7)).toBe(FLIP_MAX_MS)
    expect(flipDuration(-3)).toBe(FLIP_MIN_MS)
  })
})

describe('canStartFlip', () => {
  it('allows a letter that never flipped', () => {
    expect(canStartFlip(undefined, 5)).toBe(true)
  })

  it('blocks a second burst inside the cooldown and allows it afterwards', () => {
    expect(canStartFlip(1000, 1000 + FLIP_COOLDOWN_MS - 1)).toBe(false)
    expect(canStartFlip(1000, 1000 + FLIP_COOLDOWN_MS)).toBe(true)
  })
})

describe('startDelay', () => {
  it('ripples outward from the pointer', () => {
    expect(startDelay(0, 80)).toBe(0)
    expect(startDelay(40, 80)).toBe(MAX_START_DELAY_MS / 2)
    expect(startDelay(80, 80)).toBe(MAX_START_DELAY_MS)
  })

  it('stays inside its bounds for degenerate input', () => {
    expect(startDelay(500, 80)).toBe(MAX_START_DELAY_MS)
    expect(startDelay(10, 0)).toBe(0)
  })
})

describe('lettersNear', () => {
  const row = [0, 1, 2, 3, 4, 5, 6, 7].map((slot) => ({ x: slot * 30, y: 100 }))

  it('selects a handful of neighbours sorted by distance', () => {
    const near = lettersNear(row, { x: 92, y: 100 }, 70)
    expect(near.map((letter) => letter.index)).toEqual([3, 4, 2, 5, 1])
    expect(near[0].distance).toBeLessThan(near[1].distance)
  })

  it('selects nothing when the pointer is far away', () => {
    expect(lettersNear(row, { x: 900, y: 100 }, 70)).toEqual([])
  })

  it('weights the vertical axis so neighbouring lines stay out of the burst', () => {
    const lines = [
      { x: 100, y: 100 },
      { x: 100, y: 160 },
    ]
    expect(lettersNear(lines, { x: 100, y: 100 }, 90).map((letter) => letter.index)).toEqual([0])
    expect(lettersNear(lines, { x: 100, y: 100 }, 90, 1).map((letter) => letter.index)).toEqual([0, 1])
  })
})

describe('flipPhase', () => {
  const flip = { startsAt: 100, endsAt: 340, swappedAt: Number.NEGATIVE_INFINITY }

  it('waits for the start delay before changing anything', () => {
    expect(flipPhase(flip, 99)).toBe('pending')
  })

  it('swaps immediately at the start and again once the swap interval passed', () => {
    expect(flipPhase(flip, 100)).toBe('swap')
    expect(flipPhase({ ...flip, swappedAt: 100 }, 100 + GLYPH_SWAP_MS - 1)).toBe('hold')
    expect(flipPhase({ ...flip, swappedAt: 100 }, 100 + GLYPH_SWAP_MS)).toBe('swap')
  })

  it('is done at the end time and stays done', () => {
    expect(flipPhase(flip, 340)).toBe('done')
    expect(flipPhase(flip, 5000)).toBe('done')
  })
})
