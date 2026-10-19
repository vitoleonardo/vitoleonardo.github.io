import { Vector3 } from 'three'
import { describe, expect, test } from 'vitest'
import { breathe, calmLight, createAreaEmitter, withinChapters } from './kit-upper'

function sampleBreath(periodSeconds: number, amplitude: number): number[] {
  return Array.from({ length: 2000 }, (_, index) => breathe(index * 0.01, periodSeconds, amplitude))
}

function lambertFormFactor(corners: readonly Vector3[], position: Vector3, normal: Vector3): number {
  const directions = corners.map((corner) => corner.clone().sub(position).normalize())
  const sum = directions.reduce((total, from, index) => {
    const to = directions[(index + 1) % directions.length]
    const angle = Math.acos(Math.min(0.9999, Math.max(-0.9999, from.dot(to))))
    return total + angle * new Vector3().crossVectors(from, to).normalize().dot(normal)
  }, 0)
  return Math.max(sum / (2 * Math.PI), 0)
}

describe('calm light', () => {
  test.each([0.05, 0.2, 0.5, 1])('a breath asked for depth %s never swings more than the limit', (amplitude) => {
    const samples = sampleBreath(4, amplitude)
    const brightest = Math.max(...samples)
    const darkest = Math.min(...samples)
    expect((brightest - darkest) / brightest).toBeLessThanOrEqual(calmLight.maxSwing + 1e-9)
  })

  test('a breath faster than the minimum period is slowed to it', () => {
    const period = calmLight.minPeriodSeconds
    for (const time of [0.3, 1.7, 2.9]) {
      expect(breathe(time, 0.5, 0.1)).toBeCloseTo(breathe(time + period, 0.5, 0.1), 9)
      expect(breathe(time, 0.5, 0.1)).not.toBeCloseTo(breathe(time + 0.5, 0.5, 0.1), 3)
    }
  })

  test('chapter windows include their bounds', () => {
    expect(withinChapters(7.5, 7.5, 9.75)).toBe(true)
    expect(withinChapters(9.75, 7.5, 9.75)).toBe(true)
    expect(withinChapters(9.8, 7.5, 9.75)).toBe(false)
  })
})

describe('area emitter', () => {
  const emitter = createAreaEmitter({ centre: [2, 4, -5], width: 7, height: 6, yaw: 0 })
  const corners = emitter.uniforms.uAreaCorners.value

  test('spans the requested rectangle', () => {
    const xs = corners.map((corner) => corner.x)
    const ys = corners.map((corner) => corner.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(7)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(6)
    expect(corners.every((corner) => corner.z === -5)).toBe(true)
  })

  test('lights receivers in front of the wall and nothing behind it', () => {
    const up = new Vector3(0, 1, 0)
    expect(lambertFormFactor(corners, new Vector3(2, 0, -4), up)).toBeGreaterThan(0.1)
    expect(lambertFormFactor(corners, new Vector3(2, 0, -6), up)).toBe(0)
    expect(lambertFormFactor(corners, new Vector3(2, 4, -4), new Vector3(0, 0, -1))).toBeGreaterThan(0.8)
    expect(lambertFormFactor(corners, new Vector3(2, 4, -4), new Vector3(0, 0, 1))).toBe(0)
  })

  test('starts dark until the wall is powered', () => {
    expect(emitter.radiance.r + emitter.radiance.g + emitter.radiance.b).toBe(0)
  })
})
