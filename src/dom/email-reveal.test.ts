import { describe, expect, it } from 'vitest'
import { revealFrame, revealProgress, REVEAL_MS } from './email-reveal'

const address = 'hello@example.com'
const label = 'Email me'
const alwaysFirst = (): number => 0

describe('revealProgress', () => {
  it('maps elapsed time onto zero to one', () => {
    expect(revealProgress(-10)).toBe(0)
    expect(revealProgress(REVEAL_MS / 2)).toBeCloseTo(0.5)
    expect(revealProgress(REVEAL_MS * 3)).toBe(1)
  })
})

describe('revealFrame', () => {
  it('starts as the old label and ends as the address', () => {
    expect(revealFrame(label, address, 0, alwaysFirst)).toBe(label)
    expect(revealFrame(label, address, 1, alwaysFirst)).toBe(address)
  })

  it('settles the address from the left while the rest is scrambled', () => {
    const frame = revealFrame(label, address, 0.5, alwaysFirst)
    const settled = Math.floor(0.5 * address.length)
    expect(frame.slice(0, settled)).toBe(address.slice(0, settled))
    expect(frame.slice(settled)).not.toBe(address.slice(settled, frame.length))
  })

  it('grows from the label length towards the address length', () => {
    const early = revealFrame(label, address, 0.1, alwaysFirst).length
    const late = revealFrame(label, address, 0.9, alwaysFirst).length
    expect(early).toBeGreaterThanOrEqual(label.length)
    expect(late).toBeGreaterThan(early)
    expect(late).toBeLessThanOrEqual(address.length)
  })

  it('shows the at sign and the dot in place before the cursor reaches them', () => {
    const full = revealFrame('x'.repeat(address.length), address, 0.1, alwaysFirst)
    expect(full[address.indexOf('@')]).toBe('@')
    expect(full[address.indexOf('.')]).toBe('.')
  })

  it('never inserts whitespace into the scramble', () => {
    for (let step = 1; step < 20; step += 1) {
      expect(revealFrame(label, address, step / 20, Math.random)).not.toMatch(/\s/)
    }
  })

  it('keeps digits scrambling as digits', () => {
    const frame = revealFrame('x', 'a1234', 0.2, Math.random)
    expect(frame.slice(1)).toMatch(/^\d*$/)
  })
})
