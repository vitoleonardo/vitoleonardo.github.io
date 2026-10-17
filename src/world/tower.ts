import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  type BufferGeometry,
  type InstancedMesh,
} from 'three'
import {
  block,
  blockBetween,
  composeMatrix,
  createRandom,
  cylinderBetween,
  instances,
  merge,
  place,
  projectWorldUVs,
  scaleUVs,
  strut,
} from './geometry'
import { createGlowTexture, createWetAsphaltTextures, withAnisotropy } from './textures'
import {
  approach,
  chapterIndex,
  concreteMaterial,
  createEmitter,
  createProxy,
  disposeTree,
  emphasisOf,
  glassMaterial,
  palette,
  smoothstep,
  steelMaterial,
  towerSpec,
} from './floors/kit'
import type { FloorFactory, FrameState, InteractiveProxy, Vec3 } from './types'

const half = towerSpec.halfSize
const outer = half + towerSpec.wallThickness
const slab = towerSpec.slabThickness
const storey = towerSpec.floorHeight
const slabFront = half + 0.15
const crownBase = 24
const crownSill = crownBase + 0.45
const roof = towerSpec.roof
const hutTop = roof + 3
const indexedFloorCount = 7
const sideWindows: readonly (readonly [number, number])[] = [[-5.6, -2.4], [-1.6, 1.6], [2.4, 5.6]]
const deckOpening = [-4, 4] as const
const doorHalfWidth = 1.6
const doorX = 4
const doorHeight = 3
const mullionWidth = 0.05
const interiorEdgeDimming = 0.6
const kerbZ = 11

export const entrance = {
  x: doorX,
  halfWidth: doorHalfWidth,
  height: doorHeight,
  hingeZ: half + 0.28,
  leafWidth: doorHalfWidth - 0.04,
  leafOpenAngle: 1.38,
  canopyCenter: [0, doorHeight + 0.5, half + 0.95],
  canopySize: [4.6, 0.12, 1.6],
  braceLow: [2.1, doorHeight + 0.5, half + 1.6],
  braceHigh: [2.1, doorHeight + 1.9, half + 0.2],
} as const satisfies Record<string, number | Vec3>
const roadY = -0.14
const streetHalfWidth = 40
const streetFarZ = 60
const lampXs = [-30, -18, -8, 8, 18, 30] as const
const lampZ = 10.6
const litLampX = -8
const roofHole = 1.8
const concreteTile = 2.4

function mirrorX([x, y, z]: Vec3, side: number): Vec3 {
  return [x * side, y, z]
}

function piersBetween(openings: readonly (readonly [number, number])[], from: number, to: number): [number, number][] {
  const piers: [number, number][] = []
  let cursor = from
  for (const [start, end] of openings) {
    piers.push([cursor, start])
    cursor = end
  }
  piers.push([cursor, to])
  return piers
}

function sideWallGeometry(): BufferGeometry[] {
  const pieces: BufferGeometry[] = []
  for (const side of [-1, 1] as const) {
    const [minX, maxX] = side < 0 ? [-outer, -half] : [half, outer]
    for (let level = 0; level < 6; level += 1) {
      const base = level * storey
      const opensToDeck = side > 0 && base === 20
      const openings = opensToDeck ? [deckOpening] : sideWindows
      const spandrelTop = opensToDeck ? base : base + 0.9
      const lintelBottom = base + 3.1
      pieces.push(blockBetween([minX, base - slab, -half], [maxX, spandrelTop, half]))
      pieces.push(blockBetween([minX, lintelBottom, -half], [maxX, base + storey - slab, half]))
      for (const [start, end] of piersBetween(openings, -half, half)) {
        pieces.push(blockBetween([minX, spandrelTop, start], [maxX, lintelBottom, end]))
      }
    }
    pieces.push(blockBetween([minX, crownBase - slab, -half], [maxX, crownSill, half]))
    const parapetStart = side < 0 ? towerSpec.core.maxZ : -outer
    pieces.push(blockBetween([minX, roof, parapetStart], [maxX, roof + 1, slabFront]))
  }
  return pieces
}

