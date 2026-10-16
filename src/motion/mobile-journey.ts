import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motionDebug, probeEvent, timed } from '../debug/probe'
import { TUNE } from '../tune'
import type { ProgressSource } from './context'
import { Chase, journeyScene, journeyTarget } from './journey'
import type { PathPort } from './path-port'
import { MOBILE_TIMING, SCENES } from './score'

const HERO_PIN_VIEWPORTS = 1.2
const HERO_COPY_LIFT = 40

interface HeroHold {
  runway: HTMLElement
  hold: HTMLElement
  release(): void
}

function holdHero(hero: HTMLElement): HeroHold {
  const runway = document.createElement('div')
  const hold = document.createElement('div')
  hold.setAttribute('aria-hidden', 'true')
  hold.style.height = `${HERO_PIN_VIEWPORTS * 100}vh`
  hold.style.height = `${HERO_PIN_VIEWPORTS * 100}svh`
  hero.before(runway)
  runway.append(hero, hold)
  hero.style.position = 'sticky'
  hero.style.top = '0'
  return {
    runway,
    hold,
    release() {
      hero.style.position = ''
      hero.style.top = ''
      runway.before(hero)
      runway.remove()
    },
  }
}

export function bindMobileJourney(path: PathPort): () => void {
  const hero = document.getElementById('hero')
  const triggers: ScrollTrigger[] = []
  let heroTrigger: ScrollTrigger | undefined
  const held = hero ? holdHero(hero) : null
  if (hero && held) {
    const timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: held.runway,
        start: 'top top',
        end: () => `+=${held.hold.offsetHeight}`,
        scrub: TUNE.heroScrub,
      },
    })
    timeline.to(Array.from(hero.querySelectorAll('.hero-copy, .hero-actions')), { y: -HERO_COPY_LIFT, opacity: 0.85, duration: 0.4, ease: 'power1.inOut' }, 0.6)
    heroTrigger = timeline.scrollTrigger
    if (heroTrigger) triggers.push(heroTrigger)
  }

  const entries: Array<ProgressSource | null> = SCENES.map((scene, index) => {
    if (index === 0) return null
    const stage = document.querySelector<HTMLElement>(`[data-path-stage="${scene.figure}"]`)
    if (!stage) return null
    const trigger = ScrollTrigger.create({ trigger: stage, start: 'top bottom', end: 'clamp(center center)' })
    triggers.push(trigger)
    return () => trigger.progress
  })

  const progresses = entries.map(() => 0)
  const target = (): number => {
    entries.forEach((entry, index) => (progresses[index] = entry?.() ?? 0))
    return journeyTarget(progresses, heroTrigger?.progress ?? 0)
  }
  // Native touch scrolling can cross a whole morph in two or three frames. The tube follows
  // the scroll the way the desktop tube does (Lenis, then the track scrub), so every morph
  // plays out, while the page itself keeps native scrolling.
  const chase = new Chase(TUNE.lenisLerp, TUNE.trackScrub, gsap.parseEase('expo'))
  const score = (position: number): void => {
    const scene = journeyScene(position)
    path.score(scene.index, scene.seconds, MOBILE_TIMING)
    if (motionDebug) probeEvent('score', { scene: scene.index, seconds: scene.seconds, position })
  }
  const follow = timed('journey', (time: number): void => {
    score(chase.follow(target(), time))
  })
  const settle = (): void => {
    const position = target()
    chase.jump(position)
    score(position)
  }
  gsap.ticker.add(follow)
  ScrollTrigger.addEventListener('refresh', settle)
  settle()

  return () => {
    gsap.ticker.remove(follow)
    ScrollTrigger.removeEventListener('refresh', settle)
    triggers.forEach((trigger) => trigger.kill())
    held?.release()
  }
}
