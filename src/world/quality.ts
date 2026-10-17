import type { QualityName, QualityTier } from './types'

const WARMUP_MS = 2000
const FRAME_BUDGET_MS = 22
const SUSTAINED_MISS_FRAMES = 120
const LOW_END_CORES = 2
const MID_RANGE_CORES = 4

export const qualityTiers: Readonly<Record<QualityName, Readonly<QualityTier>>> = {
  high: { name: 'high', dpr: 1.75, shadows: 2048, particles: 1, bloom: true, antialias: true },
  medium: { name: 'medium', dpr: 1.35, shadows: 1024, particles: 0.55, bloom: true, antialias: true },
  low: { name: 'low', dpr: 1, shadows: 0, particles: 0.2, bloom: false, antialias: false },
}

const downgradeOrder: Readonly<Record<QualityName, QualityName | null>> = {
  high: 'medium',
  medium: 'low',
  low: null,
}

export interface DeviceProfile {
  mobile: boolean
  touch: boolean
  cores: number
}

export interface QualityGovernor {
  readonly tier: QualityName
  sample(frameMs: number, now: number): QualityName | null
  pause(now: number): void
}

export function pickInitialTier({ mobile, touch, cores }: DeviceProfile): QualityName {
  if (cores > 0 && cores <= LOW_END_CORES) return 'low'
  if (mobile || touch || (cores > 0 && cores <= MID_RANGE_CORES)) return 'medium'
  return 'high'
}

export function createQualityGovernor(initial: QualityName, startedAt: number): QualityGovernor {
  let tier = initial
  let measuringFrom = startedAt + WARMUP_MS
  let misses = 0

  function sample(frameMs: number, now: number): QualityName | null {
    if (now < measuringFrom) return null
    misses = frameMs > FRAME_BUDGET_MS ? misses + 1 : 0
    if (misses < SUSTAINED_MISS_FRAMES) return null
    const lower = downgradeOrder[tier]
    misses = 0
    if (!lower) return null
    tier = lower
    measuringFrom = now + WARMUP_MS
    return tier
  }

  function pause(now: number): void {
    misses = 0
    measuringFrom = Math.max(measuringFrom, now + WARMUP_MS)
  }

  return {
    get tier() {
      return tier
    },
    sample,
    pause,
  }
}