function coreGeometry(): BufferGeometry[] {
  const { minX, maxX, minZ, maxZ } = towerSpec.core
  const wallInner = maxX - 0.25
  const pieces: BufferGeometry[] = [
    blockBetween([wallInner, 0, minZ], [maxX, hutTop, maxZ]),
    blockBetween([-outer, crownSill, -outer], [minX, hutTop, maxZ]),
    blockBetween([minX, crownSill, -outer], [maxX, hutTop, minZ]),
    blockBetween([minX, roof, maxZ - 0.2], [-6.2, hutTop, maxZ]),
    blockBetween([-5, roof, maxZ - 0.2], [wallInner, hutTop, maxZ]),
    blockBetween([-6.2, roof + 2.2, maxZ - 0.2], [-5, hutTop, maxZ]),
    blockBetween([-outer, hutTop, -outer], [maxX, hutTop + 0.3, maxZ]),
  ]
  const landingZ = maxZ - 0.8
  const turnZ = minZ + 0.8
  const flightRun = landingZ - turnZ
  const steps = 12
  const rise = storey / 2 / steps
  const run = flightRun / steps
  const tread = 0.22
  const splitX = -5.6
  for (let level = 0; level < 7; level += 1) {
    const base = level * storey
    for (let step = 0; step < steps; step += 1) {
      const climbTop = base + rise * (step + 1)
      pieces.push(block([splitX - minX, rise + tread, run], [(minX + splitX) / 2, climbTop - (rise + tread) / 2, landingZ - run * (step + 0.5)]))
      const returnTop = base + storey / 2 + rise * (step + 1)
      pieces.push(block([wallInner - splitX, rise + tread, run], [(splitX + wallInner) / 2, returnTop - (rise + tread) / 2, turnZ + run * (step + 0.5)]))
    }
    pieces.push(blockBetween([minX, base + storey / 2 - tread, minZ], [wallInner, base + storey / 2, turnZ]))
  }
  return pieces
}

function shellGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [
    blockBetween([-outer, -slab, -outer], [outer, crownSill, -half]),
    blockBetween([towerSpec.core.maxX, roof, -outer], [half, roof + 1, -half - 0.15]),
    blockBetween([-streetHalfWidth, -0.25, kerbZ - 0.05], [streetHalfWidth, 0.015, kerbZ + 0.25]),
    ...sideWallGeometry(),
    ...coreGeometry(),
  ]
  const crownColumns: readonly (readonly [number, number])[] = [[-outer + 0.2, half - 0.2], [outer - 0.2, -outer + 0.2], [outer - 0.2, half - 0.2]]
  for (const [x, z] of crownColumns) {
    pieces.push(block([0.4, roof - slab - crownSill, 0.4], [x, (crownSill + roof - slab) / 2, z]))
  }
  return projectWorldUVs(merge(pieces), concreteTile)
}

function slabGeometry(): BufferGeometry {
  const { maxX: coreEdge } = towerSpec.core
  const landingZ = towerSpec.core.maxZ - 0.8
  const pieces: BufferGeometry[] = [
    blockBetween([-half, -slab, -half], [half, 0, half]),
    blockBetween([-streetHalfWidth, -0.2, half], [streetHalfWidth, 0, kerbZ]),
  ]
  for (let level = 1; level < towerSpec.levels - 1; level += 1) {
    const top = level * storey
    pieces.push(blockBetween([coreEdge, top - slab, -half], [half, top, slabFront]))
    pieces.push(blockBetween([-half, top - slab, landingZ], [coreEdge, top, slabFront]))
  }
  const roofBottom = roof - slab
  pieces.push(
    blockBetween([coreEdge, roofBottom, -outer], [outer, roof, -roofHole]),
    blockBetween([coreEdge, roofBottom, roofHole], [outer, roof, slabFront]),
    blockBetween([coreEdge, roofBottom, -roofHole], [-roofHole, roof, roofHole]),
    blockBetween([roofHole, roofBottom, -roofHole], [outer, roof, roofHole]),
    blockBetween([-half, roofBottom, landingZ], [coreEdge, roof, slabFront]),
    blockBetween([-outer, roofBottom, towerSpec.core.maxZ], [-half, roof, slabFront]),
  )
  return projectWorldUVs(merge(pieces), concreteTile)
}

