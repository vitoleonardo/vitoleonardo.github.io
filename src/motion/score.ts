import { SUN_IMPACT_Y, SUN_REST } from '../figures/shapes'
import { between, clamp01, quartOut, sineInOut, smooth } from '../math'
import type { FigureId, PathFrame } from '../types'

export interface Scene {
  id: string
  figure: FigureId
  seconds: number
  scroll: number
  rest: number
}

const STOP_SECONDS = 0.88
export const MORPH_SHARE = 0.62

export interface ScoreTiming {
  lineGrow: number
  indexMorph: { from: number; to: number }
  stopGround: number
  teachingGround: number
  inkIn: number
  inkOut: number
  aboutMorph: number
  sayHiMorph: number
}

export const DESKTOP_TIMING: ScoreTiming = {
  lineGrow: 0.3,
  indexMorph: { from: 0.5, to: 0.8 },
  stopGround: 0.3,
  teachingGround: 0.4,
  inkIn: 0.42,
  inkOut: 0.45,
  aboutMorph: 0.3,
  sayHiMorph: 0.5,
}

export const MOBILE_TIMING: ScoreTiming = {
  lineGrow: 0.85,
  indexMorph: { from: 0.1, to: 1.0 },
  stopGround: 0.55,
  teachingGround: 0.55,
  inkIn: 0.68,
  inkOut: 0.8,
  aboutMorph: 0.99,
  sayHiMorph: 0.9,
}

export const SCENES: Scene[] = [
  { id: 'hero', figure: 'hero', seconds: 1.9, scroll: 1.6, rest: 1.75 },
  { id: 'index', figure: 'index', seconds: 1.8, scroll: 1.5, rest: 1.6 },
  { id: 'stop-frontend', figure: 'frontend', seconds: STOP_SECONDS, scroll: 1, rest: 0.67 },
  { id: 'stop-backend', figure: 'backend', seconds: STOP_SECONDS, scroll: 1, rest: 0.67 },
  { id: 'stop-cloud', figure: 'cloud', seconds: STOP_SECONDS, scroll: 1, rest: 0.67 },
  { id: 'stop-data', figure: 'data', seconds: STOP_SECONDS, scroll: 1, rest: 0.67 },
  { id: 'stop-ai-products', figure: 'ai-products', seconds: STOP_SECONDS, scroll: 1, rest: 0.67 },
  { id: 'stop-ai-coding', figure: 'ai-coding', seconds: STOP_SECONDS, scroll: 1, rest: 0.67 },
  { id: 'stop-teaching', figure: 'teaching', seconds: STOP_SECONDS, scroll: 1, rest: 0.67 },
  { id: 'about', figure: 'about', seconds: 1.6, scroll: 1.5, rest: 1.3 },
  { id: 'say-hi', figure: 'say-hi', seconds: 2.4, scroll: 1.5, rest: 2.4 },
]

export const SCENE_INDEX: Record<string, number> = Object.fromEntries(SCENES.map((scene, index) => [scene.id, index]))

const HERO = {
  fall: 0.75,
  melt: 0.35,
  sinkFrom: 30,
  sinkTo: 58,
  wider: 0.35,
  flatter: 0.3,
}
const INK_OVERSHOOT = 0.06
const NODES = { from: 0.32, to: 0.6, leave: 0.3 }
const ROCKET = { from: 0.38, to: 0.68, leave: 0.18 }
const TEACHING_NIGHT = 0.35
const TEACHING_GLOW = { from: 0.22, to: 0.62 }
const ABOUT_NIGHT = 0.8

function resetFrame(frame: PathFrame, figure: FigureId): void {
  frame.from = figure
  frame.to = figure
  frame.morph = 0
  frame.heroGrow = 1
  frame.sun.x = SUN_REST.x
  frame.sun.y = SUN_REST.y
  frame.sun.scale = 1
  frame.sun.squashX = 1
  frame.sun.squashY = 1
  frame.sun.opacity = 0
  frame.inkStart = -1
  frame.inkEnd = -1
  frame.night = 0
  frame.shadow = 1
  frame.ripple = 1
  frame.pulse = 1
  frame.strands = 0
  frame.nodes = 0
  frame.rocket = 0
}

