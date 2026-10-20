import { env } from '../env'
import {
  classifyTarget,
  formatReadout,
  isSettled,
  readoutPlacement,
  stepCriticallyDamped,
  type CursorMode,
  type Spring,
} from './cursor-math'
import { hasFinePointer } from './pointer-capability'

const ACTIVE_CLASS = 'has-custom-cursor'
const POINTING_CLASS = 'is-pointing-hotspot'
const ALTIMETER_SELECTOR = '.altimeter-value'
const SMOOTHING_OMEGA = 46
const MAX_FRAME_SECONDS = 0.05

function createElement(): HTMLElement {
  const cursor = document.createElement('div')
  cursor.className = 'cursor'
  cursor.setAttribute('aria-hidden', 'true')
  cursor.dataset.mode = 'crosshair'
  for (const part of ['cross', 'ring', 'readout']) {
    const child = document.createElement('span')
    child.className = `cursor-${part}`
    cursor.append(child)
  }
  return cursor
}

export function initCursor(): () => void {
  const root = document.documentElement
  const altimeter = document.querySelector<HTMLElement>(ALTIMETER_SELECTOR)
  const lifetime = new AbortController()
  const { signal } = lifetime

  let element: HTMLElement | null = null
  let readout: HTMLElement | null = null
  let engaged = false
  let frame = 0
  let lastTime = 0
  let goal = { x: 0, y: 0 }
  let horizontal: Spring = { position: 0, velocity: 0 }
  let vertical: Spring = { position: 0, velocity: 0 }
  let mode: CursorMode = 'crosshair'
  let modeStale = true
  let pointingAtWorldHotspot = false
  let placementKey = ''
  let readoutSize = { width: 0, height: 0 }

  function eligible(): boolean {
    return hasFinePointer() && !env.reducedMotion
  }

  function ensureElement(): HTMLElement {
    if (element) return element
    element = createElement()
    readout = element.querySelector<HTMLElement>('.cursor-readout')
    document.body.append(element)
    return element
  }

  function pointedNote(): string | null {
    const id = root.dataset.pointedHotspot
    if (!id) return null
    return document.querySelector(`[data-cursor-note="${CSS.escape(id)}"]`)?.textContent?.trim() || null
  }

  function syncReadout(): void {
    if (!readout) return
    const text = pointedNote() ?? formatReadout(altimeter?.textContent)
    if (readout.textContent === text) return
    readout.textContent = text
    readoutSize = { width: readout.offsetWidth, height: readout.offsetHeight }
    placementKey = ''
  }

  function syncPlacement(): void {
    if (!element || !readout) return
    const placement = readoutPlacement(goal.x, goal.y, {
      ...readoutSize,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
    const key = `${placement.flipX}|${placement.flipY}`
    if (key === placementKey) return
    placementKey = key
    element.toggleAttribute('data-flip-x', placement.flipX)
    element.toggleAttribute('data-flip-y', placement.flipY)
  }

  function syncMode(): void {
    modeStale = false
    if (!element) return
    const hit = document.elementFromPoint(goal.x, goal.y)
    const next = classifyTarget(hit, pointingAtWorldHotspot)
    if (next === mode) return
    mode = next
    element.dataset.mode = next
  }

  function tick(now: number): void {
    frame = 0
    if (!element || !engaged) return
    const seconds = Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS)
    lastTime = now
    horizontal = stepCriticallyDamped(horizontal, goal.x, SMOOTHING_OMEGA, seconds)
    vertical = stepCriticallyDamped(vertical, goal.y, SMOOTHING_OMEGA, seconds)
    element.style.transform = `translate3d(${Math.round(horizontal.position)}px, ${Math.round(vertical.position)}px, 0)`
    if (modeStale) syncMode()
    syncPlacement()
    if (!isSettled(horizontal, goal.x) || !isSettled(vertical, goal.y)) request()
  }

  function request(): void {
    if (frame !== 0) return
    if (lastTime === 0) lastTime = performance.now()
    frame = requestAnimationFrame(tick)
  }

  function engage(): void {
    const cursor = ensureElement()
    engaged = true
    horizontal = { position: goal.x, velocity: 0 }
    vertical = { position: goal.y, velocity: 0 }
    lastTime = 0
    cursor.style.transform = `translate3d(${Math.round(goal.x)}px, ${Math.round(goal.y)}px, 0)`
    root.classList.add(ACTIVE_CLASS)
    cursor.classList.add('is-visible')
    syncReadout()
    modeStale = true
    syncMode()
    syncPlacement()
  }

  function disengage(): void {
    if (!engaged) return
    engaged = false
    lastTime = 0
    if (frame !== 0) cancelAnimationFrame(frame)
    frame = 0
    root.classList.remove(ACTIVE_CLASS)
    element?.classList.remove('is-visible')
    element?.removeAttribute('data-pressed')
  }

  document.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch' || !eligible()) {
        disengage()
        return
      }
      goal = { x: event.clientX, y: event.clientY }
      if (!engaged) engage()
      else {
        modeStale = true
        request()
      }
    },
    { passive: true, signal },
  )

  document.addEventListener(
    'pointerdown',
    () => {
      if (engaged) element?.setAttribute('data-pressed', '')
    },
    { passive: true, signal },
  )

  for (const type of ['pointerup', 'pointercancel'] as const) {
    document.addEventListener(type, () => element?.removeAttribute('data-pressed'), { passive: true, signal })
  }

  root.addEventListener('pointerleave', disengage, { passive: true, signal })
  window.addEventListener('blur', disengage, { signal })
  window.addEventListener(
    'scroll',
    () => {
      if (!engaged) return
      modeStale = true
      request()
    },
    { passive: true, capture: true, signal },
  )

  const rootObserver = new MutationObserver(() => {
    if (engaged && !eligible()) {
      disengage()
      return
    }
    syncReadout()
    const pointing = root.classList.contains(POINTING_CLASS)
    if (pointing === pointingAtWorldHotspot) return
    pointingAtWorldHotspot = pointing
    if (!engaged) return
    modeStale = true
    request()
  })
  rootObserver.observe(root, { attributes: true, attributeFilter: ['class', 'data-pointed-hotspot'] })

  const altimeterObserver = new MutationObserver(syncReadout)
  if (altimeter) altimeterObserver.observe(altimeter, { childList: true, characterData: true, subtree: true })

  return () => {
    lifetime.abort()
    rootObserver.disconnect()
    altimeterObserver.disconnect()
    disengage()
    element?.remove()
  }
}
