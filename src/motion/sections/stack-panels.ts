import { gsap } from 'gsap'
import { TUNE } from '../../tune'
import type { SectionMotion } from '../context'
import { annotationReveal, query, riseIn, wordsReveal } from '../reveal'

const TOOL_STAGGER = 0.06
const toggleActions = 'play none none reverse'

interface PanelParts {
  caption: HTMLElement[]
  heading: HTMLElement | null
  tools: HTMLElement[]
  intro: HTMLElement[]
  annotationLines: HTMLElement[]
  proof: HTMLElement[]
}

function panelParts(panel: HTMLElement): PanelParts {
  return {
    caption: query(panel, '.panel-copy .fig-caption'),
    heading: panel.querySelector<HTMLElement>('.panel-copy h2'),
    tools: query(panel, '.tool-list li'),
    intro: query(panel, '.panel-copy .stop-intro'),
    annotationLines: query(panel, '.annotation .ann-line'),
    proof: query(panel, '.proof-row'),
  }
}

function addCopy(timeline: gsap.core.Timeline, parts: PanelParts): void {
  const caption = riseIn(parts.caption, { y: 12, duration: 0.6 })
  if (caption) timeline.add(caption, 0)
  const heading = parts.heading ? wordsReveal(parts.heading) : null
  if (heading) timeline.add(heading, 0.05)
  const tools = riseIn(parts.tools, { stagger: TOOL_STAGGER, duration: TUNE.revealDuration })
  if (tools) timeline.add(tools, 0.2)
  const intro = riseIn(parts.intro, { duration: TUNE.revealDuration })
  if (intro) timeline.add(intro, 0.35)
}

function addStage(timeline: gsap.core.Timeline, parts: PanelParts, at: number): void {
  const lines = annotationReveal(parts.annotationLines)
  if (lines) timeline.add(lines, at + 0.1)
}

function addProof(timeline: gsap.core.Timeline, parts: PanelParts, at: number): void {
  const proof = riseIn(parts.proof)
  if (proof) timeline.add(proof, at)
}

function buildMobile(): void {
  query(document, '#stack .stack-track > .panel').forEach((panel) => {
    const parts = panelParts(panel)
    const copyTimeline = gsap.timeline({
      scrollTrigger: { trigger: panel.querySelector('.panel-copy') ?? panel, start: TUNE.revealStart, toggleActions },
    })
    addCopy(copyTimeline, parts)
    const stage = panel.querySelector('.stage')
    if (stage) {
      const stageTimeline = gsap.timeline({ scrollTrigger: { trigger: stage, start: TUNE.revealStart, toggleActions } })
      addStage(stageTimeline, parts, 0)
    }
    parts.proof.forEach((row) => {
      const proofTimeline = gsap.timeline({ scrollTrigger: { trigger: row, start: 'top 90%', toggleActions } })
      addProof(proofTimeline, { ...parts, proof: [row] }, 0)
    })
  })
}

export const sectionMotion: SectionMotion = {
  order: 30,
  mobile: buildMobile,
}
