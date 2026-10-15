import { SUN_REST } from './figures/shapes'
import type { PathFrame } from './types'

export function createFrame(): PathFrame {
  return {
    from: 'hero',
    to: 'hero',
    morph: 0,
    heroGrow: 0,
    sun: { x: SUN_REST.x, y: SUN_REST.y, scale: 1, squashX: 1, squashY: 1, opacity: 1 },
    inkStart: -1,
    inkEnd: -1,
    night: 0,
    shadow: 1,
    ripple: 1,
    pulse: 1,
    strands: 0,
    nodes: 0,
    rocket: 0,
  }
}

export function copyFrame(target: PathFrame, source: PathFrame): void {
  const sun = target.sun
  Object.assign(target, source)
  target.sun = Object.assign(sun, source.sun)
}

export function sameFrame(a: PathFrame, b: PathFrame): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    a.morph === b.morph &&
    a.heroGrow === b.heroGrow &&
    a.inkStart === b.inkStart &&
    a.inkEnd === b.inkEnd &&
    a.night === b.night &&
    a.shadow === b.shadow &&
    a.ripple === b.ripple &&
    a.pulse === b.pulse &&
    a.strands === b.strands &&
    a.nodes === b.nodes &&
    a.rocket === b.rocket &&
    a.sun.x === b.sun.x &&
    a.sun.y === b.sun.y &&
    a.sun.scale === b.sun.scale &&
    a.sun.squashX === b.sun.squashX &&
    a.sun.squashY === b.sun.squashY &&
    a.sun.opacity === b.sun.opacity
  )
}
