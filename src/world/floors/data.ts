import { CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, RingGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from 'three'
import { block, cylinderBetween, merge, place, projectWorldUVs, tintVertices } from '../geometry'
import type { FloorFactory, FrameState, Vec3 } from '../types'
import {
  chapterIndex,
  concreteMaterial,
  createEmitter,
  createFlowMaterial,
  createHaloMaterial,
  dataAlarmBreath,
  disposeTree,
  floorBase,
  glassMaterial,
  nearChapter,
  palette,
  patchSurface,
  steelMaterial,
  towerSpec,
} from './kit'

interface SourcePipe {
  label: 'Deliverect' | 'Lieferando' | 'Uber' | 'Wolt'
  segments: readonly (readonly [Vec3, Vec3])[]
}

interface PipeSpan {
  from: Vec3
  to: Vec3
  startDistance: number
  glass: boolean
}

const tankCenter: Vec3 = [1.4, 0, 0.6]
const tankRadius = 2.1
const tankBottom = 0.24
const tankHeight = 2
const tankTop = tankBottom + tankHeight
const domeRise = 0.58
const pipeY = 1.7
const pipeRadius = 0.16
const coreRadius = 0.06
const flangeRadius = pipeRadius + 0.07
const sightGlassLength = 0.9
const half = towerSpec.halfSize
const ceiling = towerSpec.floorHeight - towerSpec.slabThickness
const uberRunX = -2.5
const uberJoinZ = -0.9
const woltDropZ = 5
const catwalk = { y: tankTop - 0.04, inner: tankRadius + 0.06, outer: tankRadius + 0.58, railHeight: 0.9, posts: 14 } as const
const ladderAngle = -0.75
const handwheelRed = '#8E2A22'
const fittingGrey = '#B8BEC6'

const sources: readonly SourcePipe[] = [
  { label: 'Deliverect', segments: [[[-half, pipeY, tankCenter[2]], [tankCenter[0] - tankRadius, pipeY, tankCenter[2]]]] },
  { label: 'Lieferando', segments: [[[half, pipeY, tankCenter[2]], [tankCenter[0] + tankRadius, pipeY, tankCenter[2]]]] },
  {
    label: 'Uber',
    segments: [
      [[uberRunX, pipeY, -half], [uberRunX, pipeY, uberJoinZ]],
      [[uberRunX, pipeY, uberJoinZ], [tankCenter[0] - Math.sqrt(tankRadius ** 2 - (tankCenter[2] - uberJoinZ) ** 2), pipeY, uberJoinZ]],
    ],
  },
  {
    label: 'Wolt',
    segments: [
      [[tankCenter[0], ceiling, woltDropZ], [tankCenter[0], pipeY, woltDropZ]],
      [[tankCenter[0], pipeY, woltDropZ], [tankCenter[0], pipeY, tankCenter[2] + tankRadius]],
    ],
  },
]

function segmentLength([from, to]: readonly [Vec3, Vec3]): number {
  return Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
}

function lerpPoint(from: Vec3, to: Vec3, t: number): Vec3 {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]
}

function pipeSpans(): PipeSpan[] {
  const spans: PipeSpan[] = []
  for (const source of sources) {
    let travelled = 0
    for (const segment of source.segments) {
      const [from, to] = segment
      const length = segmentLength(segment)
      if (length < sightGlassLength + 0.8) {
        spans.push({ from, to, startDistance: travelled, glass: false })
      } else {
        const glassStart = (length - sightGlassLength) / 2 / length
        const glassEnd = 1 - glassStart
        spans.push({ from, to: lerpPoint(from, to, glassStart), startDistance: travelled, glass: false })
        spans.push({ from: lerpPoint(from, to, glassStart), to: lerpPoint(from, to, glassEnd), startDistance: travelled + length * glassStart, glass: true })
        spans.push({ from: lerpPoint(from, to, glassEnd), to, startDistance: travelled + length * glassEnd, glass: false })
      }
      travelled += length
    }
  }
  return spans
}

function axisPoint(point: Vec3, direction: Vec3, distance: number): Vec3 {
  return [point[0] + direction[0] * distance, point[1] + direction[1] * distance, point[2] + direction[2] * distance]
}

function unit(from: Vec3, to: Vec3): Vec3 {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length, (to[2] - from[2]) / length]
}

