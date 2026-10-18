import { clamp, damp, splitProgress } from './interp'
import type { ConductorState } from './types'

const DEFAULT_DAMPING = 5.2
const MAX_STEP_SECONDS = 1 / 30
const SETTLE_EPSILON = 0.0001
const DIRECTION_EPSILON_PX = 0.25
const LAYOUT_SHIFT_PX = 1
const SECTION_SELECTOR = 'main .chapter'

export type ChapterListener = (chapter: number, state: Readonly<ConductorState>) => void

export interface ConductorOptions {
  reducedMotion: () => boolean
  touch: boolean
  sections?: readonly HTMLElement[]
  damping?: number
}

export interface Conductor {
  readonly state: Readonly<ConductorState>
  readonly chapter: number
  readonly ids: readonly string[]
  measure(): void
  start(): void
  stop(): void
  update(dt: number): void
  onChapterChange(listener: ChapterListener): () => void
  scrollToChapter(index: number): void
}

export function anchorsFromLayout(sectionTops: readonly number[], maxScroll: number): number[] {
  const anchors = sectionTops.map((top, index) => (index === 0 ? 0 : clamp(top, 0, maxScroll)))
  for (let index = 1; index < anchors.length; index += 1) {
    anchors[index] = Math.max(anchors[index], anchors[index - 1] + 1)
  }
  return anchors
}

export function progressFromScroll(scrollY: number, anchors: readonly number[]): number {
  if (anchors.length < 2) return 0
  const last = anchors.length - 1
  if (scrollY <= anchors[0]) return 0
  if (scrollY >= anchors[last]) return last
  let index = 0
  while (scrollY > anchors[index + 1]) index += 1
  const span = anchors[index + 1] - anchors[index]
  return index + clamp((scrollY - anchors[index]) / span, 0, 1)
}

export function scrollFromProgress(progress: number, anchors: readonly number[]): number {
  if (anchors.length < 2) return 0
  const last = anchors.length - 1
  const bounded = clamp(progress, 0, last)
  const index = Math.min(Math.floor(bounded), last - 1)
  return anchors[index] + (bounded - index) * (anchors[index + 1] - anchors[index])
}

export function layoutShifted(before: readonly number[], after: readonly number[]): boolean {
  if (before.length === 0) return false
  if (before.length !== after.length) return true
  return before.some((anchor, index) => Math.abs(anchor - after[index]) > LAYOUT_SHIFT_PX)
}

export function chapterAt(exact: number, count: number): number {
  return clamp(Math.round(exact), 0, Math.max(0, count - 1))
}

function documentTop(element: HTMLElement): number {
  return element.getBoundingClientRect().top + window.scrollY
}

function maxScrollOfDocument(): number {
  const scroller = document.scrollingElement ?? document.documentElement
  return Math.max(1, scroller.scrollHeight - window.innerHeight)
}

export function createConductor(options: ConductorOptions): Conductor {
  const sections = options.sections ?? Array.from(document.querySelectorAll<HTMLElement>(SECTION_SELECTOR))
  if (sections.length === 0) throw new Error(`createConductor found no sections for "${SECTION_SELECTOR}"`)

  const damping = options.damping ?? DEFAULT_DAMPING
  const ids = sections.map((section) => section.id)
  const listeners = new Set<ChapterListener>()
  const state: ConductorState = {
    exact: 0,
    smooth: 0,
    index: 0,
    next: 0,
    localExact: 0,
    localSmooth: 0,
    direction: 0,
  }

  let anchors: number[] = []
  let previousY = 0
  let chapter = -1
  let running = false
  let widthAtMeasure = 0
  let resizeObserver: ResizeObserver | null = null

  function writeSegments(): void {
    const exactSplit = splitProgress(state.exact, sections.length)
    state.index = exactSplit.index
    state.next = exactSplit.next
    state.localExact = exactSplit.local
    state.localSmooth = splitProgress(state.smooth, sections.length).local
  }

  function announceChapter(): void {
    const current = chapterAt(state.exact, sections.length)
    if (current === chapter) return
    chapter = current
    document.documentElement.dataset.chapter = ids[current]
    for (const listener of listeners) listener(current, state)
  }

  function measure(): void {
    widthAtMeasure = window.innerWidth
    anchors = anchorsFromLayout(sections.map(documentTop), maxScrollOfDocument())
  }

  function readScroll(): void {
    const y = window.scrollY
    const delta = y - previousY
    if (Math.abs(delta) > DIRECTION_EPSILON_PX) state.direction = delta > 0 ? 1 : -1
    previousY = y
    state.exact = progressFromScroll(y, anchors)
    if (options.reducedMotion()) state.smooth = state.exact
    writeSegments()
    announceChapter()
  }

  function remeasure(): void {
    const keptProgress = state.exact
    const previousAnchors = anchors
    measure()
    if (layoutShifted(previousAnchors, anchors)) {
      window.scrollTo({ top: scrollFromProgress(keptProgress, anchors), behavior: 'instant' })
    }
    readScroll()
  }

  function onResize(): void {
    if (options.touch && window.innerWidth === widthAtMeasure) return
    remeasure()
  }

  function start(): void {
    if (running) return
    running = true
    measure()
    previousY = window.scrollY
    state.exact = progressFromScroll(previousY, anchors)
    state.smooth = state.exact
    state.direction = 0
    writeSegments()
    chapter = -1
    announceChapter()

    window.addEventListener('scroll', readScroll, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })
    window.addEventListener('orientationchange', remeasure, { passive: true })
    window.addEventListener('pageshow', remeasure)
    window.addEventListener('hashchange', remeasure)

    resizeObserver = new ResizeObserver(() => {
      if (running) remeasure()
    })
    for (const section of sections) resizeObserver.observe(section)

    void document.fonts.ready.then(() => {
      if (running) remeasure()
    })
  }

  function stop(): void {
    if (!running) return
    running = false
    window.removeEventListener('scroll', readScroll)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', remeasure)
    window.removeEventListener('pageshow', remeasure)
    window.removeEventListener('hashchange', remeasure)
    resizeObserver?.disconnect()
    resizeObserver = null
  }

  function update(dt: number): void {
    const step = clamp(dt, 0, MAX_STEP_SECONDS)
    state.smooth = options.reducedMotion() ? state.exact : damp(state.smooth, state.exact, damping, step)
    if (Math.abs(state.smooth - state.exact) < SETTLE_EPSILON) state.smooth = state.exact
    state.localSmooth = splitProgress(state.smooth, sections.length).local
  }

  function onChapterChange(listener: ChapterListener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function scrollToChapter(index: number): void {
    if (anchors.length === 0) measure()
    const target = clamp(Math.round(index), 0, anchors.length - 1)
    window.scrollTo({ top: anchors[target], behavior: options.reducedMotion() ? 'auto' : 'smooth' })
  }

  return {
    state,
    get chapter() {
      return Math.max(0, chapter)
    },
    ids,
    measure,
    start,
    stop,
    update,
    onChapterChange,
    scrollToChapter,
  }
}