function heroFrame(frame: PathFrame, seconds: number, timing: ScoreTiming): void {
  const fall = between(seconds, 0, HERO.fall)
  const melt = between(seconds, HERO.fall, HERO.fall + HERO.melt)
  frame.heroGrow = quartOut(between(seconds, HERO.fall, HERO.fall + timing.lineGrow))
  frame.sun.opacity = 1 - smooth(between(melt, 0.35, 1))
  frame.sun.y = SUN_REST.y + (SUN_IMPACT_Y - SUN_REST.y) * fall * fall
  if (melt > 0) {
    const squash = sineInOut(between(melt, 0, 0.8))
    frame.sun.y = SUN_IMPACT_Y + HERO.sinkFrom * squash + (HERO.sinkTo - HERO.sinkFrom) * between(melt, 0.3, 1)
    frame.sun.squashX = 1 + HERO.wider * squash
    frame.sun.squashY = 1 - (1 - HERO.flatter) * squash
    frame.sun.scale = 1 - 0.25 * smooth(between(melt, 0.5, 1))
  }
}

function stopMorph(seconds: number, sceneSeconds: number): number {
  return between(seconds / sceneSeconds, 0, MORPH_SHARE)
}

export function scoreFrame(sceneIndex: number, seconds: number, timing: ScoreTiming, frame: PathFrame): PathFrame {
  const index = Math.max(0, Math.min(SCENES.length - 1, sceneIndex))
  const scene = SCENES[index]
  const previous = SCENES[Math.max(0, index - 1)]
  resetFrame(frame, scene.figure)
  const p = clamp01(seconds / scene.seconds)

  if (index === 0) {
    heroFrame(frame, seconds, timing)
    return frame
  }

  frame.from = previous.figure
  frame.to = scene.figure

  if (scene.id === 'index') {
    frame.morph = between(seconds, timing.indexMorph.from, timing.indexMorph.to)
  } else if (scene.id === 'about') {
    frame.morph = between(seconds, 0, timing.aboutMorph)
  } else if (scene.id === 'say-hi') {
    frame.morph = between(seconds, 0, timing.sayHiMorph)
  } else {
    frame.morph = stopMorph(seconds, scene.seconds)
  }
  if (frame.morph >= 1) frame.from = scene.figure

  switch (scene.figure) {
    case 'data':
      frame.strands = smooth(frame.morph)
      break
    case 'ai-products':
      frame.strands = 1 - smooth(frame.morph)
      frame.nodes = between(p, NODES.from, NODES.to)
      break
    case 'ai-coding': {
      frame.nodes = 1 - smooth(between(p, 0, NODES.leave))
      const front = sineInOut(between(p, 0, timing.inkIn))
      frame.inkEnd = -INK_OVERSHOOT + (1 + 2 * INK_OVERSHOOT) * front
      frame.rocket = between(p, ROCKET.from, ROCKET.to)
      break
    }
    case 'teaching': {
      const back = sineInOut(between(p, 0, timing.inkOut))
      frame.inkStart = -INK_OVERSHOOT + (1 + 2 * INK_OVERSHOOT) * back
      frame.inkEnd = back >= 1 ? -1 : 2
      if (back >= 1) frame.inkStart = -1
      frame.rocket = 1 - smooth(between(p, 0, ROCKET.leave))
      frame.night = TEACHING_NIGHT * smooth(between(p, TEACHING_GLOW.from, TEACHING_GLOW.to))
      frame.shadow = 1 - smooth(between(p, 0, timing.teachingGround))
      break
    }
    case 'about':
      frame.night = TEACHING_NIGHT + (1 - TEACHING_NIGHT) * smooth(between(seconds, 0, ABOUT_NIGHT))
      frame.shadow = 0
      break
    case 'say-hi': {
      const closing = sineInOut(between(seconds, 0, timing.sayHiMorph))
      frame.night = 1
      frame.shadow = 0
      frame.ripple = 1 - closing
      frame.pulse = 1 - closing
      break
    }
    default:
      break
  }
  return frame
}

export function sceneStart(index: number): number {
  let start = 0
  for (let i = 0; i < index; i++) start += SCENES[i].scroll
  return start
}

export const TOTAL_SCROLL = SCENES.reduce((sum, scene) => sum + scene.scroll, 0)

export function locate(position: number): { index: number; seconds: number; progress: number } {
  let start = 0
  for (let index = 0; index < SCENES.length; index++) {
    const scene = SCENES[index]
    const end = start + scene.scroll
    if (position < end || index === SCENES.length - 1) {
      const progress = clamp01((position - start) / scene.scroll)
      return { index, seconds: progress * scene.seconds, progress }
    }
    start = end
  }
  return { index: 0, seconds: 0, progress: 0 }
}

export function restPosition(index: number): number {
  const scene = SCENES[index]
  return sceneStart(index) + (scene.rest / scene.seconds) * scene.scroll
}
