import { describe, expect, test } from 'vitest'
import { createFrame } from '../frame'
import type { PathFrame } from '../types'
import { DESKTOP_TIMING, locate, MOBILE_TIMING, restPosition, sceneStart, SCENES, scoreFrame, TOTAL_SCROLL } from './score'

const TIMINGS = { desktop: DESKTOP_TIMING, mobile: MOBILE_TIMING }
const NORMALISED_FIELDS = ['heroGrow', 'night', 'shadow', 'ripple', 'pulse', 'strands', 'nodes', 'rocket'] as const
const INK_SAMPLES = 101
const STEPS_PER_SCENE = 400
const MAX_STEP_CHANGE = 0.1

function score(sceneIndex: number, seconds: number, timing = DESKTOP_TIMING): PathFrame {
  return scoreFrame(sceneIndex, seconds, timing, createFrame())
}

function shownFigure(frame: PathFrame): string {
  if (frame.from === frame.to || frame.morph <= 0) return frame.from
  if (frame.morph >= 1) return frame.to
  return `${frame.from}→${frame.to}@${frame.morph.toFixed(4)}`
}

function inkCoverage(frame: PathFrame): number {
  let covered = 0
  for (let sample = 0; sample < INK_SAMPLES; sample++) {
    const arc = sample / (INK_SAMPLES - 1)
    if (arc >= frame.inkStart && arc <= frame.inkEnd) covered++
  }
  return covered / INK_SAMPLES
}

function visibleState(frame: PathFrame) {
  const sunVisible = frame.sun.opacity > 0
  return {
    figure: shownFigure(frame),
    ink: inkCoverage(frame),
    sun: sunVisible ? { ...frame.sun } : null,
    ...Object.fromEntries(NORMALISED_FIELDS.map((field) => [field, frame[field]])),
  }
}

describe.each(Object.entries(TIMINGS))('%s score', (_, timing) => {
  test.each(SCENES.slice(1).map((scene, offset) => [SCENES[offset].id, scene.id, offset + 1] as const))(
    '%s hands over to %s without a visible jump',
    (_from, _to, index) => {
      const outgoing = score(index - 1, SCENES[index - 1].seconds, timing)
      const incoming = score(index, 0, timing)
      expect(visibleState(incoming)).toEqual(visibleState(outgoing))
    },
  )

  test.each(SCENES.map((scene, index) => [scene.id, index] as const))('%s plays without a visible jump', (_id, index) => {
    const seconds = SCENES[index].seconds
    let previous = score(index, 0, timing)
    for (let step = 1; step <= STEPS_PER_SCENE; step++) {
      const current = score(index, (step / STEPS_PER_SCENE) * seconds, timing)
      for (const field of NORMALISED_FIELDS) expect(Math.abs(current[field] - previous[field])).toBeLessThan(MAX_STEP_CHANGE)
      expect(Math.abs(current.sun.opacity - previous.sun.opacity)).toBeLessThan(MAX_STEP_CHANGE)
      expect(Math.abs(inkCoverage(current) - inkCoverage(previous))).toBeLessThan(MAX_STEP_CHANGE)
      if (current.from === previous.from && current.to === previous.to) {
        expect(Math.abs(current.morph - previous.morph)).toBeLessThan(MAX_STEP_CHANGE)
      } else {
        expect(current.from).toBe(previous.to)
        expect(1 - previous.morph).toBeLessThan(MAX_STEP_CHANGE)
      }
      previous = current
    }
  })
})

test('scoring keeps no state, so scrolling back shows the frames scrolling forward showed', () => {
  const positions = Array.from({ length: 240 }, (_, step) => (step / 239) * TOTAL_SCROLL)
  const shared = createFrame()
  const render = (position: number): PathFrame => {
    const located = locate(position)
    return structuredClone(scoreFrame(located.index, located.seconds, DESKTOP_TIMING, shared))
  }
  const forward = positions.map(render)
  const backward = [...positions].reverse().map(render).reverse()
  expect(backward).toEqual(forward)
})

test('locate maps every scene start back to that scene', () => {
  SCENES.forEach((_, index) => {
    expect(locate(sceneStart(index))).toEqual({ index, seconds: 0, progress: 0 })
  })
  expect(sceneStart(SCENES.length - 1) + SCENES[SCENES.length - 1].scroll).toBeCloseTo(TOTAL_SCROLL)
})

test('every rest position sits inside its own scene', () => {
  SCENES.forEach((_, index) => {
    const rest = restPosition(index)
    expect(rest).toBeGreaterThanOrEqual(sceneStart(index))
    expect(locate(rest).index).toBe(index)
  })
})
