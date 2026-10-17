import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three'
import { block, blockBetween, composeMatrix, instances, merge, strut } from '../geometry'
import type { FloorFactory, FrameState, InteractiveProxy, Vec3 } from '../types'
import { approach, beatEnvelope, createProxy, disposeTree, emphasisOf, floorBase, palette, steelMaterial } from './kit'

const serviceCount = 10
const deckArea = { minX: 2.4, maxX: 6.8, minZ: 0.4, maxZ: 6.8 } as const
const plankWidth = 0.14
const plankGap = 0.012
const deckHeight = 0.1
const poleHeight = 2.7
const poles: readonly Vec3[] = [[2.5, poleHeight, 0.5], [6.7, poleHeight, 0.5], [6.7, poleHeight, 6.7], [2.5, poleHeight, 6.7]]
const strands: readonly (readonly [number, number])[] = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]]
const strandSag = 0.45
const bulbSpacing = 0.45
const cableSegments = 24
const rack = { x: 1.2, z: -3.5, width: 0.62, height: 1.5, depth: 0.8 } as const
const rackFront = rack.z + rack.depth / 2
const unitPitch = 0.12
const portrait = { x: -0.6, y: 1.25, z: -3.1, width: 0.82, height: 0.7 } as const
const holeHalf = 1.8

function unitY(unit: number): number {
  return 0.3 + unit * unitPitch
}

function strandPoint(from: Vec3, to: Vec3, t: number): Vector3 {
  return new Vector3(
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t - strandSag * 4 * t * (1 - t),
    from[2] + (to[2] - from[2]) * t,
  )
}

function bulbPositions(): Vector3[] {
  const bulbs: Vector3[] = []
  for (const [start, end] of strands) {
    const from = poles[start]
    const to = poles[end]
    const length = Math.hypot(to[0] - from[0], to[2] - from[2])
    const count = Math.max(2, Math.round(length / bulbSpacing))
    for (let bulb = 1; bulb < count; bulb += 1) {
      const point = strandPoint(from, to, bulb / count)
      point.y -= 0.06
      bulbs.push(point)
    }
  }
  return bulbs
}

function cableGeometry(): BufferGeometry {
  const vertices: number[] = []
  for (const [start, end] of strands) {
    for (let segment = 0; segment < cableSegments; segment += 1) {
      const a = strandPoint(poles[start], poles[end], segment / cableSegments)
      const b = strandPoint(poles[start], poles[end], (segment + 1) / cableSegments)
      vertices.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  return geometry
}

function woodGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  for (let z = deckArea.minZ; z + plankWidth <= deckArea.maxZ; z += plankWidth + plankGap) {
    pieces.push(blockBetween([deckArea.minX, 0, z], [deckArea.maxX, deckHeight, z + plankWidth]))
  }
  pieces.push(block([1.2, 0.05, 0.7], [4.3, deckHeight + 0.36, 3.4]))
  pieces.push(block([portrait.width + 0.1, portrait.height + 0.1, 0.05], [portrait.x, portrait.y, portrait.z - 0.02]))
  return merge(pieces)
}

function fabricGeometry(): BufferGeometry {
  const seat = deckHeight
  return merge([
    blockBetween([2.9, seat, 0.9], [6.4, seat + 0.32, 1.7]),
    blockBetween([5.6, seat, 1.7], [6.4, seat + 0.32, 5]),
    blockBetween([2.9, seat + 0.32, 0.9], [6.4, seat + 0.72, 1.1]),
    blockBetween([6.2, seat + 0.32, 1.1], [6.4, seat + 0.72, 5]),
    block([0.5, 0.14, 0.62], [3.4, seat + 0.39, 1.4]),
    block([0.5, 0.14, 0.62], [4.2, seat + 0.39, 1.4]),
    block([0.62, 0.14, 0.5], [5.95, seat + 0.39, 3.3]),
  ])
}

function steelGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = poles.map(([x, , z]) => strut([x, deckHeight, z], [x, poleHeight + 0.1, z], 0.06))
  for (const [dx, dz] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]] as const) {
    pieces.push(block([0.04, 0.34, 0.04], [4.3 + dx, deckHeight + 0.17, 3.4 + dz]))
  }
  pieces.push(block([rack.width, rack.height, rack.depth], [rack.x, rack.height / 2 + 0.08, rack.z]))
  pieces.push(block([rack.width + 0.1, 0.08, rack.depth + 0.1], [rack.x, 0.04, rack.z]))
  pieces.push(strut([portrait.x - 0.35, 0, portrait.z + 0.25], [portrait.x - 0.3, portrait.y + 0.4, portrait.z - 0.02], 0.035))
  pieces.push(strut([portrait.x + 0.35, 0, portrait.z + 0.25], [portrait.x + 0.3, portrait.y + 0.4, portrait.z - 0.02], 0.035))
  pieces.push(strut([portrait.x, 0, portrait.z - 0.5], [portrait.x, portrait.y + 0.3, portrait.z - 0.05], 0.035))
  pieces.push(block([portrait.width + 0.2, 0.04, 0.12], [portrait.x, portrait.y - portrait.height / 2 - 0.07, portrait.z + 0.02]))
  for (const [from, to] of [
    [[-holeHalf, -holeHalf], [holeHalf, -holeHalf]],
    [[-holeHalf, -holeHalf], [-holeHalf, holeHalf]],
    [[-holeHalf, holeHalf], [holeHalf, holeHalf]],
  ] as const) {
    for (const y of [0.5, 1]) pieces.push(strut([from[0], y, from[1]], [to[0], y, to[1]], 0.04))
    for (let t = 0; t <= 1; t += 0.25) {
      const x = from[0] + (to[0] - from[0]) * t
      const z = from[1] + (to[1] - from[1]) * t
      pieces.push(block([0.04, 1, 0.04], [x, 0.5, z]))
    }
  }
  return merge(pieces)
}