function facadeMatrices(): Matrix4[] {
  const bars: Matrix4[] = []
  const bar = (size: Vec3, center: Vec3) => bars.push(composeMatrix(center, [0, 0, 0], size))
  const mullionZ = half + 0.26
  for (let column = 0; column <= 7; column += 1) {
    const x = -half + column * 2
    const bottom = Math.abs(x - doorX) < doorHalfWidth ? doorHeight + 0.3 : 0
    bar([mullionWidth, roof - slab - bottom, 0.16], [x, (bottom + roof - slab) / 2, mullionZ])
  }
  for (let level = 1; level < 6; level += 1) {
    bar([half * 2, 0.05, 0.06], [0, level * storey + 1.05, mullionZ + 0.05])
  }
  const crownMid = (crownSill + roof - slab) / 2
  const crownHeight = roof - slab - crownSill
  for (const side of [-1, 1]) {
    for (let step = 0; step <= 10; step += 1) {
      bar([0.08, crownHeight, 0.08], [side * (outer - 0.2), crownMid, -outer + 0.2 + step * 1.4])
    }
    bar([0.05, 0.05, half * 2 + 0.4], [side * (outer - 0.2), crownSill + 1.1, -0.2])
  }
  for (let step = 0; step <= 8; step += 1) {
    bar([0.08, crownHeight, 0.08], [-4 + step * 1.4, crownMid, -outer + 0.2])
  }
  bar([half * 2, 0.05, 0.05], [0, crownSill + 1.1, half + 0.2])
  bar([half * 2, 0.05, 0.05], [0, roof + 1.05, slabFront - 0.05])
  for (let post = 0; post <= 14; post += 1) {
    bar([0.04, 1.05, 0.04], [-half + post, roof + 0.52, slabFront - 0.05])
  }
  return bars
}

function steelDetailGeometry(): BufferGeometry {
  const doorFrame = merge([
    blockBetween([-doorHalfWidth - 0.14, 0, half + 0.1], [-doorHalfWidth, doorHeight + 0.3, half + 0.32]),
    blockBetween([doorHalfWidth, 0, half + 0.1], [doorHalfWidth + 0.14, doorHeight + 0.3, half + 0.32]),
    blockBetween([-doorHalfWidth - 0.14, doorHeight, half + 0.1], [doorHalfWidth + 0.14, doorHeight + 0.3, half + 0.32]),
    block(entrance.canopySize, entrance.canopyCenter),
    ...[-1, 1].map((side) => strut(mirrorX(entrance.braceLow, side), mirrorX(entrance.braceHigh, side), 0.04)),
  ])
  const pieces: BufferGeometry[] = [place(doorFrame, [doorX, 0, 0])]
  for (const side of [-1, 1]) {
    pieces.push(blockBetween([side < 0 ? -outer - 0.02 : outer, crownBase + 0.2, -outer], [side < 0 ? -outer : outer + 0.02, crownBase + 0.3, slabFront]))
  }
  return merge(pieces)
}

function glassGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  for (const side of [-1, 1]) {
    for (let level = 0; level < 6; level += 1) {
      const base = level * storey
      if (side > 0 && base === 20) continue
      for (const [start, end] of sideWindows) {
        pieces.push(blockBetween([side * half + side * 0.18 - 0.01, base + 0.9, start], [side * half + side * 0.18 + 0.01, base + 3.1, end]))
      }
    }
    const crownStart = side < 0 ? towerSpec.core.maxZ : -outer + 0.2
    pieces.push(blockBetween([side * (outer - 0.2) - 0.01, crownSill, crownStart], [side * (outer - 0.2) + 0.01, roof - slab, half]))
  }
  pieces.push(blockBetween([towerSpec.core.maxX, crownSill, -outer + 0.19], [outer - 0.2, roof - slab, -outer + 0.21]))
  pieces.push(blockBetween([-half, crownSill, half + 0.19], [half, roof - slab, half + 0.21]))
  return merge(pieces)
}

