import { TUNE } from '../tune'

const SOFT_BEAT_BPM = 62

export const beatClock = {
  get beatSeconds(): number {
    return 60 / TUNE.bpm
  },
  phase(nowMs: number = performance.now()): number {
    const beats = nowMs / 1000 / (60 / TUNE.bpm)
    return beats - Math.floor(beats)
  },
  msUntilNextBeat(nowMs: number = performance.now()): number {
    return (1 - this.phase(nowMs)) * (60000 / TUNE.bpm)
  },
  pulse(nowMs: number = performance.now()): number {
    return Math.pow(0.5 + 0.5 * Math.cos(this.phase(nowMs) * Math.PI * 2), 3)
  },
  softBeat(nowMs: number = performance.now()): number {
    return 0.5 + 0.5 * Math.sin((nowMs / 1000) * Math.PI * 2 * (SOFT_BEAT_BPM / 60))
  },
}
