const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
export const motionDebug = params.get('debug') === 'motion'
export const preserveBuffer = motionDebug && params.get('preserve') === '1'

export interface ProbeSink {
  event(type: string, detail: Record<string, unknown>): void
  listener(name: string, ms: number): void
}

let sink: ProbeSink | null = null
let active: string | null = null

export function attachProbeSink(next: ProbeSink): void {
  sink = next
}

export function activeListener(): string | null {
  return active
}

export function probeEvent(type: string, detail: Record<string, unknown> = {}): void {
  sink?.event(type, detail)
}

export function timed<Args extends unknown[]>(name: string, callback: (...args: Args) => void): (...args: Args) => void {
  if (!motionDebug) return callback
  return (...args) => {
    const start = performance.now()
    const outer = active
    active = name
    try {
      callback(...args)
    } finally {
      active = outer
      sink?.listener(name, performance.now() - start)
    }
  }
}
