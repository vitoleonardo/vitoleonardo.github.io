import {
  AdditiveBlending,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three'
import { composeMatrix, cylinderBetween, instances, merge, place } from '../geometry'
import { createGlowTexture } from '../textures'
import type { FloorFactory, FrameState, Vec3 } from '../types'
import { brassMaterial, chapterIndex, clamp01, disposeTree, floorBase, palette, smoothstep, towerSpec, withSurfaceBreakup } from './kit'
import { paintedSteelMaterial, withinChapters } from './kit-upper'

const appCount = 20
const moduleRadii = [2.5, 3.2, 3.9, 4.6] as const
const spiralTurns = 1.15
const columnRadius = 0.11
const innerRadius = 0.16
const outerRadius = 1.65
const railHeight = 0.95
const storey = towerSpec.floorHeight
const rise = storey / (appCount + 1)
const treadThickness = 0.045
const treadOuterHalfWidth = 0.27
const treadInnerHalfWidth = 0.07
const globeRadius = 0.058
const filamentRadius = 0.022
const ringGlowWidth = 0.075
const dimAfterTeaching = 0.78
const revealLead = 0.7

const oakBreakup = { cellsPerMetre: 5, roughnessSwing: 0.12, albedoSwing: 0.12, verticalStretch: 1 }

function treadAngle(index: number): number {
  return (index / appCount) * spiralTurns * Math.PI * 2
}

function treadTop(index: number): number {
  return rise * (index + 1)
}

function polar(angle: number, radius: number, height: number): Vec3 {
  return [Math.cos(angle) * radius, height, -Math.sin(angle) * radius]
}

function outerPoint(index: number, height: number): Vec3 {
  return polar(treadAngle(index), outerRadius - 0.05, height)
}

function lightPosition(index: number): Vec3 {
  return outerPoint(index, treadTop(index) + railHeight + globeRadius * 0.8)
}

function treadShape(): Shape {
  return new Shape([
    new Vector2(innerRadius, -treadInnerHalfWidth),
    new Vector2(outerRadius, -treadOuterHalfWidth),
    new Vector2(outerRadius, treadOuterHalfWidth),
    new Vector2(innerRadius, treadInnerHalfWidth),
  ])
}

function treadGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const shape = treadShape()
  for (let index = 0; index < appCount; index += 1) {
    const slab = new ExtrudeGeometry(shape, { depth: treadThickness, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 })
    pieces.push(place(slab, [0, treadTop(index), 0], [Math.PI / 2, 0, 0]).rotateY(treadAngle(index)))
  }
  return merge(pieces)
}

function frameGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [
    cylinderBetween([0, 0, 0], [0, storey + 0.1, 0], columnRadius, 20),
    place(new CylinderGeometry(0.32, 0.34, 0.025, 28), [0, 0.0125, 0]),
    place(new CylinderGeometry(0.15, 0.13, 0.06, 20), [0, storey + 0.13, 0]),
  ]
  const handrail: Vector3[] = []
  const midrail: Vector3[] = []
  for (let index = 0; index < appCount; index += 1) {
    const top = treadTop(index)
    const angle = treadAngle(index)
    pieces.push(place(new CylinderGeometry(0.15, 0.15, rise - 0.012, 20), [0, top - treadThickness - (rise - 0.012) / 2, 0]))
    pieces.push(cylinderBetween(polar(angle, 0.14, top - treadThickness - 0.16), polar(angle, outerRadius - 0.25, top - treadThickness - 0.012), 0.02, 6))
    pieces.push(cylinderBetween(outerPoint(index, top), outerPoint(index, top + railHeight - 0.02), 0.016, 8))
    pieces.push(place(new CylinderGeometry(0.03, 0.03, 0.02, 12), outerPoint(index, top + 0.01)))
    handrail.push(new Vector3(...outerPoint(index, top + railHeight)))
    midrail.push(new Vector3(...outerPoint(index, top + railHeight * 0.5)))
  }
  pieces.push(new TubeGeometry(new CatmullRomCurve3(handrail), 180, 0.022, 8, false))
  pieces.push(new TubeGeometry(new CatmullRomCurve3(midrail), 180, 0.01, 6, false))
  return merge(pieces)
}

function lampHolderGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  for (let index = 0; index < appCount; index += 1) {
    const [x, y, z] = lightPosition(index)
    pieces.push(place(new CylinderGeometry(0.024, 0.03, 0.035, 14), [x, y - globeRadius - 0.01, z]))
  }
  return merge(pieces)
}

function ringGlowGeometry(): BufferGeometry {
  const ring = new RingGeometry(1 - ringGlowWidth, 1 + ringGlowWidth, 160, 2)
  const position = ring.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const radius = Math.hypot(position.getX(vertex), position.getY(vertex))
    const weight = Math.max(0, 1 - Math.abs(radius - 1) / ringGlowWidth)
    colors.set([weight, weight, weight], vertex * 3)
  }
  ring.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return place(ring, [0, 0, 0], [-Math.PI / 2, 0, 0])
}

