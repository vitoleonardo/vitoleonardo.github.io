import { gsap } from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { TUNE } from '../tune'

export interface MaskBleed {
  top: number
  right: number
  bottom: number
  left: number
}

const HEADING_BLEED: MaskBleed = { top: 0.08, right: 0.1, bottom: 0.2, left: 0.04 }

function openMasks(split: SplitText, bleed: MaskBleed): void {
  split.masks.forEach((mask) => {
    const style = (mask as HTMLElement).style
    style.padding = `${bleed.top}em ${bleed.right}em ${bleed.bottom}em ${bleed.left}em`
    style.margin = `-${bleed.top}em -${bleed.right}em -${bleed.bottom}em -${bleed.left}em`
  })
}

export function splitWords(element: Element, bleed: MaskBleed = HEADING_BLEED): SplitText {
  const split = SplitText.create(element, { type: 'words', mask: 'words', wordsClass: 'split-word' })
  openMasks(split, bleed)
  return split
}

export function splitChars(element: Element, bleed: MaskBleed): SplitText {
  const split = SplitText.create(element, {
    type: 'words,chars',
    mask: 'words',
    wordsClass: 'split-word',
    charsClass: 'split-char',
  })
  openMasks(split, bleed)
  return split
}

export function wordsReveal(element: Element, vars: gsap.TweenVars = {}): gsap.core.Tween | null {
  const split = splitWords(element)
  if (split.words.length === 0) return null
  return gsap.from(split.words, {
    yPercent: 135,
    opacity: 0,
    duration: TUNE.revealDuration,
    ease: TUNE.revealEase,
    stagger: TUNE.wordStagger,
    ...vars,
  })
}

export function annotationReveal(lines: Element[]): gsap.core.Tween | null {
  if (lines.length === 0) return null
  return gsap.from(lines, {
    scaleX: 0,
    transformOrigin: 'left center',
    duration: TUNE.annotationDuration,
    ease: TUNE.annotationEase,
  })
}

export function riseIn(targets: Element[] | Element, vars: gsap.TweenVars = {}): gsap.core.Tween | null {
  const list = Array.isArray(targets) ? targets : [targets]
  if (list.length === 0) return null
  return gsap.from(list, {
    y: TUNE.proofRise,
    opacity: 0,
    duration: TUNE.proofDuration,
    ease: TUNE.revealEase,
    ...vars,
  })
}

export function fadeIn(targets: Element[] | Element, vars: gsap.TweenVars = {}): gsap.core.Tween | null {
  const list = Array.isArray(targets) ? targets : [targets]
  if (list.length === 0) return null
  return gsap.from(list, { opacity: 0, duration: 0.6, ease: 'power1.out', ...vars })
}

export function query<T extends Element = HTMLElement>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector))
}
