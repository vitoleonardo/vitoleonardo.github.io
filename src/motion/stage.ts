import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type Lenis from 'lenis'
import { timed } from '../debug/probe'
import { between, clamp01, smooth } from '../math'
import { TUNE } from '../tune'
import type { GroundLayers } from './ground'
import type { PathPort } from './path-port'
import { DESKTOP_TIMING, locate, MORPH_SHARE, restPosition, SCENE_INDEX, sceneStart, SCENES, TOTAL_SCROLL } from './score'
import { smoothScrollTo, snapScrollTo } from './smooth-scroll'

export interface Stage {
  readonly scenes: HTMLElement[]
  readonly trigger: ScrollTrigger
  position(): number
  current(): number
  scrollFor(position: number): number
  restScrolls(): number[]
  sceneIndexOf(node: Node | null): number
  destroy(): void
}

const STAGE_CLASS = 'stage-mode'
const SCENE_CLASS = 'scene'
const CURRENT_CLASS = 'is-current'
const LIT_CLASS = 'is-lit'
const BAR_OUT = 0.05
const BAR_IN = 0.05
const BAR_OVERLAP = 0.03
const TEXT_RISE = 18
const TEXT_IN = { from: 0.18, to: 0.42 }
const LABELS_IN = { from: 0.32, to: 0.55 }
const PROOF_IN = { from: 0.3, to: 0.52 }
const TEXT_OUT = { from: 0.9, to: 1 }
const LIGHTS = { from: 0.24, to: 0.74 }
const HERO_OUT = { lift: 36, seconds: 0.4 }
const MARKER_LEAD = 0.05
const INDEX = { copyFrom: 0.35, copyTo: 0.85, markersFrom: DESKTOP_TIMING.indexMorph.to - MARKER_LEAD, markerStagger: 0.07, markerSeconds: 0.4, restFrom: 1.3, outFrom: 1.65 }
const ABOUT = { beams: 0.8, copy: [0.25, 0.75], text: [0.35, 0.85], portrait: [0.4, 0.9], facts: [0.5, 1.0], outFrom: 1.45 }
const SAY_HI = { core: [0.7, 1.3], note: [0.9, 1.4], footer: [1.1, 1.6] }
const GROUND_FADE_SECONDS = { about: 0.8, sayHi: 0.9 }
const INDEX_SCENE = SCENE_INDEX.index
const FIRST_STOP = SCENE_INDEX['stop-frontend']
const LAST_STOP = SCENE_INDEX['stop-teaching']
const ABOUT_SCENE = SCENE_INDEX.about
const SAY_HI_SCENE = SCENE_INDEX['say-hi']
const SNAP_IDLE_MS = 140
const SNAP_SECONDS = { min: 0.5, max: 0.95, perScene: 0.5 }
const SNAP_GUARD_MS = 250
const POSITION_EPSILON = 1e-3
const FOCUS_SCROLL_SECONDS = 0.8

function at(index: number, seconds: number): number {
  return sceneStart(index) + (seconds / SCENES[index].seconds) * SCENES[index].scroll
}

function span(index: number, seconds: number): number {
  return (seconds / SCENES[index].seconds) * SCENES[index].scroll
}

function atShare(index: number, share: number): number {
  return sceneStart(index) + share * SCENES[index].scroll
}

function groundShare(index: number): number {
  return index === LAST_STOP ? DESKTOP_TIMING.teachingGround : DESKTOP_TIMING.stopGround
}

function list(root: ParentNode, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
}

function fadeIn(timeline: gsap.core.Timeline, targets: HTMLElement[], start: number, duration: number, rise = TEXT_RISE): void {
  if (targets.length === 0) return
  timeline.fromTo(
    targets,
    { opacity: 0, y: rise },
    { opacity: 1, y: 0, duration, ease: 'power2.out', stagger: Math.min(0.02, duration / (targets.length * 4)) },
    start,
  )
}

function fadeOut(timeline: gsap.core.Timeline, targets: HTMLElement[], start: number, duration: number, lift = 0): void {
  if (targets.length === 0) return
  timeline.fromTo(targets, { opacity: 1, y: 0 }, { opacity: 0, y: -lift, duration, ease: 'power1.in', immediateRender: false }, start)
}

