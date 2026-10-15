import { gsap } from 'gsap'
import type { MotionContext, SectionMotion } from '../context'
import { query, splitChars } from '../reveal'

export const INTRO_READY_CLASS = 'intro-ready'
const INTRO_DONE_CLASS = 'intro-done'
const NAME_BLEED = { top: 0.12, right: 0.08, bottom: 0.04, left: 0.06 }

function playIntro(context: MotionContext): void {
  const hero = document.getElementById('hero')
  if (!hero) return
  const root = document.documentElement
  const name = hero.querySelector<HTMLElement>('h1')
  const sun = { scale: 0 }
  context.path.setIntro(0)
  const load = gsap.timeline({ onStart: () => root.classList.add(INTRO_READY_CLASS) })
  load.fromTo(query(hero, '.grid-lines span'), { scaleY: 0 }, { scaleY: 1, transformOrigin: 'top center', duration: 0.9, ease: 'power3.out' }, 0)
  load.fromTo(query(hero, '.nav-bar > *'), { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power1.out' }, 0.1)
  load.fromTo(query(hero, '.hero-copy .pill'), { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' }, 0.3)
  const split = name ? splitChars(name, NAME_BLEED) : null
  if (split) {
    gsap.set(split.words, { whiteSpace: 'nowrap' })
    load.fromTo(split.chars, { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: 'power4.out', stagger: 0.03 }, 0.35)
  }
  load.fromTo(query(hero, '.hero-line'), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' }, 0.9)
  load.fromTo(query(hero, '.button-row'), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' }, 1.0)
  load.fromTo(query(hero, '.bar-bottom > *'), { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power1.out' }, 1.0)
  load.fromTo(
    sun,
    { scale: 0 },
    { scale: 1, duration: 0.7, ease: 'back.out(1.7)', onUpdate: () => context.path.setIntro(sun.scale) },
    0.25,
  )
  load.eventCallback('onComplete', () => {
    split?.revert()
    context.path.setIntro(1)
    root.classList.add(INTRO_DONE_CLASS)
  })
}

export const sectionMotion: SectionMotion = {
  order: 10,
  desktop: playIntro,
  mobile(context) {
    context.path.setIntro(1)
    document.documentElement.classList.add(INTRO_READY_CLASS, INTRO_DONE_CLASS)
  },
}
