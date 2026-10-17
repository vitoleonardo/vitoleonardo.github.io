import { CatmullRomCurve3, Color, Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, TubeGeometry, Vector3, type BufferGeometry } from 'three'
import { block, composeMatrix, cylinderBetween, instances, merge, place } from '../geometry'
import type { FloorFactory, FrameState } from '../types'
import { chapterIndex, chapterReveal, clamp01, disposeTree, floorBase, palette, steelMaterial, towerSpec } from './kit'

const appCount = 20
const moduleRadii = [2.5, 3.2, 3.9, 4.6] as const
const spiralTurns = 1.15
const innerRadius = 0.2
const outerRadius = 1.65
const railHeight = 0.95
const storey = towerSpec.floorHeight
const rise = storey / (appCount + 1)

function treadAngle(index: number): number {
  return (index / appCount) * spiralTurns * Math.PI * 2
}

function treadTop(index: number): number {
  return rise * (index + 1)
}

function outerPoint(index: number, height: number): [number, number, number] {
  const angle = treadAngle(index)
  return [Math.cos(angle) * outerRadius, height, -Math.sin(angle) * outerRadius]
}

function stairGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [cylinderBetween([0, 0, 0], [0, storey, 0], 0.11, 16)]
  const treadLength = outerRadius - innerRadius + 0.1
  const railPoints: Vector3[] = []
  for (let index = 0; index < appCount; index += 1) {
    const top = treadTop(index)
    const tread = block([treadLength, 0.05, 0.46], [innerRadius + treadLength / 2, 0, 0])
    pieces.push(place(tread, [0, top - 0.025, 0], [0, treadAngle(index), 0]))
    pieces.push(cylinderBetween(outerPoint(index, top), outerPoint(index, top + railHeight - 0.04), 0.018, 6))
    railPoints.push(new Vector3(...outerPoint(index, top + railHeight)))
  }
  pieces.push(new TubeGeometry(new CatmullRomCurve3(railPoints), 160, 0.025, 6, false))
  return merge(pieces)
}

export const createTeachingFloor: FloorFactory = () => {
  const root = new Group()
  root.name = 'teaching'
  root.position.y = floorBase.teaching

  const stair = new Mesh(stairGeometry(), steelMaterial())
  stair.castShadow = true

  const warm = new Color(palette.warm)
  const signal = new Color(palette.signal)
  const lights = instances(
    new SphereGeometry(0.065, 12, 8),
    new MeshBasicMaterial(),
    Array.from({ length: appCount }, (_, index) => composeMatrix(outerPoint(index, treadTop(index) + railHeight + 0.06))),
    Array.from({ length: appCount }, () => warm.clone().multiplyScalar(0.08)),
  )

  const ringBase = place(new RingGeometry(0.985, 1, 128, 1), [0, 0, 0], [-Math.PI / 2, 0, 0])
  const rings = instances(
    ringBase,
    new MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: -1 }),
    moduleRadii.map((radius, index) => composeMatrix([0, 0.012 + index * 0.002, 0], [0, 0, 0], [radius, 1, radius])),
    moduleRadii.map(() => signal.clone().multiplyScalar(0.06)),
  )

  root.add(stair, lights, rings)

  const scratch = new Color()

  function update(frame: FrameState): void {
    const reveal = chapterReveal(frame.progress, chapterIndex.teaching)
    for (let index = 0; index < appCount; index += 1) {
      const on = clamp01((reveal - index / appCount) * appCount)
      lights.setColorAt(index, scratch.copy(warm).multiplyScalar(0.08 + on * 2.6))
    }
    moduleRadii.forEach((_, index) => {
      const on = clamp01((reveal - index / moduleRadii.length) * moduleRadii.length)
      rings.setColorAt(index, scratch.copy(signal).multiplyScalar(0.06 + on * 1.7))
    })
    if (lights.instanceColor) lights.instanceColor.needsUpdate = true
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true
  }

  function dispose(): void {
    disposeTree(root)
  }

  return { id: 'teaching', root, proxies: [], update, dispose }
}
