import { describe, expect, it } from 'vitest'
import {
  classifyTarget,
  formatReadout,
  INTERACTIVE_SELECTOR,
  isSettled,
  readoutPlacement,
  stepCriticallyDamped,
  TEXT_FIELD_SELECTOR,
} from './cursor-math'

function elementMatching(...selectors: string[]): Pick<Element, 'closest'> {
  const match = {} as Element
  return { closest: (selector: string) => (selectors.includes(selector) ? match : null) } as Pick<Element, 'closest'>
}

function simulate(start: number, target: number, omega: number, frames: number, frameSeconds: number) {
  let state = { position: start, velocity: 0 }
  const positions: number[] = []
  for (let frame = 0; frame < frames; frame += 1) {
    state = stepCriticallyDamped(state, target, omega, frameSeconds)
    positions.push(state.position)
  }
  return { state, positions }
}

describe('stepCriticallyDamped', () => {
  it('leaves a resting spring on its target untouched', () => {
    expect(stepCriticallyDamped({ position: 120, velocity: 0 }, 120, 40, 0.016)).toEqual({ position: 120, velocity: 0 })
  })

  it('does not move when no time has passed', () => {
    expect(stepCriticallyDamped({ position: 0, velocity: 0 }, 100, 40, 0)).toEqual({ position: 0, velocity: 0 })
  })

  it('approaches the target without ever overshooting it', () => {
    const { positions } = simulate(0, 100, 46, 60, 1 / 60)
    for (const position of positions) expect(position).toBeLessThanOrEqual(100)
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index]).toBeGreaterThanOrEqual(positions[index - 1])
    }
  })

  it('settles within half a second at the cursor smoothing rate', () => {
    const { state } = simulate(0, 400, 46, 30, 1 / 60)
    expect(isSettled(state, 400)).toBe(true)
  })

  it('gives the same result whether it runs in one step or many', () => {
    const single = stepCriticallyDamped({ position: 0, velocity: 0 }, 100, 30, 0.1)
    const { state } = simulate(0, 100, 30, 10, 0.01)
    expect(state.position).toBeCloseTo(single.position, 6)
    expect(state.velocity).toBeCloseTo(single.velocity, 6)
  })
})

describe('isSettled', () => {
  it('needs both a close position and a low velocity', () => {
    expect(isSettled({ position: 100.01, velocity: 0.1 }, 100)).toBe(true)
    expect(isSettled({ position: 100.01, velocity: 20 }, 100)).toBe(false)
    expect(isSettled({ position: 103, velocity: 0 }, 100)).toBe(false)
  })
})

describe('classifyTarget', () => {
  it('shows the crosshair over plain content and over nothing', () => {
    expect(classifyTarget(elementMatching(), false)).toBe('crosshair')
    expect(classifyTarget(null, false)).toBe('crosshair')
  })

  it('morphs into a ring over interactive elements', () => {
    expect(classifyTarget(elementMatching(INTERACTIVE_SELECTOR), false)).toBe('ring')
  })

  it('morphs into a ring while the world reports a hovered hotspot', () => {
    expect(classifyTarget(elementMatching(), true)).toBe('ring')
    expect(classifyTarget(null, true)).toBe('ring')
  })

  it('hands the pointer back to the browser over text fields', () => {
    expect(classifyTarget(elementMatching(TEXT_FIELD_SELECTOR, INTERACTIVE_SELECTOR), true)).toBe('native')
  })
})

describe('formatReadout', () => {
  it('appends the unit to the altimeter value', () => {
    expect(formatReadout('24')).toBe('24 m')
    expect(formatReadout(' 0 ')).toBe('0 m')
  })

  it('stays empty when the altimeter is missing or not numeric', () => {
    expect(formatReadout(null)).toBe('')
    expect(formatReadout(undefined)).toBe('')
    expect(formatReadout('')).toBe('')
    expect(formatReadout('n/a')).toBe('')
  })
})

describe('readoutPlacement', () => {
  const bounds = { width: 50, height: 14, viewportWidth: 1280, viewportHeight: 720 }

  it('keeps the readout below and right of the pointer in open space', () => {
    expect(readoutPlacement(400, 300, bounds)).toEqual({ flipX: false, flipY: false })
  })

  it('flips toward the inside near the right and bottom edges', () => {
    expect(readoutPlacement(1250, 300, bounds)).toEqual({ flipX: true, flipY: false })
    expect(readoutPlacement(400, 710, bounds)).toEqual({ flipX: false, flipY: true })
    expect(readoutPlacement(1250, 710, bounds)).toEqual({ flipX: true, flipY: true })
  })
})
