import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  Shape,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three'
import { block, blockBetween, composeMatrix, createRandom, instances, merge, place, projectWorldUVs, strut } from '../geometry'
import type { FloorFactory, FrameState, InteractiveProxy, Vec3 } from '../types'
import {
  approach,
  concreteMaterial,
  createBeamMaterial,
  createEmitter,
  createProxy,
  disposeTree,
  emphasisOf,
  floorBase,
  palette,
  smoothstep,
  steelMaterial,
  towerSpec,
} from './kit'

const deck = { minX: towerSpec.halfSize + towerSpec.wallThickness, maxX: 15, halfDepth: 4 } as const
const kerbHeight = 0.15
const padTop = 0.3
const rocketBase: Vec3 = [11, padTop, 0]
const launchTower = { x: 13.4, z: -2.2, half: 0.55, top: 11, bay: 1.35 } as const
const maxLift = 34
const puffCount = 28
const flareSeconds = 2.4
const flameCoreLength = 2.6
const plumeLength = 4.6

interface Puff {
  angle: number
  reach: number
  rise: number
  size: number
}

function deckConcreteGeometry(): BufferGeometry {
  const { minX, maxX, halfDepth } = deck
  return projectWorldUVs(
    merge([
      blockBetween([minX, -towerSpec.slabThickness, -halfDepth], [maxX, 0, halfDepth]),
      blockBetween([maxX - 0.15, 0, -halfDepth], [maxX, kerbHeight, halfDepth]),
      blockBetween([minX, 0, -halfDepth], [maxX - 0.15, kerbHeight, -halfDepth + 0.15]),
      blockBetween([minX, 0, halfDepth - 0.15], [maxX - 0.15, kerbHeight, halfDepth]),
      place(new CylinderGeometry(1.5, 1.6, padTop, 40), [rocketBase[0], padTop / 2, rocketBase[2]]),
    ]),
    2.4,
  )
}

function launchTowerGeometry(): BufferGeometry[] {
  const { x, z, half, top, bay } = launchTower
  const corners: readonly (readonly [number, number])[] = [[-half, -half], [half, -half], [half, half], [-half, half]]
  const pieces: BufferGeometry[] = corners.map(([dx, dz]) => block([0.1, top - padTop, 0.1], [x + dx, (top + padTop) / 2, z + dz]))
  for (let y = padTop; y < top - 0.1; y += bay) {
    const next = Math.min(top, y + bay)
    corners.forEach(([dx, dz], corner) => {
      const [nx, nz] = corners[(corner + 1) % corners.length]
      pieces.push(strut([x + dx, next, z + dz], [x + nx, next, z + nz], 0.06))
      pieces.push(strut([x + dx, y, z + dz], [x + nx, next, z + nz], 0.04))
    })
  }
  pieces.push(block([1.6, 0.08, 1.6], [x, top, z]))
  for (const y of [5.5, 8]) {
    pieces.push(strut([x - half, y, z + half], [rocketBase[0] + 0.5, y, rocketBase[2] - 0.35], 0.16))
    pieces.push(block([0.5, 0.06, 0.6], [rocketBase[0] + 0.62, y - 0.08, rocketBase[2] - 0.45]))
  }
  return pieces
}

function deckSteelGeometry(): BufferGeometry {
  const { minX, maxX, halfDepth } = deck
  const pieces: BufferGeometry[] = []
  for (const side of [-1, 1]) {
    const z = side * (halfDepth - 0.6)
    pieces.push(block([maxX - minX - 0.2, 0.5, 0.25], [(minX + maxX) / 2, -0.6, z]))
    pieces.push(strut([minX + 0.1, -4.2, z], [12.5, -0.85, z], 0.22))
    pieces.push(block([0.1, 4.2, 0.6], [minX + 0.05, -2.3, z]))
    const railZ = side * (halfDepth - 0.05)
    for (let x = minX + 1; x <= maxX; x += 1.1) pieces.push(block([0.05, 1.1, 0.05], [x, kerbHeight + 0.55, railZ]))
    for (const y of [0.7, 1.25]) pieces.push(strut([minX, kerbHeight + y, railZ], [maxX - 0.05, kerbHeight + y, railZ], 0.045))
  }
  for (const x of [10, 13]) pieces.push(block([0.25, 0.4, halfDepth * 2 - 1], [x, -0.55, 0]))
  for (let z = -halfDepth; z <= halfDepth; z += 1) pieces.push(block([0.05, 1.1, 0.05], [maxX - 0.05, kerbHeight + 0.55, z]))
  for (const y of [0.7, 1.25]) pieces.push(strut([maxX - 0.05, kerbHeight + y, -halfDepth], [maxX - 0.05, kerbHeight + y, halfDepth], 0.045))
  for (const [dx, dz] of [[0.55, 0], [-0.55, 0], [0, 0.55], [0, -0.55]] as const) {
    pieces.push(block([0.18, 0.3, 0.18], [rocketBase[0] + dx, padTop + 0.15, rocketBase[2] + dz]))
  }
  return merge([...pieces, ...launchTowerGeometry()])
}

