import type { InteractionState } from './types'

export interface InteractionFlags {
  available: boolean
  pointerOver: boolean
  buttonHover: boolean
  buttonFocus: boolean
  touchFocus: boolean
  active: boolean
}

export type HotspotKind = 'toggle' | 'pulse'

export type TouchTapResult = 'focus' | 'activate' | 'ignore'

const INDEX_FLOOR_PATTERN = /^index-floor-(\d+)$/
const INDEX_FIRST_STOP_CHAPTER = 2

export function createFlags(available = false): InteractionFlags {
  return { available, pointerOver: false, buttonHover: false, buttonFocus: false, touchFocus: false, active: false }
}

export function resolveState(flags: InteractionFlags): InteractionState {
  if (!flags.available) return 'unavailable'
  if (flags.active) return 'active'
  if (flags.pointerOver || flags.buttonHover) return 'hover'
  if (flags.buttonFocus || flags.touchFocus) return 'focused'
  return 'idle'
}

export function isAvailable(proxyChapters: readonly string[], currentChapter: string): boolean {
  return proxyChapters.includes(currentChapter)
}

export function hotspotKind(id: string): HotspotKind {
  return id.startsWith('frontend-') || id.startsWith('lounge-service-') ? 'toggle' : 'pulse'
}

export function hotspotGroup(id: string): string {
  if (id.startsWith('frontend-')) return 'frontend'
  if (id.startsWith('lounge-service-')) return 'lounge-service'
  return id
}

export function indexFloorTargetChapter(id: string): number | null {
  const match = INDEX_FLOOR_PATTERN.exec(id)
  return match ? Number(match[1]) + INDEX_FIRST_STOP_CHAPTER : null
}

export function resolveTouchTap(state: InteractionState): TouchTapResult {
  if (state === 'unavailable') return 'ignore'
  return state === 'idle' ? 'focus' : 'activate'
}
