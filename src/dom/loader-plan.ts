export type ReleasePlan = 'instant' | 'fade' | 'handoff'

export interface ReleaseInput {
  elapsedMs: number
  reducedMotion: boolean
  webgl: boolean
  skipThresholdMs: number
}

export function releasePlan(input: ReleaseInput): ReleasePlan {
  if (!input.webgl || input.reducedMotion) return 'instant'
  if (input.elapsedMs < input.skipThresholdMs) return 'fade'
  return 'handoff'
}
