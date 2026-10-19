import { describe, expect, it } from 'vitest'
import { releasePlan } from './loader-plan'

const base = { elapsedMs: 1800, reducedMotion: false, webgl: true, skipThresholdMs: 250 }

describe('releasePlan', () => {
  it('hands off after a slow boot', () => {
    expect(releasePlan(base)).toBe('handoff')
  })

  it('only fades when the world was ready before the threshold', () => {
    expect(releasePlan({ ...base, elapsedMs: 120 })).toBe('fade')
    expect(releasePlan({ ...base, elapsedMs: 250 })).toBe('handoff')
  })

  it('releases instantly under reduced motion or without WebGL, whatever the timing', () => {
    expect(releasePlan({ ...base, reducedMotion: true })).toBe('instant')
    expect(releasePlan({ ...base, webgl: false, elapsedMs: 40 })).toBe('instant')
  })
})
