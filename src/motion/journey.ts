import { clamp01 } from '../math'
import { SCENES } from './score'

export const ENTRY_SHARE = 0.8
const SETTLED = 1e-4
// About half a pixel of scroll, where Lenis stops easing too.
const AT_REST = 1e-3

export interface JourneyScene {
  index: number
  seconds: number
}

// One number for where the phone journey is: the scene index plus how far its stage has
// entered, or the hero hold's progress before any stage has. A whole number k is scene k - 1
// at its end, which looks the same as scene k at its start, so the position runs continuously
// through every scene boundary.
export function journeyTarget(entries: readonly number[], hero: number): number {
  for (let index = entries.length - 1; index > 0; index--) {
    const progress = entries[index]
    if (progress > SETTLED) return index + Math.min(1, progress)
  }
  return clamp01(hero)
}

export function journeyScene(position: number): JourneyScene {
  const last = SCENES.length - 1
  const index = Math.max(0, Math.min(last, Math.ceil(position) - 1))
  const share = clamp01(position - index)
  return { index, seconds: (index === 0 ? share : share * ENTRY_SHARE) * SCENES[index].seconds }
}

// What the desktop tube sees of the scroll, rebuilt for native touch scrolling: Lenis's damping
// (`lerp` per 60 Hz frame) and then the catch-up of a numeric ScrollTrigger scrub, where each
// new value restarts `ease` from wherever the tube is, finishing `duration` seconds later.
export class Chase {
  private damped = 0
  private from = 0
  private to = 0
  private start = 0
  private last: number | null = null

  constructor(
    private readonly lerp: number,
    private readonly duration: number,
    private readonly ease: (progress: number) => number,
  ) {}

  jump(value: number): void {
    this.damped = value
    this.from = value
    this.to = value
    this.last = null
  }

  follow(target: number, nowSeconds: number): number {
    const elapsed = this.last === null ? 0 : Math.max(0, nowSeconds - this.last)
    this.last = nowSeconds
    this.damped += (target - this.damped) * (1 - Math.exp(-this.lerp * 60 * elapsed))
    if (Math.abs(target - this.damped) < AT_REST) this.damped = target
    if (this.damped !== this.to) {
      this.from = this.value(nowSeconds)
      this.to = this.damped
      this.start = nowSeconds
    }
    return this.value(nowSeconds)
  }

  private value(nowSeconds: number): number {
    const t = clamp01((nowSeconds - this.start) / this.duration)
    if (t >= 1) return this.to
    return this.from + (this.to - this.from) * this.ease(t)
  }
}