function unitFaceGeometry(): BufferGeometry {
  return merge(
    Array.from({ length: serviceCount }, (_, unit) =>
      block([rack.width - 0.06, unitPitch - 0.02, 0.02], [rack.x, unitY(unit), rackFront + 0.01]),
    ),
  )
}

export const createLoungeFloor: FloorFactory = (context) => {
  const { textures } = context
  const root = new Group()
  root.name = 'lounge'
  root.position.y = floorBase.lounge

  const wood = new Mesh(woodGeometry(), new MeshStandardMaterial({ color: '#4B3A2A', roughness: 0.72, metalness: 0 }))
  wood.receiveShadow = true
  wood.castShadow = true
  const fabric = new Mesh(fabricGeometry(), new MeshStandardMaterial({ color: '#30343C', roughness: 0.95, metalness: 0 }))
  fabric.castShadow = true
  fabric.receiveShadow = true
  const steel = new Mesh(steelGeometry(), steelMaterial())
  steel.castShadow = true
  const unitFaces = new Mesh(unitFaceGeometry(), new MeshStandardMaterial({ color: '#22262D', roughness: 0.5, metalness: 0.4 }))

  const cables = new LineSegments(cableGeometry(), new LineBasicMaterial({ color: '#0D0F13' }))
  const bulbPlan = bulbPositions()
  const warm = new Color(palette.warm)
  const bulbs = instances(
    new SphereGeometry(0.035, 8, 6),
    new MeshBasicMaterial(),
    bulbPlan.map((position) => composeMatrix([position.x, position.y, position.z])),
    bulbPlan.map(() => warm),
  )

  const idleLed = new Color(palette.signal)
  const hoverLed = new Color(palette.warm)
  const ledColor = new Color()
  const leds = instances(
    new BoxGeometry(0.035, 0.035, 0.012),
    new MeshBasicMaterial(),
    Array.from({ length: serviceCount }, (_, unit) => composeMatrix([rack.x + rack.width / 2 - 0.08, unitY(unit), rackFront + 0.025])),
    Array.from({ length: serviceCount }, () => idleLed),
  )
  const ledEmphasis = new Array<number>(serviceCount).fill(0)
  const ledTarget = new Array<number>(serviceCount).fill(0)
  const proxies: InteractiveProxy[] = Array.from({ length: serviceCount }, (_, unit) =>
    createProxy({
      id: `lounge-service-${unit}`,
      chapters: ['about'],
      geometry: new BoxGeometry(rack.width + 0.02, unitPitch - 0.005, 0.3),
      position: [rack.x, unitY(unit), rackFront + 0.05],
      onState(state) {
        ledTarget[unit] = emphasisOf(state)
      },
    }),
  )

  const picture = new Mesh(
    new PlaneGeometry(portrait.width, portrait.height),
    new MeshStandardMaterial({ map: textures.portrait, emissiveMap: textures.portrait, emissive: '#ffffff', emissiveIntensity: 0.12, roughness: 0.55 }),
  )
  picture.position.set(portrait.x, portrait.y, portrait.z + 0.01)

  root.add(wood, fabric, steel, unitFaces, cables, bulbs, leds, picture, ...proxies.map((proxy) => proxy.object))

  const bulbColor = new Color()

  function update(frame: FrameState): void {
    const { world, reducedMotion, time, dt } = frame
    const base = 0.4 + world.practicals * 1
    bulbPlan.forEach((_, index) => {
      const beat = reducedMotion ? 0 : beatEnvelope(time - index * 0.008)
      bulbs.setColorAt(index, bulbColor.copy(warm).multiplyScalar(base * (1 + world.pulse * 1.2 * beat)))
    })
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true

    for (let unit = 0; unit < serviceCount; unit += 1) {
      ledEmphasis[unit] = reducedMotion ? ledTarget[unit] : approach(ledEmphasis[unit], ledTarget[unit], 12, dt)
      const heartbeat = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 1.4 + unit * 0.9)
      ledColor.copy(idleLed).lerp(hoverLed, ledEmphasis[unit]).multiplyScalar(0.9 + heartbeat * 0.6 + ledEmphasis[unit] * 2.4)
      leds.setColorAt(unit, ledColor)
    }
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true
  }

  function dispose(): void {
    disposeTree(root)
  }

  return { id: 'lounge', root, proxies, update, dispose }
}