function stopLayout(panel: HTMLElement, order: number): void {
  list(panel, '.stack-progress .seg').forEach((segment, index) => {
    segment.classList.toggle('is-on', index <= order)
    segment.classList.toggle('is-red', index === order && panel.classList.contains('is-red-stop'))
  })
}

export function createStage(lenis: Lenis | null, path: PathPort, ground: GroundLayers | null): Stage | null {
  const main = document.getElementById('main')
  const scenes = SCENES.map((scene) => document.getElementById(scene.id))
  if (!main || scenes.some((scene) => !scene)) return null
  const elements = scenes as HTMLElement[]
  const root = document.documentElement
  root.classList.add(STAGE_CLASS)
  elements.forEach((element) => element.classList.add(SCENE_CLASS))

  const master = gsap.timeline({ defaults: { ease: 'none' }, paused: true })
  master.to({}, { duration: TOTAL_SCROLL }, 0)

  elements.forEach((element, index) => {
    if (index === 0) return
    const boundary = sceneStart(index)
    const outgoing = list(elements[index - 1], ':scope > .bar-top, :scope > .bar-bottom')
    const incoming = list(element, ':scope > .bar-top, :scope > .bar-bottom')
    fadeOut(master, outgoing, boundary - BAR_OUT + BAR_OVERLAP, BAR_OUT)
    fadeIn(master, incoming, boundary - BAR_OVERLAP, BAR_IN, 0)
  })

  const hero = elements[0]
  const heroText = list(hero, ':scope > .hero-copy, :scope > .hero-actions')
  fadeOut(master, heroText, at(INDEX_SCENE, 0), span(INDEX_SCENE, HERO_OUT.seconds), HERO_OUT.lift)
  fadeOut(master, list(hero, ':scope > .grid-lines'), at(INDEX_SCENE, 0), span(INDEX_SCENE, HERO_OUT.seconds))

  const index = elements[INDEX_SCENE]
  const indexCopy = list(index, '.index-copy > *')
  fadeIn(master, indexCopy, at(INDEX_SCENE, INDEX.copyFrom), span(INDEX_SCENE, INDEX.copyTo - INDEX.copyFrom), 20)
  list(index, '.index-stop').forEach((stop, order) => {
    const start = at(INDEX_SCENE, INDEX.markersFrom + order * INDEX.markerStagger)
    const marker = stop.querySelector<HTMLElement>('.marker')
    if (marker) {
      master.fromTo(marker, { scale: 0 }, { scale: 1, duration: span(INDEX_SCENE, INDEX.markerSeconds), ease: 'back.out(1.7)' }, start)
    }
    fadeIn(master, list(stop, '.stop-number, .stop-name, .stop-tools'), start + span(INDEX_SCENE, 0.05), span(INDEX_SCENE, INDEX.markerSeconds), 10)
  })
  const indexOut = list(index, ':scope .index-copy, :scope .index-stops')
  fadeOut(master, indexOut, at(INDEX_SCENE, INDEX.outFrom), span(INDEX_SCENE, SCENES[INDEX_SCENE].seconds - INDEX.outFrom))

  for (let order = FIRST_STOP; order <= LAST_STOP; order++) {
    const panel = elements[order]
    stopLayout(panel, order - FIRST_STOP)
    const copy = list(panel, '.panel-copy > *')
    const labels = list(panel, '.stage > :not(.path-fallback)')
    const proof = list(panel, ':scope > .proof-row, :scope > .student-lights')
    fadeIn(master, copy, atShare(order, TEXT_IN.from), atShare(order, TEXT_IN.to) - atShare(order, TEXT_IN.from))
    fadeIn(master, labels, atShare(order, LABELS_IN.from), atShare(order, LABELS_IN.to) - atShare(order, LABELS_IN.from), 8)
    fadeIn(master, proof, atShare(order, PROOF_IN.from), atShare(order, PROOF_IN.to) - atShare(order, PROOF_IN.from), 12)
    const segment = list(panel, '.stack-progress .seg')[order - FIRST_STOP]
    if (segment) {
      master.fromTo(
        segment,
        { scaleX: 0 },
        { scaleX: 1, transformOrigin: 'left center', duration: atShare(order, groundShare(order)) - atShare(order, 0), ease: 'power2.inOut' },
        atShare(order, 0),
      )
    }
    fadeOut(master, [...copy, ...labels, ...proof], atShare(order, TEXT_OUT.from), atShare(order, TEXT_OUT.to) - atShare(order, TEXT_OUT.from))
  }

  const about = elements[ABOUT_SCENE]
  fadeIn(master, list(about, ':scope > .beams'), at(ABOUT_SCENE, 0), span(ABOUT_SCENE, ABOUT.beams), 0)
  fadeIn(master, list(about, '.panel-copy > .fig-caption, .panel-copy > h2'), at(ABOUT_SCENE, ABOUT.copy[0]), span(ABOUT_SCENE, ABOUT.copy[1] - ABOUT.copy[0]))
  fadeIn(master, list(about, '.panel-copy > .about-text'), at(ABOUT_SCENE, ABOUT.text[0]), span(ABOUT_SCENE, ABOUT.text[1] - ABOUT.text[0]))
  fadeIn(master, list(about, '.stage > .portrait'), at(ABOUT_SCENE, ABOUT.portrait[0]), span(ABOUT_SCENE, ABOUT.portrait[1] - ABOUT.portrait[0]), 24)
  fadeIn(master, list(about, ':scope > .facts'), at(ABOUT_SCENE, ABOUT.facts[0]), span(ABOUT_SCENE, ABOUT.facts[1] - ABOUT.facts[0]), 12)
  fadeOut(
    master,
    list(about, ':scope > .beams, .panel-copy, .stage > .portrait, :scope > .facts'),
    at(ABOUT_SCENE, ABOUT.outFrom),
    span(ABOUT_SCENE, SCENES[ABOUT_SCENE].seconds - ABOUT.outFrom),
  )

  const sayHi = elements[SAY_HI_SCENE]
  fadeIn(master, list(sayHi, '.sayhi-core'), at(SAY_HI_SCENE, SAY_HI.core[0]), span(SAY_HI_SCENE, SAY_HI.core[1] - SAY_HI.core[0]), 14)
  fadeIn(master, list(sayHi, '.stage > .annotation'), at(SAY_HI_SCENE, SAY_HI.note[0]), span(SAY_HI_SCENE, SAY_HI.note[1] - SAY_HI.note[0]), 0)
  fadeIn(master, list(sayHi, ':scope > .site-footer'), at(SAY_HI_SCENE, SAY_HI.footer[0]), span(SAY_HI_SCENE, SAY_HI.footer[1] - SAY_HI.footer[0]), 12)

  const trigger = ScrollTrigger.create({
    trigger: main,
    start: 'top top',
    end: () => `+=${window.innerHeight * TOTAL_SCROLL}`,
    pin: true,
    scrub: TUNE.trackScrub,
    animation: master,
    invalidateOnRefresh: true,
  })

  const lights = list(elements[LAST_STOP], '.student-lights li')
  let litApplied = -1
  let currentScene = -1
  const setCurrent = (scene: number): void => {
    if (scene === currentScene) return
    if (currentScene >= 0) elements[currentScene].classList.remove(CURRENT_CLASS)
    currentScene = scene
    elements[scene].classList.add(CURRENT_CLASS)
    root.dataset.scene = SCENES[scene].id
  }

  const groundPosition = (scene: number, seconds: number, share: number): number => {
    if (scene === 0) return 0
    if (scene === ABOUT_SCENE) return scene - 1 + smooth(between(seconds, 0, GROUND_FADE_SECONDS.about))
    if (scene === SAY_HI_SCENE) return scene - 1 + smooth(between(seconds, 0, GROUND_FADE_SECONDS.sayHi))
    return scene - 1 + smooth(between(share, 0, groundShare(scene)))
  }

  const position = (): number => master.time()
  const sync = timed('stage', (): void => {
    const located = locate(position())
    path.score(located.index, located.seconds, DESKTOP_TIMING)
    ground?.set(groundPosition(located.index, located.seconds, located.progress))
    setCurrent(located.index)
    const lit =
      located.index < LAST_STOP ? 0 : located.index > LAST_STOP ? lights.length : Math.round(between(located.progress, LIGHTS.from, LIGHTS.to) * lights.length)
    if (lit !== litApplied) {
      litApplied = lit
      lights.forEach((light, order) => light.classList.toggle(LIT_CLASS, order < lit))
    }
  })
  gsap.ticker.add(sync)
  sync()

  const scrollFor = (target: number): number => trigger.start + (clamp01(target / TOTAL_SCROLL) * (trigger.end - trigger.start))
  const toPosition = (scroll: number): number => clamp01((scroll - trigger.start) / Math.max(1, trigger.end - trigger.start)) * TOTAL_SCROLL
  const restScrolls = (): number[] => SCENES.map((_, scene) => (scene === 0 ? trigger.start : scrollFor(restPosition(scene))))
  const sceneIndexOf = (node: Node | null): number => (node ? elements.findIndex((element) => element === node || element.contains(node)) : -1)

  const snapRests = (): number[] => {
    const rests: number[] = []
    for (let scene = INDEX_SCENE; scene <= LAST_STOP; scene++) rests.push(restPosition(scene))
    return rests
  }
  const restZone = (scene: number): [number, number] => {
    if (scene === INDEX_SCENE) return [at(INDEX_SCENE, INDEX.restFrom), at(INDEX_SCENE, INDEX.outFrom)]
    return [atShare(scene, MORPH_SHARE), atShare(scene, TEXT_OUT.from)]
  }
  let lastDirection = 1
  let lastScrollAt = 0
  let snapUntil = 0
  const onScroll = (instance: Lenis): void => {
    if (instance.direction) lastDirection = instance.direction
    lastScrollAt = performance.now()
  }
  lenis?.on('scroll', onScroll)
  const maybeSnap = timed('snap', (): void => {
    if (!lenis) return
    const now = performance.now()
    if (now < snapUntil || lenis.isScrolling || now - lastScrollAt < SNAP_IDLE_MS) return
    const current = toPosition(lenis.scroll)
    const lower = restZone(INDEX_SCENE)[1]
    const upper = restZone(LAST_STOP)[1]
    if (current < lower - POSITION_EPSILON || current > upper) return
    const scene = locate(current).index
    const [zoneFrom, zoneTo] = restZone(scene)
    if (current >= zoneFrom && current <= zoneTo) return
    const rests = snapRests()
    const target = lastDirection > 0 ? rests.find((rest) => rest > current + POSITION_EPSILON) : [...rests].reverse().find((rest) => rest < current - POSITION_EPSILON)
    if (target === undefined) return
    const distance = Math.abs(target - current)
    const seconds = Math.min(SNAP_SECONDS.max, SNAP_SECONDS.min + distance * SNAP_SECONDS.perScene)
    snapUntil = now + seconds * 1000 + SNAP_GUARD_MS
    snapScrollTo(lenis, scrollFor(target), seconds)
  })
  gsap.ticker.add(maybeSnap)

  const onFocusIn = (event: FocusEvent): void => {
    const scene = sceneIndexOf(event.target as Node | null)
    if (scene < 0 || scene === currentScene) return
    const target = scene === 0 ? trigger.start : scrollFor(restPosition(scene))
    snapUntil = performance.now() + FOCUS_SCROLL_SECONDS * 1000 + SNAP_GUARD_MS
    smoothScrollTo(lenis, target, FOCUS_SCROLL_SECONDS)
  }
  main.addEventListener('focusin', onFocusIn)

  return {
    scenes: elements,
    trigger,
    position,
    current: () => currentScene,
    scrollFor,
    restScrolls,
    sceneIndexOf,
    destroy() {
      gsap.ticker.remove(sync)
      gsap.ticker.remove(maybeSnap)
      lenis?.off('scroll', onScroll)
      main.removeEventListener('focusin', onFocusIn)
      trigger.kill()
      master.kill()
      root.classList.remove(STAGE_CLASS)
      delete root.dataset.scene
      lights.forEach((light) => light.classList.remove(LIT_CLASS))
      elements.forEach((element) => {
        element.classList.remove(SCENE_CLASS, CURRENT_CLASS)
        gsap.set(list(element, '*'), { clearProps: 'opacity,transform,transformOrigin' })
      })
    },
  }
}
