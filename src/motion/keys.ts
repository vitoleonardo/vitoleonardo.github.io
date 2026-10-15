import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type Lenis from 'lenis'
import { scrollTargetFor } from './anchors'
import { SCENES } from './score'
import { jumpDuration, smoothScrollTo } from './smooth-scroll'
import type { Stage } from './stage'

const STEP_TOLERANCE_PX = 8
const HINT_TOLERANCE_PX = 40
const NEXT_KEYS = new Set(['ArrowDown', 'PageDown', 'j', 'J'])
const PREVIOUS_KEYS = new Set(['ArrowUp', 'PageUp', 'k', 'K'])
const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
const ACTIVATABLE = 'a[href], button, summary, [role="button"]'
const HINT_TEXT: Record<string, string> = {
  en: '↑ ↓ or J K to move · 1 to 0 to jump',
  de: '↑ ↓ oder J K zum Wechseln · 1 bis 0 zum Springen',
}

export function stepPositions(stage: Stage | null): number[] {
  const maxScroll = ScrollTrigger.maxScroll(window)
  const positions = stage
    ? stage.restScrolls()
    : SCENES.map((scene) => {
        const section = document.getElementById(scene.id)
        if (!section) return null
        if (scene.id === 'hero') return 0
        return scrollTargetFor(section, null)
      })
  return positions
    .filter((position): position is number => position !== null && Number.isFinite(position))
    .map((position) => Math.min(maxScroll, Math.max(0, Math.round(position))))
}

function direction(event: KeyboardEvent): number {
  if (event.key === ' ' || event.key === 'Spacebar') return event.shiftKey ? -1 : 1
  if (event.shiftKey) return 0
  if (NEXT_KEYS.has(event.key)) return 1
  if (PREVIOUS_KEYS.has(event.key)) return -1
  return 0
}

function digitIndex(event: KeyboardEvent): number | null {
  if (event.shiftKey || !/^[0-9]$/.test(event.key)) return null
  return event.key === '0' ? 9 : Number(event.key) - 1
}

function addHint(): HTMLElement {
  const language = document.documentElement.lang.startsWith('de') ? 'de' : 'en'
  const hint = document.createElement('p')
  hint.className = 'key-hint'
  hint.setAttribute('aria-hidden', 'true')
  hint.textContent = HINT_TEXT[language]
  document.body.append(hint)
  return hint
}

export function bindStepKeys(lenis: Lenis | null, stage: () => Stage | null): () => void {
  const hint = addHint()
  let hintUsed = false
  const updateHint = (): void => {
    const steps = stepPositions(stage())
    const pastIndex = steps.length > 1 && window.scrollY > steps[1] + HINT_TOLERANCE_PX
    hint.classList.toggle('is-hidden', hintUsed || pastIndex)
  }
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest(EDITABLE)) return
    const isSpace = event.key === ' ' || event.key === 'Spacebar'
    if (isSpace && target?.closest(ACTIVATABLE)) return

    const steps = stepPositions(stage())
    if (steps.length === 0) return
    const current = lenis && lenis.isScrolling ? lenis.targetScroll : window.scrollY
    let destination: number | undefined
    const jump = digitIndex(event)
    if (jump !== null) {
      destination = steps[Math.min(jump, steps.length - 1)]
    } else {
      const step = direction(event)
      if (step > 0) destination = steps.find((position) => position > current + STEP_TOLERANCE_PX)
      if (step < 0) destination = [...steps].reverse().find((position) => position < current - STEP_TOLERANCE_PX)
    }
    if (destination === undefined) return
    event.preventDefault()
    hintUsed = true
    updateHint()
    smoothScrollTo(lenis, destination, jumpDuration(destination - current))
  }
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', updateHint, { passive: true })
  updateHint()
  return () => {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('scroll', updateHint)
    hint.remove()
  }
}
