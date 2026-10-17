import { CylinderGeometry, Group, Mesh, SphereGeometry, TorusGeometry, type BufferGeometry } from 'three'
import { block, cylinderBetween, merge, place, projectWorldUVs, scaleUVs, strut } from '../geometry'
import type { FloorFactory, FrameState, Vec3 } from '../types'
import {
  concreteMaterial,
  createEmitter,
  createFlowMaterial,
  createHaloMaterial,
  disposeTree,
  floorBase,
  glassMaterial,
  palette,
  steelMaterial,
  towerSpec,
} from './kit'

interface SourcePipe {
  label: 'Deliverect' | 'Lieferando' | 'Uber' | 'Wolt'
  segments: readonly (readonly [Vec3, Vec3])[]
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
const half = towerSpec.halfSize
const ceiling = towerSpec.floorHeight - towerSpec.slabThickness
const alarmPeriod = 2.8
const uberRunX = -2.5
const uberJoinZ = -0.9
const woltDropZ = 5

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

function tankGeometry(): BufferGeometry {
  const [x, , z] = tankCenter
  const pieces: BufferGeometry[] = [
    place(new CylinderGeometry(tankRadius, tankRadius, tankHeight, 48), [x, tankBottom + tankHeight / 2, z]),
    place(new SphereGeometry(tankRadius, 48, 10, 0, Math.PI * 2, 0, Math.PI / 2), [x, tankTop, z], [0, 0, 0], [1, domeRise / tankRadius, 1]),
    place(new CylinderGeometry(0.14, 0.14, 0.1, 16), [x, tankTop + domeRise + 0.04, z]),
  ]
  for (const y of [0.55, 1.1, 2.1]) {
    pieces.push(place(new TorusGeometry(tankRadius + 0.01, 0.035, 6, 64), [x, y, z], [Math.PI / 2, 0, 0]))
  }
  const ladderAngle = -0.75
  const ladderX = x + Math.cos(ladderAngle) * (tankRadius + 0.12)
  const ladderZ = z - Math.sin(ladderAngle) * (tankRadius + 0.12)
  for (const offset of [-0.2, 0.2]) {
    pieces.push(block([0.04, tankTop, 0.04], [ladderX + offset * Math.sin(ladderAngle), tankTop / 2, ladderZ + offset * Math.cos(ladderAngle)]))
  }
  for (let rung = 0.3; rung < tankTop; rung += 0.3) {
    pieces.push(block([0.4, 0.03, 0.03], [ladderX, rung, ladderZ], [0, ladderAngle - Math.PI / 2, 0]))
  }
  for (const source of sources) {
    for (const segment of source.segments) {
      const [from, to] = segment
      pieces.push(cylinderBetween(from, lerpPoint(from, to, 0.08 / segmentLength(segment)), pipeRadius + 0.08, 16))
      pieces.push(cylinderBetween(lerpPoint(from, to, 1 - 0.08 / segmentLength(segment)), to, pipeRadius + 0.08, 16))
      if (from[1] === pipeY && to[1] === pipeY) {
        const length = segmentLength(segment)
        for (let distance = 1.2; distance < length - 0.6; distance += 2) {
          const point = lerpPoint(from, to, distance / length)
          pieces.push(strut([point[0], 0, point[2]], [point[0], pipeY - pipeRadius, point[2]], 0.06))
          pieces.push(block([0.4, 0.05, 0.4], [point[0], pipeY - pipeRadius - 0.03, point[2]]))
        }
      }
    }
  }
  for (const source of sources) {
    for (const [joint] of source.segments.slice(1)) {
      pieces.push(place(new SphereGeometry(pipeRadius + 0.03, 16, 10), joint))
    }
  }
  return merge(pieces)
}

function pipeGeometry(radius: number, radialSegments: number, scaleByLength: boolean): BufferGeometry {
  const pieces: BufferGeometry[] = []
  for (const source of sources) {
    for (const segment of source.segments) {
      const tube = cylinderBetween(segment[0], segment[1], radius, radialSegments, true)
      pieces.push(scaleByLength ? scaleUVs(tube, 1, segmentLength(segment)) : tube)
    }
  }
  return merge(pieces)
}

function alarmFlash(time: number): number {
  const phase = (time % alarmPeriod) / alarmPeriod
  const first = Math.exp(-(((phase - 0.04) / 0.035) ** 2))
  const second = Math.exp(-(((phase - 0.16) / 0.035) ** 2))
  return Math.max(first, second)
}

export const createDataFloor: FloorFactory = (context) => {
  const { textures } = context
  const root = new Group()
  root.name = 'data'
  root.position.y = floorBase.data

  const plinth = new Mesh(
    projectWorldUVs(place(new CylinderGeometry(tankRadius + 0.4, tankRadius + 0.5, tankBottom, 48), [tankCenter[0], tankBottom / 2, tankCenter[2]]), 2.4),
    concreteMaterial(textures),
  )
  plinth.receiveShadow = true
  const tank = new Mesh(tankGeometry(), steelMaterial({ color: '#4A525D', metalness: 0.5, roughness: 0.42 }))
  tank.castShadow = true
  tank.receiveShadow = true
  const pipes = new Mesh(pipeGeometry(pipeRadius, 18, false), glassMaterial(0.2))
  const flowMaterial = createFlowMaterial(palette.signal, 0.9, 1.1)
  const flow = new Mesh(pipeGeometry(coreRadius, 8, true), flowMaterial)

  const alarmY = tankTop + domeRise + 0.1
  const alarmEmitter = createEmitter(palette.fusion, 1)
  const alarm = new Mesh(new SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), alarmEmitter.material)
  alarm.position.set(tankCenter[0], alarmY, tankCenter[2])
  const haloMaterial = createHaloMaterial(palette.fusion, 2.2)
  const halo = new Mesh(new SphereGeometry(0.45, 20, 12), haloMaterial)
  halo.position.copy(alarm.position)

  root.add(plinth, tank, pipes, flow, alarm, halo)

  let frozenTime = 0

  function update(frame: FrameState): void {
    const time = frame.reducedMotion ? frozenTime : frame.time
    frozenTime = time
    flowMaterial.uniforms.uTime.value = time
    flowMaterial.uniforms.uIntensity.value = 1.3 + frame.world.practicals * 0.8
    const flash = frame.reducedMotion ? 0.45 : alarmFlash(time)
    alarmEmitter.set(0.35 + flash * 3.2)
    haloMaterial.uniforms.uIntensity.value = 0.2 + flash
  }

  function dispose(): void {
    disposeTree(root)
  }

  return { id: 'data', root, proxies: [], update, dispose }
}