function stripMatrices(): Matrix4[] {
  const strips: Matrix4[] = []
  for (let floor = 0; floor < indexedFloorCount; floor += 1) {
    const y = (floor + 1) * storey - 0.27
    strips.push(composeMatrix([0, y, slabFront + 0.015], [0, 0, 0], [half * 2, 0.04, 0.03]))
    strips.push(composeMatrix([-outer - 0.015, y, -0.2], [0, 0, 0], [0.03, 0.04, outer * 2 - 0.4]))
    strips.push(composeMatrix([outer + 0.015, y, -0.2], [0, 0, 0], [0.03, 0.04, outer * 2 - 0.4]))
  }
  return strips
}

function doorGeometry(): BufferGeometry {
  const { leafWidth, leafOpenAngle, hingeZ } = entrance
  const westLeaf = place(block([leafWidth, doorHeight - 0.05, 0.05], [leafWidth / 2, 0, 0]), [-doorHalfWidth, doorHeight / 2, hingeZ], [0, -leafOpenAngle, 0])
  const eastLeaf = place(block([leafWidth, doorHeight - 0.05, 0.05], [-leafWidth / 2, 0, 0]), [doorHalfWidth, doorHeight / 2, hingeZ], [0, leafOpenAngle, 0])
  const canopyLight = block([4.2, 0.03, 0.08], [0, doorHeight + 0.43, half + 1.6])
  const threshold = block([doorHalfWidth * 2, 0.02, 0.12], [0, 0.012, half + 0.2])
  return place(merge([westLeaf, eastLeaf, canopyLight, threshold]), [doorX, 0, 0])
}

function markingGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const flat = (width: number, depth: number, x: number, z: number) =>
    pieces.push(place(new PlaneGeometry(width, depth), [x, roadY + 0.006, z], [-Math.PI / 2, 0, 0]))
  for (let x = -streetHalfWidth + 1.5; x < streetHalfWidth; x += 6) {
    if (Math.abs(x + 1.5 - doorX) < 4) continue
    flat(3, 0.14, x + 1.5, 17.6)
  }
  const crossingStart = doorX - 3
  const crossingEnd = doorX + 3
  for (const z of [11.6, 23.6]) {
    flat(crossingStart + streetHalfWidth, 0.12, (crossingStart - streetHalfWidth) / 2, z)
    flat(streetHalfWidth - crossingEnd, 0.12, (crossingEnd + streetHalfWidth) / 2, z)
  }
  for (let z = 12; z < 23.5; z += 1) flat(4, 0.5, doorX, z)
  return merge(pieces)
}

function poolMatrices(): Matrix4[] {
  const pools = lampXs.map((x) => composeMatrix([x, 0.02, kerbZ + 0.6], [-Math.PI / 2, 0, 0], [9, 9, 1]))
  pools.push(composeMatrix([doorX, 0.025, 9.2], [-Math.PI / 2, 0, 0], [7, 5, 1]))
  pools.push(composeMatrix([doorX, roadY + 0.012, 17], [-Math.PI / 2, 0, 0], [3.4, 12, 1]))
  return pools
}

function lampGeometry(): BufferGeometry {
  return merge([
    cylinderBetween([0, 0, 0], [0, 0.5, 0], 0.13, 10),
    cylinderBetween([0, 0.5, 0], [0, 5, 0], 0.065, 10),
    strut([0, 4.85, 0], [0, 5.05, 1], 0.05),
    block([0.5, 0.12, 0.3], [0, 5.02, 1.05]),
  ])
}

function neighbourGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const buildings: readonly { minX: number; maxX: number; height: number }[] = [
    { minX: -30, maxX: -9.2, height: 16 },
    { minX: 10.5, maxX: 28, height: 7.5 },
  ]
  for (const { minX, maxX, height } of buildings) {
    pieces.push(blockBetween([minX, -0.2, -12], [maxX, height, 6.6]))
    pieces.push(blockBetween([minX, height, 6.35], [maxX, height + 0.8, 6.6]))
    pieces.push(blockBetween([minX + 3, height, -6], [minX + 6.5, height + 1.6, -2]))
    pieces.push(blockBetween([maxX - 6, height, -9], [maxX - 2, height + 2.4, -4]))
  }
  return projectWorldUVs(merge(pieces), concreteTile * 1.5)
}

