import { env } from '../env'
import { hasFinePointer } from './pointer-capability'
import {
  canStartFlip,
  flipDuration,
  flipPhase,
  glyphPoolFor,
  lettersNear,
  pickGlyph,
  startDelay,
  type Flip,
  type Point,
} from './scramble-flip'
import { readableText } from './words'

const TARGET_SELECTOR = 'h1, h2, .proof-points .proof-value, [data-scramble]'
const LETTER_CLASS = 'scramble-letter'
const LETTER_SELECTOR = `.${LETTER_CLASS}`
const GLYPH_ATTRIBUTE = 'data-glyph'
const RADIUS_IN_FONT_SIZES = 1.5
const HEADING_PATTERN = /^H[1-6]$/

interface LetterState {
  flip: Flip | null
  lastStartedAt: number | undefined
}

function collectTextNodes(element: HTMLElement): Text[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text)
  return nodes
}

function announce(target: HTMLElement, label: string): void {
  if (HEADING_PATTERN.test(target.tagName)) {
    if (!target.hasAttribute('aria-label')) target.setAttribute('aria-label', label)
    return
  }
  const twin = document.createElement('span')
  twin.className = 'sr-only scramble-twin'
  twin.textContent = label
  target.append(twin)
}

function splitIntoLetters(target: HTMLElement): HTMLElement[] {
  const existing = target.querySelectorAll<HTMLElement>(LETTER_SELECTOR)
  if (existing.length > 0) return Array.from(existing)
  const label = readableText(target.textContent)
  for (const node of collectTextNodes(target)) {
    const fragment = document.createDocumentFragment()
    for (const character of node.data) {
      if (/\s/.test(character)) {
        fragment.append(character)
        continue
      }
      const letter = document.createElement('span')
      letter.className = LETTER_CLASS
      letter.setAttribute('aria-hidden', 'true')
      letter.textContent = character
      fragment.append(letter)
    }
    node.replaceWith(fragment)
  }
  announce(target, label)
  return Array.from(target.querySelectorAll<HTMLElement>(LETTER_SELECTOR))
}

export function initScramble(): () => void {
  const lifetime = new AbortController()
  const states = new WeakMap<HTMLElement, LetterState>()
  const flipping = new Set<HTMLElement>()

  let frame = 0
  let hovered: HTMLElement | null = null
  let pointer: Point = { x: 0, y: 0 }
  let pointerDirty = false

  function stateOf(letter: HTMLElement): LetterState {
    let state = states.get(letter)
    if (!state) {
      state = { flip: null, lastStartedAt: undefined }
      states.set(letter, state)
    }
    return state
  }

  function restore(letter: HTMLElement): void {
    letter.removeAttribute(GLYPH_ATTRIBUTE)
    const state = stateOf(letter)
    state.flip = null
    flipping.delete(letter)
  }

  function igniteAroundPointer(target: HTMLElement, now: number): void {
    const letters = splitIntoLetters(target)
    const centers = letters.map((letter) => {
      const box = letter.getBoundingClientRect()
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    })
    const radius = parseFloat(getComputedStyle(target).fontSize) * RADIUS_IN_FONT_SIZES
    for (const { index, distance } of lettersNear(centers, pointer, radius)) {
      const letter = letters[index]
      const state = stateOf(letter)
      if (!canStartFlip(state.lastStartedAt, now)) continue
      const startsAt = now + startDelay(distance, radius)
      state.lastStartedAt = startsAt
      state.flip = { startsAt, endsAt: startsAt + flipDuration(Math.random()), swappedAt: Number.NEGATIVE_INFINITY }
      flipping.add(letter)
    }
  }

  function advance(now: number): void {
    for (const letter of flipping) {
      const flip = stateOf(letter).flip
      if (!flip) {
        flipping.delete(letter)
        continue
      }
      const phase = flipPhase(flip, now)
      if (phase === 'done') restore(letter)
      else if (phase === 'swap') {
        const original = letter.textContent ?? ''
        letter.setAttribute(GLYPH_ATTRIBUTE, pickGlyph(glyphPoolFor(original), original, Math.random()))
        flip.swappedAt = now
      }
    }
  }

  function tick(now: number): void {
    frame = 0
    if (env.reducedMotion) {
      for (const letter of Array.from(flipping)) restore(letter)
      pointerDirty = false
      return
    }
    if (pointerDirty && hovered) igniteAroundPointer(hovered, now)
    pointerDirty = false
    advance(now)
    if (flipping.size > 0) request()
  }

  function request(): void {
    if (frame === 0) frame = requestAnimationFrame(tick)
  }

  document.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch' || env.reducedMotion || !hasFinePointer()) return
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(TARGET_SELECTOR) : null
      hovered = target
      if (!target) return
      pointer = { x: event.clientX, y: event.clientY }
      pointerDirty = true
      request()
    },
    { passive: true, signal: lifetime.signal },
  )

  return () => {
    lifetime.abort()
    if (frame !== 0) cancelAnimationFrame(frame)
    for (const letter of Array.from(flipping)) restore(letter)
  }
}
