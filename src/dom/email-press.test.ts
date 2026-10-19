import { describe, expect, it } from 'vitest'
import {
  assembleAddress,
  CLICK_MAX_MS,
  createPress,
  HOLD_MS,
  holdProgress,
  PROGRESS_DELAY_MS,
} from './email-press'

describe('assembleAddress', () => {
  it('joins the split parts with an at sign', () => {
    expect(assembleAddress('hello', 'example.com')).toBe('hello@example.com')
  })

  it('refuses missing or blank parts', () => {
    expect(assembleAddress(undefined, 'example.com')).toBeNull()
    expect(assembleAddress('hello', undefined)).toBeNull()
    expect(assembleAddress('', 'example.com')).toBeNull()
    expect(assembleAddress('hello', '')).toBeNull()
  })

  it('refuses parts that could smuggle a second address or a url', () => {
    expect(assembleAddress('hello@evil.com', 'example.com')).toBeNull()
    expect(assembleAddress('hello', 'example.com?cc=a@b.c')).toBeNull()
    expect(assembleAddress('a b', 'example.com')).toBeNull()
    expect(assembleAddress('hello', 'ex/ample.com')).toBeNull()
  })
})

describe('holdProgress', () => {
  it('stays empty until the progress delay has passed', () => {
    expect(holdProgress(0)).toBe(0)
    expect(holdProgress(PROGRESS_DELAY_MS)).toBe(0)
  })

  it('fills linearly until the hold threshold and never exceeds one', () => {
    const middle = (PROGRESS_DELAY_MS + HOLD_MS) / 2
    expect(holdProgress(middle)).toBeCloseTo(0.5)
    expect(holdProgress(HOLD_MS)).toBe(1)
    expect(holdProgress(HOLD_MS * 4)).toBe(1)
  })
})

describe('createPress', () => {
  it('counts a quick release as a click', () => {
    const press = createPress()
    expect(press.begin(1000, 'pointer')).toBe(true)
    expect(press.end(1000 + CLICK_MAX_MS - 1, 'pointer')).toBe('click')
    expect(press.active).toBe(false)
  })

  it('only retracts when released between the click and hold thresholds', () => {
    const press = createPress()
    press.begin(0, 'pointer')
    expect(press.end(CLICK_MAX_MS, 'pointer')).toBe('retract')
    press.begin(0, 'pointer')
    expect(press.end(HOLD_MS - 1, 'pointer')).toBe('retract')
  })

  it('completes the hold once while still pressed and then ignores the release', () => {
    const press = createPress()
    press.begin(0, 'key')
    expect(press.tick(HOLD_MS - 1).completed).toBe(false)
    expect(press.tick(HOLD_MS).completed).toBe(true)
    expect(press.tick(HOLD_MS + 100).completed).toBe(false)
    expect(press.end(HOLD_MS + 300, 'key')).toBe('none')
  })

  it('still reports a hold when the release arrives before any tick saw the threshold', () => {
    const press = createPress()
    press.begin(0, 'pointer')
    expect(press.end(HOLD_MS + 50, 'pointer')).toBe('hold')
  })

  it('ignores a repeated begin such as key repeat without restarting the clock', () => {
    const press = createPress()
    expect(press.begin(0, 'key')).toBe(true)
    expect(press.begin(300, 'key')).toBe(false)
    expect(press.begin(600, 'key')).toBe(false)
    expect(press.end(HOLD_MS, 'key')).toBe('hold')
  })

  it('ignores a second input source while one press is active', () => {
    const press = createPress()
    press.begin(0, 'pointer')
    expect(press.begin(10, 'key')).toBe(false)
    expect(press.end(20, 'key')).toBe('none')
    expect(press.end(30, 'pointer')).toBe('click')
  })

  it('does nothing on release without a press', () => {
    const press = createPress()
    expect(press.end(100, 'pointer')).toBe('none')
    expect(press.tick(100)).toEqual({ progress: 0, completed: false })
  })

  it('drops the press on cancel', () => {
    const press = createPress()
    press.begin(0, 'pointer')
    press.cancel()
    expect(press.active).toBe(false)
    expect(press.end(100, 'pointer')).toBe('none')
    expect(press.begin(200, 'pointer')).toBe(true)
  })
})