function neighbourWindows(): { matrices: Matrix4[]; colors: Color[] } {
  const random = createRandom(77)
  const matrices: Matrix4[] = []
  const colors: Color[] = []
  const lit = new Color(palette.warm)
  const cool = new Color('#9db3ff')
  const dark = new Color('#0b111a')
  const facades = [
    { minX: -30, maxX: -9.2, height: 16 },
    { minX: 10.5, maxX: 28, height: 7.5 },
  ]
  for (const { minX, maxX, height } of facades) {
    for (let x = minX + 1.4; x < maxX - 1; x += 2.4) {
      matrices.push(composeMatrix([x, 1.7, 6.62], [0, 0, 0], [2, 2.4, 1]))
      colors.push(random() < 0.25 ? lit.clone().multiplyScalar(0.08 + random() * 0.1) : dark)
      for (let y = 4.6; y < height - 1.2; y += 3.2) {
        matrices.push(composeMatrix([x, y, 6.62], [0, 0, 0], [1.3, 1.7, 1]))
        const roll = random()
        colors.push(roll < 0.12 ? lit.clone().multiplyScalar(0.07 + random() * 0.12) : roll < 0.18 ? cool.clone().multiplyScalar(0.07) : dark)
      }
    }
  }
  return { matrices, colors }
}