export const createTeachingFloor: FloorFactory = () => {
  const root = new Group()
  root.name = 'teaching'
  root.position.y = floorBase.teaching

  const frame = new Mesh(
    frameGeometry(),
    paintedSteelMaterial({ paint: '#1F2A44', cellsPerMetre: 4, chipShare: 0.06, groundY: floorBase.teaching, grimeHeight: 0.25 }, { metalness: 0.3, roughness: 0.42 }),
  )
  frame.castShadow = true
  frame.receiveShadow = true
  const treads = new Mesh(treadGeometry(), withSurfaceBreakup(new MeshStandardMaterial({ color: '#7A5B3E', roughness: 0.55, metalness: 0 }), oakBreakup))
  treads.receiveShadow = true
  const holders = new Mesh(lampHolderGeometry(), brassMaterial())

  const warm = new Color(palette.warm)
  const signal = new Color(palette.signal)
  const lightMatrices = Array.from({ length: appCount }, (_, index) => composeMatrix(lightPosition(index)))
  const filaments = instances(new SphereGeometry(filamentRadius, 12, 8), new MeshBasicMaterial(), lightMatrices, lightMatrices.map(() => warm))
  const globeMaterial = new MeshBasicMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending })
  const globes = instances(new SphereGeometry(globeRadius, 20, 14), globeMaterial, lightMatrices, lightMatrices.map(() => warm))
  globes.renderOrder = 2

  const glow = createGlowTexture()
  const poolMaterial = new MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, blending: AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 })
  const pools = instances(
    new PlaneGeometry(1, 1),
    poolMaterial,
    Array.from({ length: appCount }, (_, index) => {
      const [x, , z] = outerPoint(index, 0)
      return composeMatrix([x * 0.86, treadTop(index) + 0.004, z * 0.86], [-Math.PI / 2, 0, 0], [0.95, 0.95, 1])
    }),
    lightMatrices.map(() => warm),
  )
  pools.renderOrder = 1

  const stripBase = place(new RingGeometry(1 - 0.012 / 4.6, 1 + 0.012 / 4.6, 160, 1), [0, 0, 0], [-Math.PI / 2, 0, 0])
  const strips = instances(
    stripBase,
    new MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: -2 }),
    moduleRadii.map((radius) => composeMatrix([0, 0.006, 0], [0, 0, 0], [radius, 1, radius])),
    moduleRadii.map(() => signal),
  )
  const ringGlowMaterial = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 })
  const ringGlows = instances(
    ringGlowGeometry(),
    ringGlowMaterial,
    moduleRadii.map((radius) => composeMatrix([0, 0.008, 0], [0, 0, 0], [radius, 1, radius])),
    moduleRadii.map(() => signal),
  )
  ringGlows.renderOrder = 1

  root.add(frame, treads, holders, filaments, globes, pools, strips, ringGlows)

  const closeDetails = [holders, filaments, pools]
  const scratch = new Color()

  function update(frame: FrameState): void {
    const progress = frame.progress.smooth
    const detailed = withinChapters(progress, chapterIndex.aiProducts + 0.5, chapterIndex.about + 0.6)
    for (const detail of closeDetails) detail.visible = detailed
    const reveal = smoothstep(chapterIndex.teaching - revealLead, chapterIndex.teaching - 0.02, progress)
    const standby = 1 - dimAfterTeaching * smoothstep(chapterIndex.teaching + 0.35, chapterIndex.about - 0.1, progress)
    for (let index = 0; index < appCount; index += 1) {
      const on = clamp01((reveal - index / appCount) * appCount) * standby
      filaments.setColorAt(index, scratch.copy(warm).multiplyScalar(0.06 + on * 2.4))
      globes.setColorAt(index, scratch.copy(warm).multiplyScalar(0.05 + on * 0.55))
      pools.setColorAt(index, scratch.copy(warm).multiplyScalar(on * 0.16))
    }
    moduleRadii.forEach((_, index) => {
      const on = clamp01((reveal - index / moduleRadii.length) * moduleRadii.length) * (0.4 + 0.6 * standby)
      strips.setColorAt(index, scratch.copy(signal).multiplyScalar(0.05 + on * 1.4))
      ringGlows.setColorAt(index, scratch.copy(signal).multiplyScalar(on * 0.32))
    })
    for (const mesh of [filaments, globes, pools, strips, ringGlows]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }

  function dispose(): void {
    disposeTree(root)
    glow.dispose()
  }

  return { id: 'teaching', root, proxies: [], update, dispose }
}
