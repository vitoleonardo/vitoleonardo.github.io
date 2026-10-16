import { gsap } from 'gsap'
import { expect, test } from 'vitest'
import { createFrame } from '../frame'
import type { PathFrame } from '../types'
import { Chase, ENTRY_SHARE, journeyScene, journeyTarget } from './journey'
import { MOBILE_TIMING, SCENES, scoreFrame } from './score'

const FRAME = 1 / 60
const LERP = 0.09
const SCRUB = 0.65
const expo = gsap.parseEase('expo')

function frameAt(position: number): PathFrame {
  const scene = journeyScene(position)
  return scoreFrame(scene.index, scene.seconds, MOBILE_TIMING, createFrame())
}

const rounded = (value: number): number => Math.round(value * 1e6) / 1e6 + 0

function shown(frame: PathFrame) {
  const morph = rounded(frame.morph)
  const figure = frame.from === frame.to || morph <= 0 ? frame.from : morph >= 1 ? frame.to : `${frame.from}→${frame.to}@${morph}`
  const inked = frame.inkStart <= 0 && frame.inkEnd >= 1
  return {
    figure,
    inked,
    heroGrow: rounded(frame.heroGrow),
    sun: frame.sun.opacity > 0 ? { ...frame.sun } : null,
    night: rounded(frame.night),
    shadow: rounded(frame.shadow),
    ripple: rounded(frame.ripple),
    pulse: rounded(frame.pulse),
    strands: rounded(frame.strands),
    nodes: rounded(frame.nodes),
    rocket: rounded(frame.rocket),
  }
}

const entriesWith = (index: number, progress: number): number[] => SCENES.map((_, scene) => (scene < index ? 1 : scene === index ? progress : 0))

test('the journey position scores exactly what the stage triggers scored before', () => {
  for (let index = 1; index < SCENES.length; index++) {
    for (const progress of [0.01, 0.25, 0.5, 0.775, 1]) {
      const scene = journeyScene(journeyTarget(entriesWith(index, progress), 1))
      expect(scene.index).toBe(index)
      expect(scene.seconds).toBeCloseTo(progress * ENTRY_SHARE * SCENES[index].seconds, 9)
    }
  }
  for (const hero of [0, 0.3, 1]) {
    expect(journeyScene(journeyTarget(entriesWith(0, 0), hero))).toEqual({ index: 0, seconds: hero * SCENES[0].seconds })
  }
})

test('a stage that has not entered leaves the position on the scene before it', () => {
  expect(journeyTarget(entriesWith(3, 0), 1)).toBe(3)
  expect(journeyTarget(SCENES.map(() => 0), 0.4)).toBe(0.4)
})

test('every scene boundary looks the same from both sides', () => {
  for (let index = 1; index < SCENES.length; index++) {
    expect(shown(frameAt(index + 1e-9)), SCENES[index].id).toEqual(shown(frameAt(index)))
  }
})

test('the chase comes to rest exactly on the target and never overshoots', () => {
  const chase = new Chase(LERP, SCRUB, expo)
  chase.jump(2)
  expect(chase.follow(2, 10)).toBe(2)
  const values: number[] = []
  for (let frame = 0; frame <= 120; frame++) values.push(chase.follow(3, 10 + frame * FRAME))
  expect(values[0]).toBe(2)
  values.slice(1).forEach((value, i) => {
    expect(value).toBeGreaterThanOrEqual(values[i])
    expect(value).toBeLessThanOrEqual(3)
  })
  expect(values.at(-1)).toBe(3)
})

test('a morph the finger crosses in three frames plays over many', () => {
  const chase = new Chase(LERP, SCRUB, expo)
  const start = 3
  chase.jump(start)
  const fling = (frame: number): number => start + Math.min(1, frame / 3)
  const morphAt = (position: number): number => (position <= start ? 0 : frameAt(position).morph)
  const morphs: number[] = []
  for (let frame = 0; frame < 90; frame++) {
    morphs.push(morphAt(chase.follow(fling(frame), frame * FRAME)))
  }
  const raw = Array.from({ length: 90 }, (_, frame) => morphAt(fling(frame)))
  const between = (values: number[]): number => values.filter((morph) => morph > 0 && morph < 1).length
  const largestStep = (values: number[]): number => Math.max(...values.slice(1).map((value, i) => Math.abs(value - values[i])))
  expect(between(raw)).toBeLessThanOrEqual(2)
  expect(between(morphs)).toBeGreaterThanOrEqual(20)
  expect(largestStep(morphs)).toBeLessThan(0.08)
  expect(morphs.at(-1)).toBe(1)
})
