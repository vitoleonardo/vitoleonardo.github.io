import {
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PointLight,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three'
import { composeMatrix, cylinderBetween, instances, merge, place, projectWorldUVs } from '../geometry'
import type { FloorFactory, FrameState, Vec3 } from '../types'
import {
  concreteMaterial,
  createEmitter,
  createHaloMaterial,
  disposeTree,
  floorBase,
  palette,
  steelMaterial,
  towerSpec,
} from './kit'

const loopStages = ['retrieve', 'reason', 'act', 'evaluate'] as const
const coreCenter: Vec3 = [1.2, 1.9, 0.6]
const coreRadius = 0.55
const orbitRadius = 2.3
const orbitTilt = { x: 0.28, z: -0.12 } as const
const ringTurnsPerSecond = 0.035
const packetTurnsPerSecond = 0.2
const ceiling = towerSpec.floorHeight - towerSpec.slabThickness

function pedestalSteelGeometry(): BufferGeometry {
  const [x, y, z] = coreCenter
  const pieces: BufferGeometry[] = [place(new TorusGeometry(1.5, 0.04, 8, 64), [x, 0.3, z], [Math.PI / 2, 0, 0])]
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    pieces.push(cylinderBetween([x + dx * 1.1, ceiling, z + dz * 1.1], [x + dx * 0.3, y + 0.5, z + dz * 0.3], 0.045, 8))
    pieces.push(cylinderBetween([x + dx * 1.2, 0.3, z + dz * 1.2], [x + dx * 0.32, y - 0.5, z + dz * 0.32], 0.035, 8))
  }
  return merge(pieces)
}

export const createAiCoreFloor: FloorFactory = (context) => {
  const { textures } = context
  const root = new Group()
  root.name = 'ai-core'
  root.position.y = floorBase['ai-core']

  const pedestal = new Mesh(
    projectWorldUVs(place(new CylinderGeometry(1.5, 1.6, 0.3, 40), [coreCenter[0], 0.15, coreCenter[2]]), 2.4),
    concreteMaterial(textures),
  )
  pedestal.receiveShadow = true
  const pedestalSteel = new Mesh(pedestalSteelGeometry(), steelMaterial())

  const coreEmitter = createEmitter(palette.signal, 2.6)
  const core = new Mesh(new IcosahedronGeometry(coreRadius, 4), coreEmitter.material)
  core.position.set(...coreCenter)
  const lattice = new Mesh(
    new IcosahedronGeometry(coreRadius * 1.55, 1),
    new MeshBasicMaterial({ color: palette.signal, wireframe: true, transparent: true, opacity: 0.55 }),
  )
  lattice.position.copy(core.position)
  const haloMaterial = createHaloMaterial(palette.signal, 2.4)
  const halo = new Mesh(new SphereGeometry(coreRadius * 2.4, 32, 16), haloMaterial)
  halo.position.copy(core.position)

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
  const packetEmitter = createEmitter(palette.warm, 3)
  const packet = new Mesh(new SphereGeometry(0.075, 12, 8), packetEmitter.material)
  orbit.add(ring, nodes, packet)

  const coreLight = new PointLight(palette.signal, 6, 10, 2)
  coreLight.position.copy(core.position)

  root.add(pedestal, pedestalSteel, core, lattice, halo, orbit, coreLight)

  const nodeMatrix = new Matrix4()
  const nodeRotation = new Quaternion()
  const nodePosition = new Vector3()
  const nodeScale = new Vector3()
  const yAxis = new Vector3(0, 1, 0)
  const nodeColor = new Color()
  let frozenTime = 0

  function update(frame: FrameState): void {
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
    })
    nodes.instanceMatrix.needsUpdate = true
    if (nodes.instanceColor) nodes.instanceColor.needsUpdate = true
    packet.position.set(Math.cos(packetAngle) * orbitRadius, 0, -Math.sin(packetAngle) * orbitRadius)

    const breath = frame.reducedMotion ? 0 : Math.sin(time * 1.3) * 0.5 + 0.5
    core.scale.setScalar(1 + breath * 0.04)
    lattice.rotation.y = time * 0.12
    lattice.rotation.x = time * 0.05
    haloMaterial.uniforms.uIntensity.value = 0.55 + breath * 0.2
    coreLight.intensity = 5 + breath * 1.5
  }

  function dispose(): void {
    disposeTree(root)
  }

  return { id: 'ai-core', root, proxies: [], update, dispose }
}
