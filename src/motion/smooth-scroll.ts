import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { timed } from '../debug/probe'
import { TUNE } from '../tune'

export interface SmoothScroll {
  lenis: Lenis
  destroy(): void
}

export function createSmoothScroll(): SmoothScroll {
  const lenis = new Lenis({ lerp: TUNE.lenisLerp, autoRaf: false, anchors: false })
  const onScroll = (): void => ScrollTrigger.update()
  lenis.on('scroll', onScroll)
  const advance = timed('lenis', (time: number): void => lenis.raf(time * 1000))
  gsap.ticker.add(advance, false, true)
  return {
    lenis,
    destroy() {
      gsap.ticker.remove(advance)
      lenis.destroy()
    },
  }
}

const jumpEase = gsap.parseEase('power2.inOut')
const snapEase = gsap.parseEase('sine.inOut')

export function jumpDuration(distance: number): number {
  return scrollDuration(distance, 0.7, 1.4)
}

export function scrollDuration(distance: number, minimum: number, maximum: number): number {
  const viewports = Math.abs(distance) / Math.max(1, window.innerHeight)
  return Math.min(maximum, Math.max(minimum, minimum + viewports * 0.12))
}

export function smoothScrollTo(lenis: Lenis | null, target: number, duration: number, onComplete?: () => void): void {
  scrollEased(lenis, target, duration, jumpEase, onComplete)
}

export function snapScrollTo(lenis: Lenis | null, target: number, duration: number): void {
  scrollEased(lenis, target, duration, snapEase)
}

function scrollEased(lenis: Lenis | null, target: number, duration: number, easing: (progress: number) => number, onComplete?: () => void): void {
  if (!lenis) {
    window.scrollTo({ top: target, behavior: 'auto' })
    onComplete?.()
    return
  }
  lenis.scrollTo(target, {
    duration,
    easing,
    force: true,
    onComplete: () => onComplete?.(),
  })
}
