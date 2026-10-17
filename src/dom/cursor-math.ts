export interface Spring {
  position: number
  velocity: number
}

export type CursorMode = 'crosshair' | 'ring' | 'native'

export interface ReadoutPlacement {
  flipX: boolean
  flipY: boolean
}

export interface ReadoutBounds {
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
}

export const INTERACTIVE_SELECTOR =
  "a[href], button:not(:disabled), summary, label, select, [role='button'], [role='link'], [data-hotspot]"

export const TEXT_FIELD_SELECTOR =
  "input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='range']), textarea, [contenteditable]:not([contenteditable='false'])"

const SETTLED_POSITION_EPSILON = 0.05
const SETTLED_VELOCITY_EPSILON = 0.5
const READOUT_EDGE_GAP = 24

export function stepCriticallyDamped(state: Spring, target: number, omega: number, seconds: number): Spring {
  const offset = state.position - target
  const impulse = state.velocity + omega * offset
  const decay = Math.exp(-omega * seconds)
  return {
    position: target + (offset + impulse * seconds) * decay,
    velocity: (state.velocity - impulse * omega * seconds) * decay,
  }
}

export function isSettled(state: Spring, target: number): boolean {
  return (
    Math.abs(state.position - target) < SETTLED_POSITION_EPSILON &&
    Math.abs(state.velocity) < SETTLED_VELOCITY_EPSILON
  )
}

export function classifyTarget(element: Pick<Element, 'closest'> | null, pointingAtWorldHotspot: boolean): CursorMode {
  if (element?.closest(TEXT_FIELD_SELECTOR)) return 'native'
  if (pointingAtWorldHotspot || element?.closest(INTERACTIVE_SELECTOR)) return 'ring'
  return 'crosshair'
}

export function formatReadout(altitudeText: string | null | undefined): string {
  const trimmed = altitudeText?.trim() ?? ''
  return /^\d+$/.test(trimmed) ? `${trimmed} m` : ''
}

export function readoutPlacement(x: number, y: number, bounds: ReadoutBounds): ReadoutPlacement {
  return {
    flipX: x + READOUT_EDGE_GAP + bounds.width > bounds.viewportWidth,
    flipY: y + READOUT_EDGE_GAP + bounds.height > bounds.viewportHeight,
  }
}
