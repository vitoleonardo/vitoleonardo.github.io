import { gsap } from 'gsap'
import { TUNE } from '../../tune'
import type { SectionMotion } from '../context'
import { query, riseIn, wordsReveal } from '../reveal'

const MARKER_STAGGER = 0.08

function buildIndex(): void {
  const section = document.getElementById('index')
  if (!section) return
  const toggleActions = 'play none none reverse'

  const headingTimeline = gsap.timeline({
    scrollTrigger: { trigger: section, start: TUNE.revealStart, toggleActions },
  })
  const caption = riseIn(query(section, '.fig-caption'), { y: 12, duration: 0.6 })
  if (caption) headingTimeline.add(caption, 0)
  const heading = section.querySelector('h2')
  const headingWords = heading ? wordsReveal(heading) : null
  if (headingWords) headingTimeline.add(headingWords, 0.05)

  const list = section.querySelector<HTMLElement>('.index-stops')
  if (!list) return
  const stops = query(list, '.index-stop')
  const markers = query(list, '.marker')
  const stopTexts = stops.map((stop) => query(stop, '.stop-number, .stop-name, .stop-tools'))

  const stopsTimeline = gsap.timeline({
    scrollTrigger: { trigger: list, start: TUNE.revealStart, toggleActions },
  })
  stopsTimeline.from(markers, {
    scale: 0,
    duration: 0.5,
    ease: 'back.out(2.2)',
    stagger: MARKER_STAGGER,
  }, 0)
  stopTexts.forEach((texts, index) => {
    stopsTimeline.from(texts, {
      y: 14,
      opacity: 0,
      duration: 0.55,
      ease: TUNE.revealEase,
      stagger: 0.04,
    }, 0.1 + index * MARKER_STAGGER)
  })

  const footer = query(section, '.bar-bottom')
  if (footer.length) stopsTimeline.from(footer, { opacity: 0, duration: 0.5 }, 0.4)
}

export const sectionMotion: SectionMotion = {
  order: 20,
  mobile: buildIndex,
}