export const createTower: FloorFactory = (context) => {
  const { textures, renderer } = context
  const root = new Group()
  root.name = 'street'

  const floorMap = withAnisotropy(textures.concrete.map, renderer, 8)
  const floorNormal = withAnisotropy(textures.concrete.normalMap, renderer, 8)
  const floorRoughness = withAnisotropy(textures.concrete.roughnessMap, renderer, 8)
  const asphalt = createWetAsphaltTextures()
  for (const texture of [asphalt.map, asphalt.roughnessMap]) {
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  }
  const glow = createGlowTexture()
  const ownedTextures = [floorMap, floorNormal, floorRoughness, asphalt.map, asphalt.roughnessMap, glow]

  const shell = new Mesh(shellGeometry(), concreteMaterial(textures))
  const slabs = new Mesh(
    slabGeometry(),
    concreteMaterial(textures, { map: floorMap, normalMap: floorNormal, roughnessMap: floorRoughness, color: '#d8d8d8' }),
  )
  const facade = instances(new BoxGeometry(1, 1, 1), steelMaterial(), facadeMatrices())
  const steelDetail = new Mesh(steelDetailGeometry(), steelMaterial())
  const glass = new Mesh(glassGeometry(), glassMaterial(0.14))

  const stripColor = new Color(palette.warm)
  const stripMatrixList = stripMatrices()
  const strips: InstancedMesh = instances(
    new BoxGeometry(1, 1, 1),
    new MeshBasicMaterial(),
    stripMatrixList,
    stripMatrixList.map(() => stripColor.clone().multiplyScalar(0.05)),
  )
  const stripScratch = new Color()

  const doorEmitter = createEmitter(palette.warm, 1.6)
  const door = new Mesh(doorGeometry(), doorEmitter.material)
  const doorLight = new PointLight(palette.warm, 16, 16, 2)
  doorLight.position.set(doorX, 2.4, half + 1.4)

  const road = new Mesh(
    scaleUVs(
      place(new PlaneGeometry(streetHalfWidth * 2, streetFarZ - kerbZ - 0.25), [0, roadY, (kerbZ + 0.25 + streetFarZ) / 2], [-Math.PI / 2, 0, 0]),
      (streetHalfWidth * 2) / 8,
      (streetFarZ - kerbZ) / 8,
    ),
    new MeshStandardMaterial({ map: asphalt.map, roughnessMap: asphalt.roughnessMap, roughness: 1, metalness: 0 }),
  )
  const markings = new Mesh(
    markingGeometry(),
    new MeshStandardMaterial({ color: new Color(palette.readable).multiplyScalar(0.45), roughness: 0.42, polygonOffset: true, polygonOffsetFactor: -2 }),
  )

  const poolMaterial = new MeshBasicMaterial({
    map: glow,
    color: new Color(palette.warm).multiplyScalar(0.55),
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const pools = instances(new PlaneGeometry(1, 1), poolMaterial, poolMatrices())

  const lamps = instances(
    lampGeometry(),
    steelMaterial({ color: '#23272e' }),
    lampXs.map((x) => composeMatrix([x, 0, lampZ])),
  )
  const lampEmitter = createEmitter(palette.warm, 2.4)
  const lampHeads = instances(
    new BoxGeometry(0.42, 0.02, 0.22),
    lampEmitter.material,
    lampXs.map((x) => composeMatrix([x, 4.955, lampZ + 1.05])),
  )
  const lampLight = new PointLight(palette.warm, 28, 20, 2)
  lampLight.position.set(litLampX, 4.7, lampZ + 1.05)

  const neighbours = new Mesh(neighbourGeometry(), concreteMaterial(textures, { color: '#8d929b' }))
  const windowLayout = neighbourWindows()
  const neighbourWindowMesh = instances(new PlaneGeometry(1, 1), new MeshBasicMaterial(), windowLayout.matrices, windowLayout.colors)

  for (const mesh of [shell, slabs, facade, neighbours]) {
    mesh.castShadow = true
    mesh.receiveShadow = true
  }
  steelDetail.castShadow = true
  road.receiveShadow = true

  const indexEmphasis = new Array<number>(indexedFloorCount).fill(0)
  const indexTarget = new Array<number>(indexedFloorCount).fill(0)
  const proxies: InteractiveProxy[] = Array.from({ length: indexedFloorCount }, (_, floor) =>
    createProxy({
      id: `index-floor-${floor}`,
      chapters: ['index'],
      geometry: new BoxGeometry(half * 2, storey - slab, half * 2),
      position: [0, floor * storey + (storey - slab) / 2, 0],
      onState(state) {
        indexTarget[floor] = emphasisOf(state)
      },
    }),
  )

  root.add(
    shell,
    slabs,
    facade,
    steelDetail,
    glass,
    strips,
    door,
    doorLight,
    road,
    markings,
    pools,
    lamps,
    lampHeads,
    lampLight,
    neighbours,
    neighbourWindowMesh,
    ...proxies.map((proxy) => proxy.object),
  )

  function update(frame: FrameState): void {
    const { world, dt, reducedMotion, progress } = frame
    const interior = smoothstep(chapterIndex.frontend - 1, chapterIndex.frontend, progress.smooth) * (1 - smoothstep(chapterIndex.aiProducts, chapterIndex.aiCoding, progress.smooth))
    const edgeLevel = 1 - interiorEdgeDimming * interior
    for (let floor = 0; floor < indexedFloorCount; floor += 1) {
      indexEmphasis[floor] = reducedMotion ? indexTarget[floor] : approach(indexEmphasis[floor], indexTarget[floor], 10, dt)
      const lit = smoothstep(0, 1, world.floorsLit - floor)
      const intensity = (0.05 + lit * 0.8) * edgeLevel + indexEmphasis[floor] * 1.2
      stripScratch.copy(stripColor).multiplyScalar(intensity)
      for (let face = 0; face < 3; face += 1) strips.setColorAt(floor * 3 + face, stripScratch)
    }
    if (strips.instanceColor) strips.instanceColor.needsUpdate = true

    const daylight = 1 - world.dawn * 0.45
    doorEmitter.set(1.6 * daylight)
    doorLight.intensity = 16 * daylight
    lampEmitter.set(2.4 * daylight)
    lampLight.intensity = 28 * daylight
    poolMaterial.color.set(palette.warm).multiplyScalar(0.55 * daylight)
  }

  function dispose(): void {
    disposeTree(root)
    for (const texture of ownedTextures) texture.dispose()
  }

  return { id: 'street', root, proxies, update, dispose }
}