function flangePair(centre: Vec3, direction: Vec3): BufferGeometry[] {
  const pieces: BufferGeometry[] = []
  for (const offset of [-0.022, 0.022]) {
    const middle = axisPoint(centre, direction, offset)
    pieces.push(cylinderBetween(axisPoint(middle, direction, -0.018), axisPoint(middle, direction, 0.018), flangeRadius, 20))
  }
  const side: Vec3 = Math.abs(direction[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  const other: Vec3 = [
    direction[1] * side[2] - direction[2] * side[1],
    direction[2] * side[0] - direction[0] * side[2],
    direction[0] * side[1] - direction[1] * side[0],
  ]
  for (let bolt = 0; bolt < 8; bolt += 1) {
    const angle = (bolt / 8) * Math.PI * 2
    const radial = flangeRadius - 0.035
    const offset: Vec3 = [
      (side[0] * Math.cos(angle) + other[0] * Math.sin(angle)) * radial,
      (side[1] * Math.cos(angle) + other[1] * Math.sin(angle)) * radial,
      (side[2] * Math.cos(angle) + other[2] * Math.sin(angle)) * radial,
    ]
    const boltCentre: Vec3 = [centre[0] + offset[0], centre[1] + offset[1], centre[2] + offset[2]]
    pieces.push(cylinderBetween(axisPoint(boltCentre, direction, -0.06), axisPoint(boltCentre, direction, 0.06), 0.011, 6))
  }
  return pieces
}

function pipeSteelGeometry(spans: readonly PipeSpan[]): BufferGeometry {
  const pieces: BufferGeometry[] = []
  for (const span of spans) {
    if (!span.glass) pieces.push(cylinderBetween(span.from, span.to, pipeRadius, 20))
  }
  for (const source of sources) {
    for (const segment of source.segments) {
      const [from, to] = segment
      if (from[1] !== pipeY || to[1] !== pipeY) continue
      const length = segmentLength(segment)
      for (let distance = 1.2; distance < length - 0.6; distance += 2) {
        const [x, , z] = lerpPoint(from, to, distance / length)
        const across = Math.abs(to[0] - from[0]) > Math.abs(to[2] - from[2]) ? 'z' : 'x'
        const saddleTop = pipeY - pipeRadius
        pieces.push(block([0.3, 0.02, 0.3], [x, 0.01, z]))
        pieces.push(block([0.07, saddleTop - 0.06, 0.07], [x, (saddleTop - 0.06) / 2 + 0.02, z]))
        pieces.push(block(across === 'z' ? [0.12, 0.05, 0.42] : [0.42, 0.05, 0.12], [x, saddleTop - 0.035, z]))
        pieces.push(place(new TorusGeometry(pipeRadius + 0.012, 0.009, 6, 16, Math.PI), [x, pipeY, z], [0, across === 'z' ? Math.PI / 2 : 0, 0]))
      }
    }
  }
  const wolt = sources[3].segments[0]
  pieces.push(cylinderBetween([wolt[0][0], ceiling - 0.08, wolt[0][2]], [wolt[0][0], ceiling, wolt[0][2]], pipeRadius + 0.1, 20))
  for (const source of sources) {
    for (const [joint] of source.segments.slice(1)) pieces.push(place(new SphereGeometry(pipeRadius + 0.012, 18, 12), joint))
  }
  return merge(pieces)
}

function fittingGeometry(spans: readonly PipeSpan[]): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const grey = (geometry: BufferGeometry) => pieces.push(tintVertices(geometry, fittingGrey))
  for (const span of spans) {
    if (!span.glass) continue
    const direction = unit(span.from, span.to)
    for (const end of [span.from, span.to]) for (const piece of flangePair(end, direction)) grey(piece)
  }
  for (const source of sources) {
    const [, nozzle] = source.segments[source.segments.length - 1]
    const [from] = source.segments[source.segments.length - 1]
    const direction = unit(from, nozzle)
    for (const piece of flangePair(axisPoint(nozzle, direction, -0.12), direction)) grey(piece)
    const valveCentre = axisPoint(nozzle, direction, -0.55)
    grey(cylinderBetween(axisPoint(valveCentre, direction, -0.16), axisPoint(valveCentre, direction, 0.16), pipeRadius + 0.05, 18))
    for (const piece of flangePair(axisPoint(valveCentre, direction, -0.19), direction)) grey(piece)
    for (const piece of flangePair(axisPoint(valveCentre, direction, 0.19), direction)) grey(piece)
    const bonnetTop: Vec3 = [valveCentre[0], valveCentre[1] + 0.42, valveCentre[2]]
    grey(cylinderBetween(valveCentre, [valveCentre[0], valveCentre[1] + 0.3, valveCentre[2]], 0.07, 12))
    grey(cylinderBetween([valveCentre[0], valveCentre[1] + 0.3, valveCentre[2]], bonnetTop, 0.014, 8))
    pieces.push(tintVertices(place(new TorusGeometry(0.15, 0.016, 8, 32), bonnetTop, [Math.PI / 2, 0, 0]), handwheelRed))
    for (let spoke = 0; spoke < 3; spoke += 1) {
      const angle = (spoke / 3) * Math.PI * 2
      pieces.push(tintVertices(cylinderBetween(bonnetTop, [bonnetTop[0] + Math.cos(angle) * 0.15, bonnetTop[1], bonnetTop[2] + Math.sin(angle) * 0.15], 0.009, 6), handwheelRed))
    }
    pieces.push(tintVertices(place(new CylinderGeometry(0.03, 0.03, 0.04, 10), bonnetTop), handwheelRed))
  }
  return merge(pieces)
}

function remapFlowUVs(geometry: BufferGeometry, startDistance: number, length: number): BufferGeometry {
  const uv = geometry.getAttribute('uv')
  for (let index = 0; index < uv.count; index += 1) uv.setY(index, startDistance + uv.getY(index) * length)
  return geometry
}

function glassGeometry(spans: readonly PipeSpan[], radius: number, radialSegments: number, flowUVs: boolean): BufferGeometry {
  return merge(
    spans
      .filter((span) => span.glass)
      .map((span) => {
        const tube = cylinderBetween(span.from, span.to, radius, radialSegments, true)
        return flowUVs ? remapFlowUVs(tube, span.startDistance, segmentLength([span.from, span.to])) : tube
      }),
  )
}

function tankGeometry(): BufferGeometry {
  const [x, , z] = tankCenter
  const pieces: BufferGeometry[] = [
    place(new CylinderGeometry(tankRadius, tankRadius, tankHeight, 64, 1, true), [x, tankBottom + tankHeight / 2, z]),
    place(new SphereGeometry(tankRadius, 64, 12, 0, Math.PI * 2, 0, Math.PI / 2), [x, tankTop, z], [0, 0, 0], [1, domeRise / tankRadius, 1]),
    place(new CylinderGeometry(0.16, 0.18, 0.12, 20), [x, tankTop + domeRise + 0.02, z]),
    place(new TorusGeometry(tankRadius + 0.012, 0.03, 6, 72), [x, tankTop - 0.02, z], [Math.PI / 2, 0, 0]),
    place(new TorusGeometry(tankRadius + 0.02, 0.028, 6, 72), [x, tankBottom + 0.04, z], [Math.PI / 2, 0, 0]),
  ]
  const courses = [tankBottom, tankBottom + 0.7, tankBottom + 1.4, tankTop]
  for (let course = 1; course < courses.length - 1; course += 1) {
    pieces.push(place(new TorusGeometry(tankRadius + 0.004, 0.009, 4, 96), [x, courses[course], z], [Math.PI / 2, 0, 0]))
  }
  for (let course = 0; course < courses.length - 1; course += 1) {
    for (let seam = 0; seam < 5; seam += 1) {
      const angle = (seam / 5) * Math.PI * 2 + course * 0.63
      const seamX = x + Math.cos(angle) * (tankRadius + 0.004)
      const seamZ = z + Math.sin(angle) * (tankRadius + 0.004)
      pieces.push(block([0.016, courses[course + 1] - courses[course], 0.016], [seamX, (courses[course] + courses[course + 1]) / 2, seamZ], [0, -angle, 0]))
    }
  }
  for (let chair = 0; chair < 10; chair += 1) {
    const angle = (chair / 10) * Math.PI * 2
    pieces.push(block([0.1, 0.22, 0.12], [x + Math.cos(angle) * (tankRadius + 0.05), tankBottom + 0.11, z + Math.sin(angle) * (tankRadius + 0.05)], [0, -angle, 0]))
  }
  const manwayAngle = 0.95
  const manway: Vec3 = [x + Math.cos(manwayAngle) * tankRadius, tankBottom + 0.62, z + Math.sin(manwayAngle) * tankRadius]
  const outward: Vec3 = [Math.cos(manwayAngle), 0, Math.sin(manwayAngle)]
  pieces.push(cylinderBetween(axisPoint(manway, outward, -0.02), axisPoint(manway, outward, 0.12), 0.27, 28))
  pieces.push(cylinderBetween(axisPoint(manway, outward, 0.12), axisPoint(manway, outward, 0.16), 0.31, 28))
  for (let bolt = 0; bolt < 16; bolt += 1) {
    const angle = (bolt / 16) * Math.PI * 2
    const boltCentre: Vec3 = [manway[0] - Math.sin(manwayAngle) * Math.cos(angle) * 0.27, manway[1] + Math.sin(angle) * 0.27, manway[2] + Math.cos(manwayAngle) * Math.cos(angle) * 0.27]
    pieces.push(cylinderBetween(axisPoint(boltCentre, outward, 0.15), axisPoint(boltCentre, outward, 0.19), 0.012, 6))
  }
  const ladderX = x + Math.cos(ladderAngle) * (tankRadius + 0.16)
  const ladderZ = z - Math.sin(ladderAngle) * (tankRadius + 0.16)
  for (const offset of [-0.2, 0.2]) {
    pieces.push(block([0.04, catwalk.y + catwalk.railHeight, 0.04], [ladderX + offset * Math.sin(ladderAngle), (catwalk.y + catwalk.railHeight) / 2, ladderZ + offset * Math.cos(ladderAngle)]))
  }
  for (let rung = 0.3; rung < catwalk.y; rung += 0.28) {
    pieces.push(block([0.4, 0.025, 0.025], [ladderX, rung, ladderZ], [0, ladderAngle - Math.PI / 2, 0]))
  }
  for (let post = 0; post < catwalk.posts; post += 1) {
    const angle = (post / catwalk.posts) * Math.PI * 2
    const postX = x + Math.cos(angle) * (catwalk.outer - 0.03)
    const postZ = z + Math.sin(angle) * (catwalk.outer - 0.03)
    pieces.push(block([0.035, catwalk.railHeight, 0.035], [postX, catwalk.y + catwalk.railHeight / 2, postZ]))
    pieces.push(cylinderBetween([x + Math.cos(angle) * tankRadius, catwalk.y - 0.35, z + Math.sin(angle) * tankRadius], [postX, catwalk.y - 0.03, postZ], 0.016, 6))
  }
  for (const height of [catwalk.railHeight, catwalk.railHeight / 2]) {
    pieces.push(place(new TorusGeometry(catwalk.outer - 0.03, 0.016, 6, 96), [x, catwalk.y + height, z], [Math.PI / 2, 0, 0]))
  }
  pieces.push(place(new CylinderGeometry(catwalk.outer, catwalk.outer, 0.1, 96, 1, true), [x, catwalk.y + 0.03, z]))
  pieces.push(place(new CylinderGeometry(catwalk.outer, catwalk.outer, 0.04, 96, 1, true), [x, catwalk.y - 0.02, z]))
  const alarmBase: Vec3 = [x, tankTop + domeRise + 0.08, z]
  pieces.push(place(new CylinderGeometry(0.1, 0.12, 0.06, 20), [alarmBase[0], alarmBase[1] + 0.03, alarmBase[2]]))
  for (let arch = 0; arch < 3; arch += 1) {
    pieces.push(place(new TorusGeometry(0.105, 0.006, 4, 24, Math.PI), [alarmBase[0], alarmBase[1] + 0.06, alarmBase[2]], [0, (arch / 3) * Math.PI, 0]))
  }
  return merge(pieces)
}

function gratingMaterial(): MeshStandardMaterial {
  return patchSurface(new MeshStandardMaterial({ color: '#8B9197', metalness: 0.7, roughness: 0.45, side: DoubleSide }), {
    key: 'bar-grating',
    albedo: `
      vec2 gratingPosition = vSurfacePosition.xz;
      float gratingPixel = max( fwidth( gratingPosition.x ), fwidth( gratingPosition.y ) );
      float bearing = abs( fract( gratingPosition.x / 0.032 ) - 0.5 ) * 0.032;
      float cross = abs( fract( gratingPosition.y / 0.1 ) - 0.5 ) * 0.1;
      float bar = max( 1.0 - smoothstep( 0.003, 0.003 + gratingPixel, bearing ), 1.0 - smoothstep( 0.0025, 0.0025 + gratingPixel, cross ) );
      float gratingVisible = 1.0 - smoothstep( 0.008, 0.02, gratingPixel );
      float gap = ( 1.0 - bar ) * gratingVisible;
      diffuseColor.rgb *= mix( 1.0, 0.12, gap ) * mix( 1.0, 0.55, 1.0 - gratingVisible );
    `,
    roughness: `
      roughnessFactor = mix( roughnessFactor, 0.9, gap );
    `,
  })
}

function catwalkDeckGeometry(): BufferGeometry {
  const [x, , z] = tankCenter
  return merge([
    place(new RingGeometry(catwalk.inner, catwalk.outer, 96, 1), [x, catwalk.y, z], [-Math.PI / 2, 0, 0]),
    place(new RingGeometry(catwalk.inner, catwalk.outer, 96, 1), [x, catwalk.y - 0.025, z], [Math.PI / 2, 0, 0]),
  ])
}

function alarmPulse(time: number): number {
  return 0.5 + 0.5 * Math.sin((time / dataAlarmBreath.period) * Math.PI * 2)
}

export const createDataFloor: FloorFactory = (context) => {
  const { textures } = context
  const root = new Group()
  root.name = 'data'
  root.position.y = floorBase.data

  const plinth = new Mesh(
    projectWorldUVs(place(new CylinderGeometry(tankRadius + 0.4, tankRadius + 0.5, tankBottom, 64), [tankCenter[0], tankBottom / 2, tankCenter[2]]), 2.4),
    concreteMaterial(textures),
  )
  plinth.receiveShadow = true
  const spans = pipeSpans()
  const steel = new Mesh(merge([tankGeometry(), pipeSteelGeometry(spans)]), steelMaterial({ color: '#56606B', metalness: 0.45, roughness: 0.44 }))
  steel.castShadow = true
  steel.receiveShadow = true
  const deck = new Mesh(catwalkDeckGeometry(), gratingMaterial())
  deck.receiveShadow = true
  const fittings = new Mesh(fittingGeometry(spans), new MeshStandardMaterial({ vertexColors: true, metalness: 0.65, roughness: 0.38 }))
  fittings.castShadow = true
  const glass = new Mesh(glassGeometry(spans, pipeRadius, 24, false), glassMaterial(0.24))
  const flowMaterial = createFlowMaterial(palette.signal, 0.9, 1.1)
  const flow = new Mesh(glassGeometry(spans, coreRadius, 10, true), flowMaterial)

  const alarmY = tankTop + domeRise + 0.14
  const alarmEmitter = createEmitter(palette.fusion, 1)
  const alarm = new Mesh(new SphereGeometry(0.085, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), alarmEmitter.material)
  alarm.position.set(tankCenter[0], alarmY, tankCenter[2])
  const haloMaterial = createHaloMaterial(palette.fusion, 2.4)
  const halo = new Mesh(new SphereGeometry(0.32, 20, 12), haloMaterial)
  halo.position.copy(alarm.position)

  const detail = new Group()
  detail.add(deck, fittings)
  root.add(plinth, steel, glass, flow, alarm, halo, detail)

  let frozenTime = 0

  function update(frame: FrameState): void {
    detail.visible = nearChapter(frame.progress, chapterIndex.data)
    const time = frame.reducedMotion ? frozenTime : frame.time
    frozenTime = time
    flowMaterial.uniforms.uTime.value = time
    flowMaterial.uniforms.uIntensity.value = 1.1 + frame.world.practicals * 0.6
    const pulse = frame.reducedMotion ? 0.6 : alarmPulse(frame.time)
    alarmEmitter.set(0.9 + pulse * 1.9)
    haloMaterial.uniforms.uIntensity.value = 0.28 + pulse * 0.32
  }

  function dispose(): void {
    disposeTree(root)
  }

  return { id: 'data', root, proxies: [], update, dispose }
}
