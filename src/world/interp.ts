import type { CameraPose, ChapterSpec, ConductorState, WorldChannel, WorldChannels } from './types'

export const worldChannelNames = [
  'key',
  'ambient',
  'practicals',
  'fog',
  'rain',
  'red',
  'dawn',
  'pulse',
  'bloom',
  'floorsLit',
  'launch',
] as const satisfies readonly WorldChannel[]

const DESKTOP_TALL_THRESHOLD = 1.15
const MOBILE_TALL_THRESHOLD = 2.2
const TALL_PULLBACK_METRES = 6
const TALL_FOV_OPEN_DEGREES = 6

export interface ProgressSplit {
  index: number
  next: number
  local: number
}

export interface SegmentState {
  index: number
  a: ChapterSpec
  b: ChapterSpec
  local: number
  t: number
}

export interface TallScreenCorrection {
  pullback: number
  fovOpen: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}

export function splitProgress(progress: number, count: number): ProgressSplit {
  const last = Math.max(0, count - 1)
  const bounded = clamp(Number.isFinite(progress) ? progress : 0, 0, last)
  const index = Math.min(Math.floor(bounded), last)
  const next = Math.min(last, index + 1)
  return { index, next, local: next === index ? 0 : bounded - index }
}

export function travelEase(local: number): number {
  return smoothstep(0, 1, local)
}

export function segmentState(progress: number, chapters: readonly ChapterSpec[]): SegmentState {
  const { index, next, local } = splitProgress(progress, chapters.length)
  return { index, a: chapters[index], b: chapters[next], local, t: travelEase(local) }
}

export function createChannels(): WorldChannels {
  return {
    key: 0,
    ambient: 0,
    practicals: 0,
    fog: 0,
    rain: 0,
    red: 0,
    dawn: 0,
    pulse: 0,
    bloom: 0,
    floorsLit: 0,
    launch: 0,
  }
}

export function interpolateChannels(
  a: WorldChannels,
  b: WorldChannels,
  t: number,
  out: WorldChannels = createChannels(),
): WorldChannels {
  const weight = clamp(t, 0, 1)
  for (const name of worldChannelNames) out[name] = lerp(a[name], b[name], weight)
  return out
}

export function resolvePose(chapter: ChapterSpec, mobile: boolean): CameraPose {
  if (mobile) return chapter.camera.mobile
  const { position, target, fov, approach } = chapter.camera
  return approach ? { position, target, fov, approach } : { position, target, fov }
}

export function tallScreenCorrection(width: number, height: number, mobile: boolean): TallScreenCorrection {
  const threshold = mobile ? MOBILE_TALL_THRESHOLD : DESKTOP_TALL_THRESHOLD
  const tall = clamp(height / Math.max(1, width) - threshold, 0, 1)
  return { pullback: tall * TALL_PULLBACK_METRES, fovOpen: tall * TALL_FOV_OPEN_DEGREES }
}

export function presentedState(
  state: Readonly<ConductorState>,
  reducedMotion: boolean,
  count: number,
  out: ConductorState,
): ConductorState {
  const smooth = reducedMotion ? Math.round(state.exact) : state.smooth
  out.exact = state.exact
  out.index = state.index
  out.next = state.next
  out.localExact = state.localExact
  out.direction = state.direction
  out.smooth = smooth
  out.localSmooth = splitProgress(smooth, count).local
  return out
}
