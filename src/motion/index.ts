import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import type Lenis from 'lenis'
import { motionDebug, probeEvent, timed } from '../debug/probe'
import { env } from '../env'
import { pathReady } from '../path-bridge'
import { bindAnchorNavigation, jumpToHash } from './anchors'
import type { MotionContext, MotionMode, SectionMotion } from './context'
import { createGroundLayers, sceneSections } from './ground'
import { bindStepKeys } from './keys'
import { bindMobileJourney } from './mobile-journey'
import { installNavigation } from './navigator'
import { PathPort } from './path-port'
import { createSmoothScroll } from './smooth-scroll'
import { INTRO_READY_CLASS } from './sections/hero'
import { createStage, type Stage } from './stage'

gsap.registerPlugin(ScrollTrigger, SplitText)

const sectionModules = import.meta.glob<{ sectionMotion: SectionMotion }>('./sections/*.ts', { eager: true })

const MEDIA = {
  desktop: '(min-width: 900px) and (prefers-reduced-motion: no-preference)',
  mobile: '(max-width: 899.98px) and (prefers-reduced-motion: no-preference)',
  reduced: '(prefers-reduced-motion: reduce)',
}

let started = false
const activeNavigation: { lenis: Lenis | null; stage: Stage | null } = { lenis: null, stage: null }

function orderedSections(): SectionMotion[] {
  return Object.values(sectionModules)
    .map((module) => module.sectionMotion)
    .filter((section): section is SectionMotion => Boolean(section))
    .sort((a, b) => a.order - b.order)
}

function settledAssets(): Promise<unknown> {
  const fonts = document.fonts ? document.fonts.ready : Promise.resolve()
  const loaded =
    document.readyState === 'complete'
      ? Promise.resolve()
      : new Promise<void>((resolve) => window.addEventListener('load', () => resolve(), { once: true }))
  return Promise.all([fonts, loaded])
}

function runMode(mode: MotionMode, path: PathPort, sections: SectionMotion[]): () => void {
  const cleanups: Array<() => void> = []
  let lenis: Lenis | null = null
  let stage: Stage | null = null

  if (mode !== 'reduced') {
    if (!env.mobile) {
      const smooth = createSmoothScroll()
      lenis = smooth.lenis
      cleanups.push(() => smooth.destroy())
    }
    const ground = createGroundLayers()
    if (ground) cleanups.push(() => ground.destroy())
    if (mode === 'desktop') {
      document.documentElement.classList.add(INTRO_READY_CLASS)
      stage = createStage(lenis, path, ground)
      const activeStage = stage
      if (activeStage) cleanups.push(() => activeStage.destroy())
    } else {
      const sections = sceneSections()
      if (ground) {
        const followSections = timed('ground', (): void => ground.follow(sections))
        gsap.ticker.add(followSections)
        cleanups.push(() => gsap.ticker.remove(followSections))
      }
      cleanups.push(bindMobileJourney(path))
    }
  }

  const context: MotionContext = {
    mode,
    path,
    get lenis() {
      return lenis
    },
    get stage() {
      return stage
    },
    onCleanup(cleanup) {
      cleanups.push(cleanup)
    },
  }

  sections.forEach((section) => section[mode]?.(context))

  cleanups.push(bindStepKeys(lenis, () => stage))
  activeNavigation.lenis = lenis
  activeNavigation.stage = stage
  if (mode !== 'reduced') cleanups.push(bindAnchorNavigation(lenis, () => stage))

  return () => {
    cleanups.reverse().forEach((cleanup) => cleanup())
  }
}

export function initMotion(): void {
  if (started) return
  started = true
  gsap.ticker.lagSmoothing(0)
  ScrollTrigger.config({ ignoreMobileResize: true, autoRefreshEvents: 'visibilitychange,DOMContentLoaded,resize' })

  const path = new PathPort()
  ScrollTrigger.addEventListener('refresh', () => {
    if (motionDebug) probeEvent('scrolltrigger-refresh')
    path.refresh()
  })
  void pathReady.then((api) => {
    if (api) path.attach(api)
  })

  installNavigation()
  const sections = orderedSections()
  const root = document.documentElement
  let media = gsap.matchMedia()
  let activeMode: MotionMode | null = null
  const install = (): void => {
    media.add(MEDIA, (matchContext) => {
      const conditions = matchContext.conditions ?? {}
      const stacked = root.classList.contains('no-webgl')
      const mode: MotionMode = conditions.desktop && !stacked ? 'desktop' : conditions.reduced ? 'reduced' : 'mobile'
      activeMode = mode
      return runMode(mode, path, sections)
    })
  }
  install()
  void pathReady.then((api) => {
    if (api || activeMode !== 'desktop' || !root.classList.contains('no-webgl')) return
    media.revert()
    media = gsap.matchMedia()
    install()
    ScrollTrigger.refresh()
  })

  void settledAssets().then(() => {
    ScrollTrigger.refresh()
    requestAnimationFrame(() => requestAnimationFrame(() => jumpToHash(activeNavigation.lenis, activeNavigation.stage)))
  })
}
