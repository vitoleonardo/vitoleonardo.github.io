import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type Lenis from 'lenis'
import { jumpDuration, smoothScrollTo } from './smooth-scroll'
import type { Stage } from './stage'

const EXCLUDED_HASHES = new Set(['', '#', '#main'])
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]'

function documentTop(element: HTMLElement): number {
  const pinned = ScrollTrigger.getAll().find((trigger) => {
    const pin = trigger.pin
    return pin instanceof HTMLElement && (pin === element || pin.contains(element))
  })
  if (pinned) return pinned.start
  return element.getBoundingClientRect().top + window.scrollY
}

export function scrollTargetFor(element: HTMLElement, stage: Stage | null): number {
  if (element.id === 'hero' || element.id === 'main') return 0
  if (stage) {
    const target = element.id === 'stack' ? stage.scenes[2] : element
    const scene = stage.sceneIndexOf(target)
    if (scene >= 0) return stage.restScrolls()[scene]
  }
  return Math.max(0, documentTop(element))
}

function focusWithoutScroll(element: HTMLElement): void {
  if (!element.matches(FOCUSABLE)) element.setAttribute('tabindex', '-1')
  element.focus({ preventScroll: true })
}

export function jumpToHash(lenis: Lenis | null, stage: Stage | null): void {
  const hash = window.location.hash
  if (EXCLUDED_HASHES.has(hash)) return
  const target = document.getElementById(decodeURIComponent(hash.slice(1)))
  if (!target) return
  const destination = scrollTargetFor(target, stage)
  lenis?.resize()
  window.scrollTo(0, destination)
  lenis?.scrollTo(destination, { immediate: true, force: true })
  ScrollTrigger.update()
}

export function bindAnchorNavigation(lenis: Lenis | null, stage: () => Stage | null): () => void {
  const onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = (event.target as Element | null)?.closest?.('a[href^="#"]')
    if (!(link instanceof HTMLAnchorElement)) return
    const hash = link.getAttribute('href') ?? ''
    if (EXCLUDED_HASHES.has(hash)) return
    const target = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (!target) return
    event.preventDefault()
    const destination = scrollTargetFor(target, stage())
    const current = lenis ? lenis.scroll : window.scrollY
    history.replaceState(null, '', hash)
    smoothScrollTo(lenis, destination, jumpDuration(destination - current), () => focusWithoutScroll(target))
  }
  document.addEventListener('click', onClick)
  return () => document.removeEventListener('click', onClick)
}
