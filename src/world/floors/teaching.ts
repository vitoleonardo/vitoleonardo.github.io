import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
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
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { block, composeMatrix, cylinderBetween, instances, merge, place, strut } from '../geometry'
import { createGlowTexture } from '../textures'
import type { FloorFactory, FrameState, Vec3 } from '../types'
import {
  brassMaterial,
  chapterIndex,
  clamp01,
  disposeTree,
  floorBase,
  glassMaterial,
  palette,
  smoothstep,
  towerSpec,
  withSurfaceBreakup,
} from './kit'
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
const ribbonSegments = 160
const nosingSegments = 10
const ledStripLength = 1.18

const oakBreakup = { cellsPerMetre: 5, roughnessSwing: 0.12, albedoSwing: 0.12, verticalStretch: 1 } as const

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
    cylinderBetween([0, 0, 0], [0, storey + 0.13, 0], columnRadius, 24),
    place(new CylinderGeometry(0.32, 0.34, 0.025, 28), [0, 0.0125, 0]),
  ]
  for (let index = 0; index < appCount; index += 1) {
    const top = treadTop(index)
    const angle = treadAngle(index)
    pieces.push(place(new CylinderGeometry(0.148, 0.148, rise - 0.028, 20), [0, top - treadThickness - (rise - 0.028) / 2, 0]))
    pieces.push(strut(polar(angle, 0.14, top - treadThickness - 0.11), polar(angle, outerRadius - 0.22, top - treadThickness - 0.008), 0.024))
    pieces.push(strut(polar(angle, 0.14, top - treadThickness - 0.18), polar(angle, outerRadius * 0.58, top - treadThickness - 0.01), 0.016))
  }
  return merge(pieces)
}

function brassGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [
    place(new TorusGeometry(0.33, 0.012, 8, 28), [0, 0.025, 0], [Math.PI / 2, 0, 0]),
    place(new CylinderGeometry(0.156, 0.156, 0.02, 20), [0, storey + 0.11, 0]),
  ]
  const halfArc = 0.162
  for (let index = 0; index < appCount; index += 1) {
    const top = treadTop(index)
    const angle = treadAngle(index)
    const [lx, ly, lz] = lightPosition(index)
    pieces.push(place(new CylinderGeometry(0.024, 0.03, 0.035, 14), [lx, ly - globeRadius - 0.01, lz]))
    pieces.push(place(new CylinderGeometry(0.156, 0.156, 0.02, 20), [0, top - treadThickness - 0.01, 0]))
    for (let seg = 0; seg < nosingSegments; seg += 1) {
      const a0 = angle - halfArc + (seg / nosingSegments) * halfArc * 2
      const a1 = angle - halfArc + ((seg + 1) / nosingSegments) * halfArc * 2
      const midAngle = (a0 + a1) / 2
      const chordLength = (outerRadius + 0.003) * (a1 - a0) + 0.002
      pieces.push(block([0.012, 0.032, chordLength], polar(midAngle, outerRadius + 0.003, top - treadThickness * 0.35), [0, midAngle, 0]))
    }
    if (index % 2 === 0) {
      pieces.push(place(new CylinderGeometry(0.022, 0.022, 0.036, 12), polar(angle, outerRadius - 0.05, top + 0.06), [0, angle, Math.PI / 2]))
    }
  }
  const handrail: Vector3[] = []
  const shoe: Vector3[] = []
  for (let step = 0; step < 40; step += 1) {
    const u = -0.25 + (step / 39) * (appCount + 0.2)
    const baseHeight = rise * (u + 1)
    handrail.push(new Vector3(...outerPoint(u, baseHeight + railHeight)))
    shoe.push(new Vector3(...outerPoint(u, baseHeight + 0.018)))
  }
  pieces.push(new TubeGeometry(new CatmullRomCurve3(handrail), ribbonSegments, 0.024, 10, false))
  pieces.push(new TubeGeometry(new CatmullRomCurve3(shoe), ribbonSegments, 0.015, 8, false))
  return merge(pieces)
}

