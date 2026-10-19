import { describe, expect, it } from 'vitest'
import { leadingSource, readoutText } from './service-readout'

describe('leadingSource', () => {
  it('prefers the pointer over keyboard focus and a pinned service', () => {
    expect(leadingSource({ hovered: 'pi-hole', focused: 'immich', pinned: 'n8n' })).toBe('pi-hole')
    expect(leadingSource({ hovered: null, focused: 'immich', pinned: 'n8n' })).toBe('immich')
    expect(leadingSource({ hovered: null, focused: null, pinned: 'n8n' })).toBe('n8n')
  })

  it('reports nothing when no service is engaged', () => {
    expect(leadingSource({ hovered: null, focused: null, pinned: null })).toBeNull()
  })
})

describe('readoutText', () => {
  it('shows the note of the engaged service', () => {
    expect(readoutText('  Remote access ', 'Ubuntu Server')).toBe('Remote access')
  })

  it('falls back to the summary without a note', () => {
    expect(readoutText(null, 'Ubuntu Server')).toBe('Ubuntu Server')
    expect(readoutText('   ', 'Ubuntu Server')).toBe('Ubuntu Server')
  })
})
