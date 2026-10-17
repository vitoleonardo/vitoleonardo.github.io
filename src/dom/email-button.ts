import { env } from '../env'
import { announceStatus, copyText } from './clipboard'
import { assembleAddress, createPress, type PressSource } from './email-press'
import { REVEAL_STEP_MS, revealFrame, revealProgress } from './email-reveal'
import { hasFinePointer } from './pointer-capability'

const ACTIVATE_EVENT = 'email-button:activate'
const RETRACT_MS = 180
const SUPPRESSED_CLICK_WINDOW_MS = 300
const POINTER_TOLERANCE_PX = 8
const PRESS_KEYS = new Set(['Enter', ' '])

interface EmailButtonElements {
  button: HTMLButtonElement
  scope: HTMLElement
  label: HTMLElement
  name: HTMLElement
  status: HTMLElement
  confirmation: string
  opening: string
}

export function requestEmailActivation(button: HTMLElement): void {
  button.dispatchEvent(new CustomEvent(ACTIVATE_EVENT))
}

function findElements(): EmailButtonElements | null {
  const button = document.querySelector<HTMLButtonElement>('.email-button')
  const scope = button?.closest<HTMLElement>('.chapter-copy')
  const label = button?.querySelector<HTMLElement>('.email-label')
  const name = button?.querySelector<HTMLElement>('.email-name')
  const status = scope?.querySelector<HTMLElement>('.copy-status')
  if (!button || !scope || !label || !name || !status) return null
  return {
    button,
    scope,
    label,
    name,
    status,
    confirmation: scope.querySelector('.copy-done')?.textContent?.trim() ?? '',
    opening: scope.querySelector('.copy-opening')?.textContent?.trim() ?? '',
  }
}

function showMatchingHint(button: HTMLElement): void {
  const fine = hasFinePointer()
  const pointerHint = button.querySelector<HTMLElement>('[data-hint="pointer"]')
  const touchHint = button.querySelector<HTMLElement>('[data-hint="touch"]')
  if (pointerHint) pointerHint.hidden = !fine
  if (touchHint) touchHint.hidden = fine
}

