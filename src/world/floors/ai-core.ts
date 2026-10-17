import {
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three'
import { block, composeMatrix, cylinderBetween, instances, merge, place, projectWorldUVs } from '../geometry'
import type { FloorFactory, FrameState, Vec3 } from '../types'
import {
  aiCoreBreath,
  brassMaterial,
  breathing,
  chapterIndex,
  concreteMaterial,
  createEmitter,
  createHaloMaterial,
  disposeTree,
  floorBase,
  glassMaterial,
  nearChapter,
  palette,
  steelMaterial,
  towerSpec,
} from './kit'

const loopStages = ['retrieve', 'reason', 'act', 'evaluate'] as const
const coreCenter: Vec3 = [1.2, 1.9, 0.6]
const coreRadius = 0.4
const orbitRadius = 2.3
const orbitTilt = { x: 0.28, z: -0.12 } as const
const ringTurnsPerSecond = 0.035
const packetTurnsPerSecond = 0.2
const ceiling = towerSpec.floorHeight - towerSpec.slabThickness
const pedestal = { radius: 1.5, height: 0.3 } as const
const housing = { radius: 0.62, baseTop: 0.78, capBottom: 3.02, capTop: 3.3, ribs: 10 } as const
const coolingRings = [1.2, 2.6] as const
const coolingRadius = 0.86
const finsPerRing = 28
const coreDetailReach = 2.2

function housingSteelGeometry(): BufferGeometry {
  const [x, , z] = coreCenter
  const pieces: BufferGeometry[] = [
    place(new TorusGeometry(pedestal.radius, 0.04, 8, 64), [x, pedestal.height, z], [Math.PI / 2, 0, 0]),
    place(new CylinderGeometry(housing.radius + 0.16, housing.radius + 0.22, housing.baseTop - pedestal.height, 40), [x, (pedestal.height + housing.baseTop) / 2, z]),
    place(new CylinderGeometry(housing.radius + 0.12, housing.radius + 0.12, 0.05, 40), [x, housing.baseTop + 0.025, z]),
    place(new CylinderGeometry(housing.radius + 0.14, housing.radius + 0.1, housing.capTop - housing.capBottom, 40), [x, (housing.capBottom + housing.capTop) / 2, z]),
    place(new CylinderGeometry(0.22, 0.26, ceiling - housing.capTop, 20), [x, (housing.capTop + ceiling) / 2, z]),
    place(new CylinderGeometry(0.42, 0.42, 0.04, 24), [x, ceiling - 0.02, z]),
    block([0.5, 0.06, 2.2], [-3.75, 0.03, -5]),
    block([0.5, 0.06, 2.2], [6.55, 0.03, -5]),
  ]
  for (let rib = 0; rib < housing.ribs; rib += 1) {
    const angle = (rib / housing.ribs) * Math.PI * 2
    const ribX = x + Math.cos(angle) * (housing.radius + 0.03)
    const ribZ = z + Math.sin(angle) * (housing.radius + 0.03)
    pieces.push(block([0.035, housing.capBottom - housing.baseTop, 0.06], [ribX, (housing.baseTop + housing.capBottom) / 2, ribZ], [0, -angle, 0]))
  }
  for (let slot = 0; slot < 24; slot += 1) {
    const angle = (slot / 24) * Math.PI * 2
    const slotRadius = housing.radius + 0.195
    pieces.push(block([0.012, 0.22, 0.05], [x + Math.cos(angle) * slotRadius, (pedestal.height + housing.baseTop) / 2, z + Math.sin(angle) * slotRadius], [0, -angle, 0]))
  }
  for (const y of coolingRings) {
    for (let bracket = 0; bracket < 4; bracket += 1) {
      const angle = (bracket / 4) * Math.PI * 2 + Math.PI / 4
      pieces.push(cylinderBetween([x + Math.cos(angle) * housing.radius, y, z + Math.sin(angle) * housing.radius], [x + Math.cos(angle) * (coolingRadius - 0.04), y, z + Math.sin(angle) * (coolingRadius - 0.04)], 0.02, 6))
    }
  }
  return merge(pieces)
}

function coolingGeometry(): BufferGeometry {
  const [x, , z] = coreCenter
  const pieces: BufferGeometry[] = []
  for (const y of coolingRings) {
    pieces.push(place(new TorusGeometry(coolingRadius, 0.055, 12, 72), [x, y, z], [Math.PI / 2, 0, 0]))
    for (let fin = 0; fin < finsPerRing; fin += 1) {
      const angle = (fin / finsPerRing) * Math.PI * 2
      pieces.push(block([0.2, 0.15, 0.008], [x + Math.cos(angle) * coolingRadius, y, z + Math.sin(angle) * coolingRadius], [0, -angle, 0]))
    }
  }
  for (const angle of [0.6, 0.6 + Math.PI]) {
    const ringPoint = (y: number): Vec3 => [x + Math.cos(angle) * coolingRadius, y, z + Math.sin(angle) * coolingRadius]
    pieces.push(cylinderBetween(ringPoint(coolingRings[0]), ringPoint(coolingRings[1]), 0.03, 10))
    pieces.push(cylinderBetween(ringPoint(coolingRings[1]), [x + Math.cos(angle) * 0.6, housing.capBottom + 0.1, z + Math.sin(angle) * 0.6], 0.03, 10))
  }
  return merge(pieces)
}

function cableGeometry(): BufferGeometry {
  const [x, , z] = coreCenter
  const runs: Vec3[][] = []
  const floorRuns: readonly (readonly [number, Vec3])[] = [
    [2.6, [-3.6, 0.07, -5.6]],
    [2.9, [-3.6, 0.07, -4.4]],
    [-0.5, [6.4, 0.07, -5.8]],
    [-0.2, [6.4, 0.07, -4.2]],
  ]
  for (const [angle, end] of floorRuns) {
    const start: Vec3 = [x + Math.cos(angle) * (housing.radius + 0.2), 0.55, z + Math.sin(angle) * (housing.radius + 0.2)]
    const lip: Vec3 = [x + Math.cos(angle) * (pedestal.radius - 0.05), pedestal.height + 0.04, z + Math.sin(angle) * (pedestal.radius - 0.05)]
    const exit: Vec3 = [x + Math.cos(angle) * (pedestal.radius + 0.3), 0.035, z + Math.sin(angle) * (pedestal.radius + 0.3)]
    runs.push([start, lip, exit, [(exit[0] + end[0]) / 2, 0.035, (exit[2] + end[2]) / 2], end])
  }
  for (let drop = 0; drop < 4; drop += 1) {
    const angle = (drop / 4) * Math.PI * 2 + 0.4
    runs.push([
      [x + Math.cos(angle) * 0.36, ceiling, z + Math.sin(angle) * 0.36],
      [x + Math.cos(angle) * 0.62, housing.capTop + 0.12, z + Math.sin(angle) * 0.62],
      [x + Math.cos(angle) * 0.6, housing.capTop - 0.05, z + Math.sin(angle) * 0.6],
    ])
  }
  return merge(runs.map((points) => new TubeGeometry(new CatmullRomCurve3(points.map((point) => new Vector3(...point))), 48, 0.032, 8, false)))
}

export const createAiCoreFloor: FloorFactory = (context) => {
  const { textures } = context
  const root = new Group()
  root.name = 'ai-core'
  root.position.y = floorBase['ai-core']

  const plinth = new Mesh(
    projectWorldUVs(place(new CylinderGeometry(pedestal.radius, pedestal.radius + 0.1, pedestal.height, 48), [coreCenter[0], pedestal.height / 2, coreCenter[2]]), 2.4),
    concreteMaterial(textures),
  )
  plinth.receiveShadow = true
  const steel = new Mesh(housingSteelGeometry(), steelMaterial({ color: '#3A4048', metalness: 0.65, roughness: 0.38 }))
  steel.castShadow = true
  steel.receiveShadow = true
  const cooling = new Mesh(coolingGeometry(), brassMaterial({ color: '#B5794F', roughness: 0.3 }))
  cooling.castShadow = true
  const cables = new Mesh(cableGeometry(), new MeshStandardMaterial({ color: '#121418', roughness: 0.62, metalness: 0 }))
  cables.castShadow = true
  cables.receiveShadow = true
  const glass = new Mesh(
    place(new CylinderGeometry(housing.radius, housing.radius, housing.capBottom - housing.baseTop - 0.05, 48, 1, true), [coreCenter[0], (housing.baseTop + housing.capBottom) / 2, coreCenter[2]]),
    glassMaterial(0.14),
  )
  glass.renderOrder = 2

  const coreEmitter = createEmitter(palette.signal, 2.6)
  const core = new Mesh(new SphereGeometry(coreRadius, 40, 24), coreEmitter.material)
  core.position.set(...coreCenter)
  const innerEmitter = createEmitter('#B9C8FF', 3.2)
  const inner = new Mesh(new SphereGeometry(coreRadius * 0.55, 24, 16), innerEmitter.material)
  inner.position.copy(core.position)
  const haloMaterial = createHaloMaterial(palette.signal, 2.4)
  const halo = new Mesh(new SphereGeometry(housing.radius * 1.35, 32, 16), haloMaterial)
  halo.position.copy(core.position)
  halo.renderOrder = 3

  const orbit = new Group()
  orbit.position.copy(core.position)
  orbit.rotation.set(orbitTilt.x, 0, orbitTilt.z)
  const ringEmitter = createEmitter(palette.signal, 1.2)
  const ring = new Mesh(new TorusGeometry(orbitRadius, 0.022, 8, 180), ringEmitter.material)
  ring.rotation.x = Math.PI / 2
  const nodeEmitter = createEmitter(palette.readable, 1)
  const nodes = instances(
    new OctahedronGeometry(0.2, 0),
    nodeEmitter.material,
    loopStages.map(() => composeMatrix([orbitRadius, 0, 0])),
    loopStages.map(() => '#ffffff'),
  )
  nodes.frustumCulled = false
  const nodeCollars = instances(
    new BoxGeometry(0.06, 0.06, 0.34),
    steelMaterial({ color: '#2A2F36' }),
    loopStages.map(() => composeMatrix([orbitRadius, 0, 0])),
  )
  nodeCollars.frustumCulled = false
  const packetEmitter = createEmitter(palette.warm, 3)
  const packet = new Mesh(new SphereGeometry(0.075, 12, 8), packetEmitter.material)
  orbit.add(ring, nodes, packet)

  const detail = new Group()
  detail.add(cooling, cables, inner, glass)
  orbit.add(nodeCollars)
  root.add(plinth, steel, core, halo, orbit, detail)

  const nodeMatrix = new Matrix4()
  const collarMatrix = new Matrix4()
  const nodeRotation = new Quaternion()
  const collarRotation = new Quaternion()
  const nodePosition = new Vector3()
  const nodeScale = new Vector3()
  const unitScale = new Vector3(1, 1, 1)
  const yAxis = new Vector3(0, 1, 0)
  const nodeColor = new Color()
  let frozenTime = 0

  function update(frame: FrameState): void {
    detail.visible = nearChapter(frame.progress, chapterIndex.aiProducts, coreDetailReach)
    nodeCollars.visible = detail.visible
    const time = frame.reducedMotion ? frozenTime : frame.time
    frozenTime = time
    const ringAngle = time * ringTurnsPerSecond * Math.PI * 2
    const packetAngle = ringAngle + ((time * packetTurnsPerSecond) % 1) * Math.PI * 2
    loopStages.forEach((_, stage) => {
      const angle = ringAngle + (stage * Math.PI) / 2
      const separation = Math.atan2(Math.sin(packetAngle - angle), Math.cos(packetAngle - angle))
      const arrival = Math.exp(-((separation / 0.4) ** 2))
      nodePosition.set(Math.cos(angle) * orbitRadius, 0, -Math.sin(angle) * orbitRadius)
      nodeRotation.setFromAxisAngle(yAxis, angle + time * 0.6)
      nodeScale.setScalar(1 + arrival * 0.45)
      nodes.setMatrixAt(stage, nodeMatrix.compose(nodePosition, nodeRotation, nodeScale))
      nodes.setColorAt(stage, nodeColor.setScalar(0.8 + arrival * 2.2))
      collarRotation.setFromAxisAngle(yAxis, angle)
      nodeCollars.setMatrixAt(stage, collarMatrix.compose(nodePosition, collarRotation, unitScale))
    })
    nodes.instanceMatrix.needsUpdate = true
    nodeCollars.instanceMatrix.needsUpdate = true
    if (nodes.instanceColor) nodes.instanceColor.needsUpdate = true
    packet.position.set(Math.cos(packetAngle) * orbitRadius, 0, -Math.sin(packetAngle) * orbitRadius)

    const breath = frame.reducedMotion ? 1 : breathing(aiCoreBreath, frame.time)
    coreEmitter.set(2.6 * breath)
    innerEmitter.set(3.2 * breath)
    haloMaterial.uniforms.uIntensity.value = 0.42 * breath
  }

  function dispose(): void {
    disposeTree(root)
  }

  return { id: 'ai-core', root, proxies: [], update, dispose }
}
