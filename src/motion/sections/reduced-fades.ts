import { gsap } from 'gsap'
import type { SectionMotion } from '../context'
import { query } from '../reveal'

const FADE_SELECTOR = [
  'main .panel-copy > *',
  'main [data-reveal]',
  'main .index-stops',
  'main .proof-row',
  'main .stage > :not(.path-fallback)',
].join(', ')
const FADE_DURATION = 0.6

function buildReducedFades(): void {
  const targets = Array.from(new Set(query(document, FADE_SELECTOR)))
  targets.forEach((target) => {
    gsap.from(target, {
      opacity: 0,
      duration: FADE_DURATION,
      ease: 'power1.out',
      scrollTrigger: { trigger: target, start: 'top 92%', toggleActions: 'play none none none' },
    })
  })
}

export const sectionMotion: SectionMotion = {
  order: 1,
  reduced: buildReducedFades,
}
