import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { TUNE } from '../tune'
import type { ProgressSource } from './context'
import type { PathPort } from './path-port'
import { MOBILE_TIMING, SCENES } from './score'

const HERO_PIN_VIEWPORTS = 1.2
const ENTRY_SHARE = 0.8
const HERO_COPY_LIFT = 40
const SETTLED = 1e-4

export function bindMobileJourney(path: PathPort): () => void {
  const hero = document.getElementById('hero')
  const triggers: ScrollTrigger[] = []
  const heroDrop = { value: 0 }
  if (hero) {
    const timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: () => `+=${window.innerHeight * HERO_PIN_VIEWPORTS}`,
        pin: true,
        scrub: TUNE.heroScrub,
        invalidateOnRefresh: true,
      },
    })
    timeline.to(heroDrop, { value: 1, duration: 1 }, 0)
    timeline.to(Array.from(hero.querySelectorAll('.hero-copy, .hero-actions')), { y: -HERO_COPY_LIFT, opacity: 0.85, duration: 0.4, ease: 'power1.inOut' }, 0.6)
    if (timeline.scrollTrigger) triggers.push(timeline.scrollTrigger)
  }

  const entries: Array<ProgressSource | null> = SCENES.map((scene, index) => {
    if (index === 0) return null
    const stage = document.querySelector<HTMLElement>(`[data-path-stage="${scene.figure}"]`)
    if (!stage) return null
    const trigger = ScrollTrigger.create({ trigger: stage, start: 'top bottom', end: 'clamp(center center)' })
    triggers.push(trigger)
    return () => trigger.progress
  })

  const follow = (): void => {
    for (let index = entries.length - 1; index > 0; index--) {
      const progress = entries[index]?.() ?? 0
      if (progress <= SETTLED) continue
      path.score(index, Math.min(1, progress) * ENTRY_SHARE * SCENES[index].seconds, MOBILE_TIMING)
      return
    }
    path.score(0, heroDrop.value * SCENES[0].seconds, MOBILE_TIMING)
  }
  gsap.ticker.add(follow)
  follow()

  return () => {
    gsap.ticker.remove(follow)
    triggers.forEach((trigger) => trigger.kill())
  }
}