export function initEmailButton(): () => void {
  const elements = findElements()
  if (!elements) return () => undefined
  const { button, scope, label, name, status, confirmation, opening } = elements
  const lifetime = new AbortController()
  const { signal } = lifetime
  const press = createPress()

  let revealed = false
  let revealFrameId = 0
  let pressFrameId = 0
  let lastFrameAt = 0
  let drawnProgress = 0
  let activePointerId: number | null = null
  let lastPointerType = 'mouse'
  let suppressClickUntil = 0

  function readAddress(): string | null {
    return assembleAddress(button.dataset.user, button.dataset.domain)
  }

  function showStatus(message: string, confirmed: boolean): void {
    status.classList.toggle('is-confirmed', confirmed)
    announceStatus(status, message)
  }

  function easeWidthTo(finalText: string): void {
    const currentText = label.textContent ?? ''
    const startWidth = button.getBoundingClientRect().width
    button.style.width = ''
    label.textContent = finalText
    const targetWidth = button.getBoundingClientRect().width
    label.textContent = currentText
    if (Math.abs(targetWidth - startWidth) < 1) return
    button.style.width = `${startWidth}px`
    void button.offsetWidth
    button.classList.add('is-resizing')
    button.style.width = `${targetWidth}px`
  }

  function reveal(address: string): void {
    if (revealed) return
    revealed = true
    button.classList.add('is-revealed')
    name.textContent = address
    if (env.reducedMotion) {
      label.textContent = address
      return
    }
    const from = label.textContent ?? ''
    const startedAt = performance.now()
    let lastStepAt = Number.NEGATIVE_INFINITY
    easeWidthTo(address)
    const step = (now: number): void => {
      const progress = revealProgress(now - startedAt)
      if (progress >= 1) {
        label.textContent = address
        return
      }
      if (now - lastStepAt >= REVEAL_STEP_MS) {
        label.textContent = revealFrame(from, address, progress, Math.random)
        lastStepAt = now
      }
      revealFrameId = requestAnimationFrame(step)
    }
    revealFrameId = requestAnimationFrame(step)
  }

  async function copyAndReveal(): Promise<void> {
    const address = readAddress()
    if (!address) return
    const copying = copyText(address)
    reveal(address)
    const copied = await copying
    showStatus(copied ? confirmation : address, copied)
  }

  function openMailApp(): void {
    const address = readAddress()
    if (!address) return
    reveal(address)
    showStatus(opening, false)
    window.location.href = `mailto:${address}`
  }

  function paintProgress(progress: number): void {
    button.style.setProperty('--press-progress', progress.toFixed(3))
    button.classList.toggle('is-drawing', progress > 0)
  }

  function frame(now: number): void {
    pressFrameId = 0
    if (press.active) {
      const tick = press.tick(now)
      drawnProgress = tick.progress
      paintProgress(drawnProgress)
      if (tick.completed) openMailApp()
    } else if (drawnProgress > 0) {
      const retractStep = env.reducedMotion ? drawnProgress : (now - lastFrameAt) / RETRACT_MS
      drawnProgress = Math.max(0, drawnProgress - retractStep)
      paintProgress(drawnProgress)
    }
    lastFrameAt = now
    if (press.active || drawnProgress > 0) pressFrameId = requestAnimationFrame(frame)
  }

  function keepDrawing(): void {
    if (pressFrameId !== 0) return
    lastFrameAt = performance.now()
    pressFrameId = requestAnimationFrame(frame)
  }

  function suppressNextClick(): void {
    suppressClickUntil = performance.now() + SUPPRESSED_CLICK_WINDOW_MS
  }

  function cancelPress(): void {
    press.cancel()
    activePointerId = null
    keepDrawing()
  }

  function beginPress(source: PressSource): boolean {
    if (!press.begin(performance.now(), source)) return false
    keepDrawing()
    return true
  }

  function isNearButton(event: PointerEvent): boolean {
    const box = button.getBoundingClientRect()
    return (
      event.clientX >= box.left - POINTER_TOLERANCE_PX &&
      event.clientX <= box.right + POINTER_TOLERANCE_PX &&
      event.clientY >= box.top - POINTER_TOLERANCE_PX &&
      event.clientY <= box.bottom + POINTER_TOLERANCE_PX
    )
  }

  function endPointerPress(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return
    activePointerId = null
    if (!isNearButton(event)) {
      press.cancel()
      suppressNextClick()
      keepDrawing()
      return
    }
    const outcome = press.end(performance.now(), 'pointer')
    if (outcome !== 'click') suppressNextClick()
    if (outcome === 'hold') openMailApp()
    keepDrawing()
  }

  function endKeyPress(): void {
    const outcome = press.end(performance.now(), 'key')
    if (outcome === 'click') button.click()
    if (outcome === 'hold') openMailApp()
    keepDrawing()
  }

  scope.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof Node) || !button.contains(event.target)) return
      event.stopPropagation()
      if (performance.now() < suppressClickUntil) {
        suppressClickUntil = 0
        return
      }
      void copyAndReveal()
    },
    { capture: true, signal },
  )
  button.addEventListener(ACTIVATE_EVENT, () => void copyAndReveal(), { signal })

  button.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      lastPointerType = event.pointerType
      suppressClickUntil = 0
      if (!beginPress('pointer')) return
      activePointerId = event.pointerId
      button.setPointerCapture(event.pointerId)
    },
    { signal },
  )
  button.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerId !== activePointerId || isNearButton(event)) return
      suppressNextClick()
      cancelPress()
    },
    { signal },
  )
  button.addEventListener('pointerup', endPointerPress, { signal })
  button.addEventListener('pointercancel', cancelPress, { signal })
  button.addEventListener(
    'lostpointercapture',
    (event) => {
      if (event.pointerId === activePointerId) cancelPress()
    },
    { signal },
  )
  button.addEventListener(
    'contextmenu',
    (event) => {
      if (lastPointerType !== 'mouse') event.preventDefault()
    },
    { signal },
  )

  button.addEventListener(
    'keydown',
    (event) => {
      if (!PRESS_KEYS.has(event.key) || event.ctrlKey || event.metaKey || event.altKey) return
      event.preventDefault()
      if (!event.repeat) beginPress('key')
    },
    { signal },
  )
  button.addEventListener(
    'keyup',
    (event) => {
      if (!PRESS_KEYS.has(event.key)) return
      event.preventDefault()
      endKeyPress()
    },
    { signal },
  )
  button.addEventListener('blur', cancelPress, { signal })
  window.addEventListener('blur', cancelPress, { signal })
  button.addEventListener(
    'transitionend',
    (event) => {
      if (event.target !== button || event.propertyName !== 'width') return
      button.style.width = ''
      button.classList.remove('is-resizing')
    },
    { signal },
  )

  showMatchingHint(button)

  return () => {
    lifetime.abort()
    window.cancelAnimationFrame(revealFrameId)
    window.cancelAnimationFrame(pressFrameId)
  }
}
