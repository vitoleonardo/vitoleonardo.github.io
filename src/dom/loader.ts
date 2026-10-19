import type { HandoffTarget, LoaderMotif, LoaderStage } from './loader-motif'
import { releasePlan, type ReleasePlan } from './loader-plan'

const LOADING_CLASS = 'loading'
const NO_WEBGL_CLASS = 'no-webgl'
const FADE_MS = 600
const MAX_WAIT_MS = 12000
const SKIP_THRESHOLD_MS = 250
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

export interface LoaderOptions {
  motif: LoaderMotif
  reducedMotion: () => boolean
  webgl: boolean
}

export interface Loader {
  setStage(stage: LoaderStage): void
  finish(): Promise<void>
  fail(): void
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function rectOf(selector: string): DOMRect {
  return document.querySelector(selector)?.getBoundingClientRect() ?? new DOMRect()
}

export function initLoader(options: LoaderOptions): Loader {
  const root = document.documentElement
  const curtain = document.getElementById('loader')
  const stage = curtain?.querySelector<HTMLElement>('.loader-stage')
  const main = document.getElementById('main')
  const shownAt = performance.now()
  let releasing: Promise<void> | null = null

  if (!curtain || !stage) {
    root.classList.remove(LOADING_CLASS)
    return { setStage() {}, finish: () => Promise.resolve(), fail() {} }
  }
  const overlay = curtain

  const input = new AbortController()
  const block = (event: Event): void => event.preventDefault()
  window.addEventListener('wheel', block, { passive: false, signal: input.signal })
  window.addEventListener('touchmove', block, { passive: false, signal: input.signal })
  window.addEventListener(
    'keydown',
    (event) => {
      if (SCROLL_KEYS.has(event.key)) event.preventDefault()
    },
    { signal: input.signal },
  )

  const maxWait = window.setTimeout(() => void release('fade'), MAX_WAIT_MS)
  const classes = new MutationObserver(() => {
    if (root.classList.contains(NO_WEBGL_CLASS)) void release('instant')
  })
  classes.observe(root, { attributes: true, attributeFilter: ['class'] })

  function target(): HandoffTarget {
    return {
      altimeter: rectOf('.altimeter'),
      rail: rectOf('.floor-rail'),
      altitude: document.querySelector('.altimeter-value')?.textContent ?? '0',
    }
  }

  function release(plan: ReleasePlan): Promise<void> {
    if (releasing) return releasing
    releasing = (async () => {
      clearTimeout(maxWait)
      classes.disconnect()
      input.abort()
      root.classList.remove(LOADING_CLASS)
      main?.removeAttribute('aria-busy')
      if (plan !== 'instant') {
        overlay.classList.add(plan === 'handoff' ? 'is-leaving' : 'is-fading')
        if (plan === 'handoff') await options.motif.handoff(target())
        else await wait(FADE_MS)
      }
      overlay.remove()
      options.motif.destroy()
    })()
    return releasing
  }

  if (options.webgl) options.motif.mount(stage)
  else void release('instant')

  return {
    setStage(stageName) {
      if (releasing) return
      overlay.dataset.stage = stageName
      options.motif.setStage(stageName)
    },
    finish() {
      return release(
        releasePlan({
          elapsedMs: performance.now() - shownAt,
          reducedMotion: options.reducedMotion(),
          webgl: options.webgl && !root.classList.contains(NO_WEBGL_CLASS),
          skipThresholdMs: SKIP_THRESHOLD_MS,
        }),
      )
    },
    fail() {
      void release('instant')
    },
  }
}