function rocketBodyGeometry(): BufferGeometry {
  const profile = [
    [0, 0.85], [0.3, 0.85], [0.42, 1], [0.42, 6.3], [0.41, 6.7], [0.36, 7.3],
    [0.26, 7.95], [0.14, 8.45], [0.04, 8.8], [0, 8.9],
  ].map(([radius, height]) => new Vector2(radius, height))
  return new LatheGeometry(profile, 40)
}

function rocketTrimGeometry(): BufferGeometry {
  const fin = new Shape([new Vector2(0.4, 0.15), new Vector2(1.2, -0.05), new Vector2(1.2, 0.55), new Vector2(0.4, 2.7)])
  const pieces: BufferGeometry[] = [new CylinderGeometry(0.22, 0.34, 0.8, 24, 1, true).translate(0, 0.45, 0)]
  for (let index = 0; index < 4; index += 1) {
    const finGeometry = new ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03)
    pieces.push(place(finGeometry, [0, 0, 0], [0, (index * Math.PI) / 2 + Math.PI / 4, 0]))
  }
  for (const y of [1.05, 3.7, 6.3]) pieces.push(place(new TorusGeometry(0.425, 0.03, 6, 40), [0, y, 0], [Math.PI / 2, 0, 0]))
  return merge(pieces)
}

function flameGeometry(radius: number, length: number): BufferGeometry {
  return place(new ConeGeometry(radius, length, 20, 1, true), [0, -length / 2, 0], [Math.PI, 0, 0])
}

