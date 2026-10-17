import { describe, expect, it } from 'vitest'
import {
  createFlags,
  hotspotGroup,
  hotspotKind,
  indexFloorTargetChapter,
  isAvailable,
  resolveState,
  resolveTouchTap,
} from './interaction-state'

describe('resolveState', () => {
  it('is unavailable whenever the chapter gate is closed, whatever else is set', () => {
    const flags = { ...createFlags(false), pointerOver: true, buttonFocus: true, active: true }
    expect(resolveState(flags)).toBe('unavailable')
  })

  it('starts idle once available', () => {
    expect(resolveState(createFlags(true))).toBe('idle')
  })

  it('treats pointer hover and button hover as the same hover response', () => {
    expect(resolveState({ ...createFlags(true), pointerOver: true })).toBe('hover')
    expect(resolveState({ ...createFlags(true), buttonHover: true })).toBe('hover')
  })

  it('treats keyboard focus and touch focus as the same focused response', () => {
    expect(resolveState({ ...createFlags(true), buttonFocus: true })).toBe('focused')
    expect(resolveState({ ...createFlags(true), touchFocus: true })).toBe('focused')
  })

  it('ranks active above hover above focused', () => {
    const base = { ...createFlags(true), buttonFocus: true }
    expect(resolveState(base)).toBe('focused')
    expect(resolveState({ ...base, pointerOver: true })).toBe('hover')
    expect(resolveState({ ...base, pointerOver: true, active: true })).toBe('active')
  })
})

describe('isAvailable', () => {
  it('opens only in the chapters the proxy lists', () => {
    expect(isAvailable(['stop-frontend'], 'stop-frontend')).toBe(true)
    expect(isAvailable(['stop-frontend'], 'stop-backend')).toBe(false)
    expect(isAvailable([], 'hero')).toBe(false)
  })
})

describe('hotspot classification', () => {
  it('toggles for the frontend screens and homelab services only', () => {
    expect(hotspotKind('frontend-hih')).toBe('toggle')
    expect(hotspotKind('lounge-service-4')).toBe('toggle')
    expect(hotspotKind('index-floor-2')).toBe('pulse')
    expect(hotspotKind('say-hi-beacon')).toBe('pulse')
    expect(hotspotKind('rocket-launch')).toBe('pulse')
  })

  it('groups mutually exclusive toggles', () => {
    expect(hotspotGroup('frontend-baysal')).toBe(hotspotGroup('frontend-hih'))
    expect(hotspotGroup('lounge-service-0')).toBe(hotspotGroup('lounge-service-9'))
    expect(hotspotGroup('frontend-hih')).not.toBe(hotspotGroup('lounge-service-0'))
    expect(hotspotGroup('say-hi-beacon')).toBe('say-hi-beacon')
  })

  it('maps index floors to the stop chapter two further along', () => {
    expect(indexFloorTargetChapter('index-floor-0')).toBe(2)
    expect(indexFloorTargetChapter('index-floor-3')).toBe(5)
    expect(indexFloorTargetChapter('index-floor-6')).toBe(8)
    expect(indexFloorTargetChapter('frontend-hih')).toBeNull()
  })
})

describe('resolveTouchTap', () => {
  it('focuses on the first tap and activates on the second', () => {
    expect(resolveTouchTap('idle')).toBe('focus')
    expect(resolveTouchTap('focused')).toBe('activate')
    expect(resolveTouchTap('active')).toBe('activate')
  })

  it('ignores taps on unavailable proxies', () => {
    expect(resolveTouchTap('unavailable')).toBe('ignore')
  })
})
