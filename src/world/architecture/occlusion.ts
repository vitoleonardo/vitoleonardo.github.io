import { Float32BufferAttribute, type BufferGeometry } from 'three'
import { towerSpec } from '../floors/kit'

export type Shade = (x: number, y: number, z: number, normalY: number) => number

export function bakeOcclusion(geometry: BufferGeometry, shade: Shade): BufferGeometry {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const colors = new Float32Array(position.count * 3)
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const value = Math.min(1, Math.max(0, shade(position.getX(vertex), position.getY(vertex), position.getZ(vertex), normal ? normal.getY(vertex) : 0)))
    colors[vertex * 3] = value
    colors[vertex * 3 + 1] = value
    colors[vertex * 3 + 2] = value
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

export function distanceOutsideTower(x: number, z: number): number {
  const wall = towerSpec.halfSize + towerSpec.wallThickness
  return Math.max(Math.abs(x) - wall, Math.abs(z) - wall, 0)
}

export function smooth(edgeStart: number, edgeEnd: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edgeStart) / (edgeEnd - edgeStart)))
  return t * t * (3 - 2 * t)
}

export function wallShade(reach: number, floor = 0.5): Shade {
  return (x, _y, z, normalY) => {
    const open = smooth(0, reach, distanceOutsideTower(x, z))
    const upward = 0.5 + 0.5 * Math.max(0, normalY)
    return floor + (1 - floor) * Math.max(open, upward * 0.6)
  }
}