export const createRocketFloor: FloorFactory = (context) => {
  const { textures } = context
  const root = new Group()
  root.name = 'rocket'
  root.position.y = floorBase.rocket

  const deckConcrete = new Mesh(deckConcreteGeometry(), concreteMaterial(textures))
  deckConcrete.castShadow = true
  deckConcrete.receiveShadow = true
  const deckSteel = new Mesh(deckSteelGeometry(), steelMaterial())
  deckSteel.castShadow = true

  const rocket = new Group()
  rocket.position.set(...rocketBase)
  const bodyMaterial = new MeshStandardMaterial({ color: '#C9C5BB', metalness: 0.55, roughness: 0.32, emissive: palette.warm, emissiveIntensity: 0 })
  const body = new Mesh(rocketBodyGeometry(), bodyMaterial)
  const trim = new Mesh(rocketTrimGeometry(), steelMaterial({ color: '#22252B' }))
  body.castShadow = true
  trim.castShadow = true

  const flame = new Group()
  flame.position.y = 0.05
  const coreMaterial = createBeamMaterial(palette.warm, false, 1.2)
  const plumeMaterial = createBeamMaterial(palette.fusion, false, 1.8)
  flame.add(new Mesh(flameGeometry(0.3, flameCoreLength), coreMaterial), new Mesh(flameGeometry(0.55, plumeLength), plumeMaterial))
  const exhaust = new PointLight('#FF6A3D', 0, 24, 2)
  exhaust.position.y = -0.6

  let launchTarget = 0
  let launchEmphasis = 0
  let flarePending = false
  let flareStart = Number.NEGATIVE_INFINITY
  const proxy: InteractiveProxy = createProxy({
    id: 'rocket-launch',
    chapters: ['stop-ai-coding'],
    geometry: new CylinderGeometry(1, 1, 9.4, 12),
    position: [0, 4.6, 0],
    onState(state) {
      launchTarget = emphasisOf(state)
      if (state === 'active') flarePending = true
    },
  })
  rocket.add(body, trim, flame, exhaust, proxy.object)

  const random = createRandom(2203)
  const puffs: Puff[] = Array.from({ length: puffCount }, () => ({
    angle: random() * Math.PI * 2,
    reach: random(),
    rise: random(),
    size: random(),
  }))
  const smokeMaterial = new MeshLambertMaterial({ color: '#5C6069', transparent: true, opacity: 0.5, depthWrite: false })
  const smoke = instances(new IcosahedronGeometry(1, 1), smokeMaterial, puffs.map(() => composeMatrix(rocketBase, [0, 0, 0], [0, 0, 0])))
  smoke.frustumCulled = false

  const deckLightPositions: Vec3[] = []
  for (let z = -3.5; z <= 3.5; z += 1.75) deckLightPositions.push([deck.maxX - 0.08, kerbHeight + 0.03, z])
  for (let x = 8.5; x < 14.5; x += 1.8) {
    deckLightPositions.push([x, kerbHeight + 0.03, -deck.halfDepth + 0.08], [x, kerbHeight + 0.03, deck.halfDepth - 0.08])
  }
  const deckLightEmitter = createEmitter(palette.warm, 1.4)
  const deckLights = instances(new BoxGeometry(0.14, 0.05, 0.14), deckLightEmitter.material, deckLightPositions.map((position) => composeMatrix(position)))

  root.add(deckConcrete, deckSteel, rocket, smoke, deckLights)

  const warm = new Color(palette.warm)
  const red = new Color(palette.fusion)
  const deckColor = new Color()
  const puffMatrix = new Matrix4()
  const puffPosition = new Vector3()
  const puffRotation = new Quaternion()
  const puffScale = new Vector3()
  const puffAxis = new Vector3(0.3, 1, 0.2).normalize()
  let frozenTime = 0

  function update(frame: FrameState): void {
    const { world, reducedMotion, dt } = frame
    const time = reducedMotion ? frozenTime : frame.time
    frozenTime = time
    if (flarePending) {
      flareStart = time
      flarePending = false
    }
    const flareElapsed = time - flareStart
    const flare = !reducedMotion && flareElapsed >= 0 && flareElapsed < flareSeconds ? Math.sin((Math.PI * flareElapsed) / flareSeconds) : 0

    const ignition = smoothstep(0.02, 0.16, world.launch)
    const climb = smoothstep(0.16, 1, world.launch)
    const thrust = Math.max(ignition, flare * 0.9)
    const shake = reducedMotion ? 0 : thrust * (1 - climb) * 0.025
    rocket.position.set(
      rocketBase[0] + Math.sin(time * 53) * shake,
      rocketBase[1] + maxLift * climb * climb,
      rocketBase[2] + Math.cos(time * 47) * shake,
    )

    const flicker = reducedMotion ? 1 : 0.86 + 0.14 * Math.sin(time * 31) * Math.sin(time * 17.3)
    flame.visible = thrust > 0.01
    flame.scale.set(0.7 + thrust * 0.3, flicker * (0.25 + thrust * 0.75), 0.7 + thrust * 0.3)
    coreMaterial.uniforms.uIntensity.value = 1.6 * thrust
    plumeMaterial.uniforms.uIntensity.value = 0.9 * thrust
    exhaust.intensity = 60 * thrust * flicker

    const smokeAmount = Math.max(smoothstep(0.04, 0.4, world.launch), flare * 0.5)
    smoke.visible = smokeAmount > 0.001
    smokeMaterial.opacity = 0.5 * Math.min(1, smokeAmount * 2)
    puffs.forEach((puff, index) => {
      const churn = reducedMotion ? 0 : Math.sin(time * 0.4 + index) * 0.12
      const reach = 0.7 + smokeAmount * (1.2 + 3.4 * puff.reach)
      puffPosition.set(
        rocketBase[0] + Math.cos(puff.angle) * reach,
        padTop + smokeAmount * (0.15 + 1.4 * puff.rise) + churn,
        rocketBase[2] + Math.sin(puff.angle) * reach,
      )
      puffRotation.setFromAxisAngle(puffAxis, puff.angle + time * 0.05)
      puffScale.setScalar(smokeAmount * (0.45 + 1.2 * puff.size))
      smoke.setMatrixAt(index, puffMatrix.compose(puffPosition, puffRotation, puffScale))
    })
    smoke.instanceMatrix.needsUpdate = true

    deckColor.copy(warm).lerp(red, world.red)
    deckLightEmitter.set(0.6 + 1.4 * Math.max(world.practicals, world.red), deckColor)

    launchEmphasis = reducedMotion ? launchTarget : approach(launchEmphasis, launchTarget, 9, dt)
    bodyMaterial.emissiveIntensity = launchEmphasis * 0.18
  }

  function dispose(): void {
    disposeTree(root)
  }

  return { id: 'rocket', root, proxies: [proxy], update, dispose }
}