function ribbonGeometry(): BufferGeometry {
  const vertexCount = (ribbonSegments + 1) * 2
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)
  const indices: number[] = []
  for (let step = 0; step <= ribbonSegments; step += 1) {
    const t = step / ribbonSegments
    const u = -0.25 + t * (appCount + 0.2)
    const angle = treadAngle(u)
    const baseHeight = rise * (u + 1)
    const bottom = outerPoint(u, baseHeight + 0.022)
    const top = outerPoint(u, baseHeight + railHeight - 0.018)
    const nx = Math.cos(angle)
    const nz = -Math.sin(angle)
    const baseVertex = step * 2
    positions.set(bottom, baseVertex * 3)
    positions.set(top, (baseVertex + 1) * 3)
    normals.set([nx, 0, nz], baseVertex * 3)
    normals.set([nx, 0, nz], (baseVertex + 1) * 3)
    uvs.set([t, 0], baseVertex * 2)
    uvs.set([t, 1], (baseVertex + 1) * 2)
    if (step < ribbonSegments) {
      indices.push(baseVertex, baseVertex + 2, baseVertex + 1, baseVertex + 1, baseVertex + 2, baseVertex + 3)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
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
    paintedSteelMaterial(
      { paint: '#2B2420', cellsPerMetre: 4, chipShare: 0.04, groundY: floorBase.teaching, grimeHeight: 0.2 },
      { metalness: 0.62, roughness: 0.38 },
    ),
  )
  frame.castShadow = true
  frame.receiveShadow = true
  const treads = new Mesh(treadGeometry(), withSurfaceBreakup(new MeshStandardMaterial({ color: '#7A5B3E', roughness: 0.55, metalness: 0 }), oakBreakup))
  treads.receiveShadow = true
  const brass = new Mesh(brassGeometry(), brassMaterial())
  brass.castShadow = true
  brass.receiveShadow = true
  const glassRibbon = new Mesh(ribbonGeometry(), glassMaterial(0.16))
  glassRibbon.renderOrder = 1

  const warm = new Color(palette.warm)
  const signal = new Color(palette.signal)
  const lightMatrices = Array.from({ length: appCount }, (_, index) => composeMatrix(lightPosition(index)))
  const filaments = instances(new SphereGeometry(filamentRadius, 12, 8), new MeshBasicMaterial(), lightMatrices, lightMatrices.map(() => warm))
  const globeMaterial = new MeshBasicMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending })
  const globes = instances(new SphereGeometry(globeRadius, 20, 14), globeMaterial, lightMatrices, lightMatrices.map(() => warm))
  globes.renderOrder = 2

  const treadLedMatrices = Array.from({ length: appCount }, (_, index) => {
    const angle = treadAngle(index) + 0.09
    return composeMatrix(polar(angle, 0.95, treadTop(index) - treadThickness - 0.004), [0, angle, 0])
  })
  const treadLeds = instances(new BoxGeometry(ledStripLength, 0.008, 0.014), new MeshBasicMaterial(), treadLedMatrices, treadLedMatrices.map(() => warm))

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

  root.add(frame, treads, brass, glassRibbon, treadLeds, filaments, globes, pools, strips, ringGlows)

  const closeDetails = [filaments, pools, treadLeds]
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
      treadLeds.setColorAt(index, scratch.copy(warm).multiplyScalar(0.04 + on * 1.85))
    }
    moduleRadii.forEach((_, index) => {
      const on = clamp01((reveal - index / moduleRadii.length) * moduleRadii.length) * (0.4 + 0.6 * standby)
      strips.setColorAt(index, scratch.copy(signal).multiplyScalar(0.05 + on * 1.4))
      ringGlows.setColorAt(index, scratch.copy(signal).multiplyScalar(on * 0.32))
    })
    for (const mesh of [filaments, globes, pools, treadLeds, strips, ringGlows]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }

  function dispose(): void {
    disposeTree(root)
    glow.dispose()
  }

  return { id: 'teaching', root, proxies: [], update, dispose }
}
