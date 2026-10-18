import { describe, expect, test } from 'vitest'
import { towerSpec } from '../floors/kit'
import { frontCut, helixHalfSize, terracePieces, topTerrace } from './helix'
import { defaultLook, lookIds, readLook } from './look'

const wall = towerSpec.halfSize + towerSpec.wallThickness
const epsilon = 1e-6

describe('look selection', () => {
  test('reads a known look from the query string', () => {
    for (const look of lookIds) expect(readLook(`?look=${look}`)).toBe(look)
  })

  test('falls back to the default look for unknown or missing values', () => {
    expect(readLook('')).toBe(defaultLook)
    expect(readLook('?look=z')).toBe(defaultLook)
    expect(readLook('?lang=de')).toBe(defaultLook)
  })
})

describe('helix terraces', () => {
  test('every terrace contains the tower footprint', () => {
    for (let level = 1; level <= topTerrace; level += 1) {
      const angle = (level * 3.5 * Math.PI) / 180
      expect(helixHalfSize(level)).toBeGreaterThan(wall * (Math.cos(angle) + Math.sin(angle)))
    }
  })

  test('terraces stay behind the front cutaway and outside the interior', () => {
    for (let level = 1; level <= topTerrace; level += 1) {
      for (const polygon of terracePieces(level)) {
        expect(polygon.length).toBeGreaterThanOrEqual(3)
        for (const [x, z] of polygon) {
          expect(z).toBeLessThanOrEqual(frontCut + epsilon)
          const outside = Math.abs(x) >= wall - epsilon || z <= -wall + epsilon
          expect(outside).toBe(true)
        }
      }
    }
  })

  test('nothing overhangs the launch deck or the rocket column', () => {
    for (let level = 5; level <= topTerrace; level += 1) {
      for (const polygon of terracePieces(level)) {
        for (const [x] of polygon) expect(x).toBeLessThanOrEqual(wall + epsilon)
      }
    }
  })
})
