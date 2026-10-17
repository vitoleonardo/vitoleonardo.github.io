import { describe, expect, it } from 'vitest'
import { floorBaseMetres, formatAltitude } from './rail'

describe('formatAltitude', () => {
  it('rounds to whole metres', () => {
    expect(formatAltitude(27.4)).toBe('27')
    expect(formatAltitude(27.6)).toBe('28')
  })

  it('never shows a negative altitude', () => {
    expect(formatAltitude(-0.4)).toBe('0')
    expect(formatAltitude(-12)).toBe('0')
  })
})

describe('floorBaseMetres', () => {
  it('climbs four metres per floor through the stops', () => {
    const stops = ['stop-frontend', 'stop-backend', 'stop-cloud', 'stop-data', 'stop-ai-products', 'stop-ai-coding', 'stop-teaching', 'about']
    expect(stops.map(floorBaseMetres)).toEqual([0, 4, 8, 12, 16, 20, 24, 28])
  })

  it('falls back to street level for unknown chapters', () => {
    expect(floorBaseMetres('unknown')).toBe(0)
  })
})
