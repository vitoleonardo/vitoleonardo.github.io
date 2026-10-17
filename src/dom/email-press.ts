export const CLICK_MAX_MS = 450
export const HOLD_MS = 650
export const PROGRESS_DELAY_MS = 150

export type PressSource = 'pointer' | 'key'

export type PressRelease = 'click' | 'retract' | 'hold' | 'none'

export interface PressTick {
  progress: number
  completed: boolean
}

export interface Press {
  readonly active: boolean
  begin(now: number, source: PressSource): boolean
  tick(now: number): PressTick
  end(now: number, source: PressSource): PressRelease
  cancel(): void
}

const ADDRESS_PART = /^[^\s@:/?#]+$/

export function assembleAddress(user: string | undefined, domain: string | undefined): string | null {
  if (!user || !domain) return null
  if (!ADDRESS_PART.test(user) || !ADDRESS_PART.test(domain)) return null
  return `${user}@${domain}`
}

export function holdProgress(elapsed: number): number {
  const span = HOLD_MS - PROGRESS_DELAY_MS
  return Math.min(1, Math.max(0, (elapsed - PROGRESS_DELAY_MS) / span))
}

export function createPress(): Press {
  let source: PressSource | null = null
  let startedAt = 0
  let completed = false

  return {
    get active() {
      return source !== null
    },
    begin(now, nextSource) {
      if (source !== null) return false
      source = nextSource
      startedAt = now
      completed = false
      return true
    },
    tick(now) {
      if (source === null) return { progress: 0, completed: false }
      const elapsed = now - startedAt
      const reached = elapsed >= HOLD_MS && !completed
      if (reached) completed = true
      return { progress: holdProgress(elapsed), completed: reached }
    },
    end(now, endingSource) {
      if (source === null || source !== endingSource) return 'none'
      const elapsed = now - startedAt
      const alreadyCompleted = completed
      source = null
      completed = false
      if (alreadyCompleted) return 'none'
      if (elapsed >= HOLD_MS) return 'hold'
      return elapsed < CLICK_MAX_MS ? 'click' : 'retract'
    },
    cancel() {
      source = null
      completed = false
    },
  }
}
