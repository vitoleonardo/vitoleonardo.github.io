import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FogExp2,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  Vector4,
  InstancedBufferAttribute,
  UniformsLib,
  UniformsUtils,
  type InstancedMesh,
  type Texture,
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
import { createGlowTexture, createSlabTextures, createWetAsphaltTextures } from './textures'
import {
  approach,
  chapterIndex,
  createEmitter,
  createProxy,
  disposeTree,
  emphasisOf,
  glassMaterial,
  palette,
  smoothstep,
  steelMaterial,
  towerSpec,
  wornConcreteMaterial,
  type ConcreteWear,
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
const mullion = { web: 0.045, depth: 0.2, cap: 0.09, capDepth: 0.035 } as const
const bollardXs = [-15, -13, -11, -3.4, -1.8, 10.2, 12, 13.8] as const
const bollardZ = 10.55
const bikeStandXs = [-6.2, -5.2, -4.2] as const
const bikeStandZ = 9.2
const litterBin = [1.2, 10.4] as const
const interiorEdgeDimming = 0.6
const interiorWashStrength = 0.11
const interiorWashInset = 0.4
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
const coreStair = {
  landingZ: towerSpec.core.maxZ - 0.8,
  turnZ: towerSpec.core.minZ + 0.8,
  steps: 12,
  splitX: -5.6,
  landingThickness: 0.22,
} as const
const roadY = -0.14
const streetHalfWidth = 40
const streetFarZ = 60
const lampXs = [-30, -18, -8, 8, 18, 30] as const
const lampZ = 10.6
const roofHole = 1.8
const concreteTile = 2.4
const anisotropyLevel = 8
const reflectionStrength = 1.2
const asphaltTile = 8
const upFacingThreshold = 0.5

const groundWear: ConcreteWear = {
  groundY: 0,
  dampHeight: 0.42,
  shelter: [-half, -half, half, half],
  rainDrift: 0.8,
  polishPaths: [
    [doorX, kerbZ - 2.4, doorX - 1, 4.6],
    [doorX - 1, 4.6, 0.8, 0.4],
    [doorX - 1, 4.6, -2.6, 3.8],
    [doorX - doorHalfWidth + 0.2, half + 0.05, doorX + doorHalfWidth - 0.2, half + 0.05],
  ],
  polishWidth: 0.95,
}

interface ReflectionSource {
  position: Vec3
  strength: number
  spread: number
}

const reflectionSources: readonly ReflectionSource[] = [
  ...lampXs.map((x): ReflectionSource => ({ position: [x, 4.96, lampZ + 1.05], strength: 1, spread: 1 })),
  { position: [doorX, 1.5, half + 0.3], strength: 0.55, spread: 2.4 },
  { position: [doorX, doorHeight + 0.43, half + 1.6], strength: 0.5, spread: 1.6 },
]

const reflectionVertexShader = `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const reflectionFragmentShader = `
#define SOURCE_COUNT ${reflectionSources.length}
uniform vec4 uSources[ SOURCE_COUNT ];
uniform float uSpread[ SOURCE_COUNT ];
uniform vec3 uColor;
uniform float uIntensity;
uniform float uFogDensity;
uniform sampler2D uWetness;
uniform vec3 uWetnessFrame;
varying vec3 vWorld;
void main() {
  vec3 view = normalize( vWorld - cameraPosition );
  vec3 mirrored = reflect( view, vec3( 0.0, 1.0, 0.0 ) );
  vec3 heading = normalize( vec3( mirrored.x, 0.0, mirrored.z ) + vec3( 1e-5, 0.0, 0.0 ) );
  vec3 side = vec3( -heading.z, 0.0, heading.x );
  vec2 wetnessUv = vec2( vWorld.x - uWetnessFrame.x, uWetnessFrame.y - vWorld.z ) / uWetnessFrame.z;
  float roughness = texture2D( uWetness, wetnessUv ).g;
  float standing = 1.0 - smoothstep( 0.06, 0.3, roughness );
  float sheen = 1.0 - smoothstep( 0.2, 0.62, roughness );
  float glow = 0.0;
  for ( int source = 0; source < SOURCE_COUNT; source ++ ) {
    vec3 toSource = normalize( uSources[ source ].xyz - vWorld );
    float across = dot( toSource - mirrored, side ) / uSpread[ source ];
    float rise = ( toSource.y - mirrored.y ) / uSpread[ source ];
    float sharp = exp( -across * across / 0.0004 - rise * rise / 0.008 );
    float soft = exp( -across * across / 0.0036 - rise * rise / 0.032 );
    glow += uSources[ source ].w * step( 0.0, dot( toSource, mirrored ) ) * ( sharp * standing + soft * 0.18 * sheen );
  }
  float fresnel = 0.3 + 0.7 * pow( 1.0 - abs( view.y ), 4.0 );
  float depth = distance( vWorld, cameraPosition );
  glow *= 1.0 - 0.75 * smoothstep( 25.0, 70.0, depth );
  float fogged = exp( -uFogDensity * uFogDensity * depth * depth );
  gl_FragColor = vec4( uColor * glow * fresnel * fogged * uIntensity, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function mirrorX([x, y, z]: Vec3, side: number): Vec3 {
  return [x * side, y, z]
}

function splitByFacing(geometry: BufferGeometry): { up: BufferGeometry; rest: BufferGeometry } {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  const names = Object.keys(flat.attributes)
  const normal = flat.getAttribute('normal')
  const buckets = { up: new Map<string, number[]>(), rest: new Map<string, number[]>() }
  for (const bucket of Object.values(buckets)) for (const name of names) bucket.set(name, [])
  for (let vertex = 0; vertex < normal.count; vertex += 3) {
    const facesUp = normal.getY(vertex) + normal.getY(vertex + 1) + normal.getY(vertex + 2) > upFacingThreshold * 3
    const bucket = facesUp ? buckets.up : buckets.rest
    for (const name of names) {
      const attribute = flat.getAttribute(name)
      const target = bucket.get(name) as number[]
      for (let corner = 0; corner < 3; corner += 1) {
        for (let component = 0; component < attribute.itemSize; component += 1) {
          target.push(attribute.getComponent(vertex + corner, component))
        }
      }
    }
  }
  const build = (bucket: Map<string, number[]>) => {
    const part = new BufferGeometry()
    for (const name of names) part.setAttribute(name, new Float32BufferAttribute(bucket.get(name) as number[], flat.getAttribute(name).itemSize))
    return part
  }
  const parts = { up: build(buckets.up), rest: build(buckets.rest) }
  geometry.dispose()
  flat.dispose()
  return parts
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
  for (let level = 0; level < 7; level += 1) {
    const base = level * storey
    pieces.push(blockBetween([minX, base + storey / 2 - coreStair.landingThickness, minZ], [wallInner, base + storey / 2, coreStair.turnZ]))
  }
  return pieces
}

function plateBetween(from: Vec3, to: Vec3, width: number, depth: number): BufferGeometry {
  const start = new Vector3(...from)
  const end = new Vector3(...to)
  const direction = end.clone().sub(start)
  const length = direction.length()
  const orientation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize())
  return new BoxGeometry(width, length, depth).applyMatrix4(new Matrix4().compose(start.add(end).multiplyScalar(0.5), orientation, new Vector3(1, 1, 1)))
}

function coreStairGeometry(): BufferGeometry {
  const { minX } = towerSpec.core
  const wallInner = towerSpec.core.maxX - 0.25
  const { landingZ, turnZ, steps, splitX } = coreStair
  const rise = storey / 2 / steps
  const run = (landingZ - turnZ) / steps
  const pieces: BufferGeometry[] = []
  const flight = (fromX: number, toX: number, base: number, startZ: number, direction: -1 | 1) => {
    for (let step = 0; step < steps; step += 1) {
      const top = base + rise * (step + 1)
      const z = startZ + direction * run * (step + 0.5)
      pieces.push(block([toX - fromX - 0.02, 0.04, run + 0.03], [(fromX + toX) / 2, top - 0.02, z]))
      pieces.push(block([toX - fromX - 0.02, 0.025, 0.03], [(fromX + toX) / 2, top - 0.0125, z - direction * (run / 2)]))
    }
    const lowZ = startZ
    const highZ = startZ + direction * run * steps
    for (const x of [fromX + 0.03, toX - 0.03]) {
      pieces.push(plateBetween([x, base - 0.12, lowZ], [x, base + storey / 2 - 0.12, highZ], 0.03, 0.24))
    }
    const railX = splitX + (fromX < splitX ? -0.04 : 0.04)
    pieces.push(cylinderBetween([railX, base + 0.95, lowZ], [railX, base + storey / 2 + 0.95, highZ], 0.02, 8))
    for (const t of [0.15, 0.5, 0.85]) {
      const postZ = lowZ + (highZ - lowZ) * t
      const postBase = base + (storey / 2) * t
      pieces.push(cylinderBetween([railX, postBase, postZ], [railX, postBase + 0.95, postZ], 0.014, 6))
    }
  }
  for (let level = 0; level < 7; level += 1) {
    const base = level * storey
    flight(minX, splitX, base, landingZ, -1)
    flight(splitX, wallInner, base + storey / 2, turnZ, 1)
  }
  return merge(pieces)
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

function curtainWallGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const webBack = half + 0.16
  const webFront = webBack + mullion.depth
  const top = roof - slab
  for (let column = 0; column <= 7; column += 1) {
    const x = -half + column * 2
    const bottom = Math.abs(x - doorX) < doorHalfWidth ? doorHeight + 0.3 : 0
    pieces.push(blockBetween([x - mullion.web / 2, bottom, webBack], [x + mullion.web / 2, top, webFront]))
    pieces.push(blockBetween([x - mullion.cap / 2, bottom, webFront], [x + mullion.cap / 2, top, webFront + mullion.capDepth]))
    for (let level = 1; level < towerSpec.levels - 1; level += 1) {
      const slabTop = level * storey
      if (slabTop > top) continue
      pieces.push(blockBetween([x - 0.08, slabTop - slab + 0.04, slabFront - 0.02], [x + 0.08, slabTop - 0.06, webBack + 0.02]))
    }
  }
  for (let level = 1; level < 6; level += 1) {
    const y = level * storey + 1.05
    pieces.push(blockBetween([-half, y - 0.03, webBack + 0.03], [half, y + 0.03, webFront - 0.02]))
    pieces.push(blockBetween([-half, y - 0.04, webFront - 0.02], [half, y + 0.04, webFront + mullion.capDepth * 0.7]))
  }
  for (let level = 1; level < towerSpec.levels - 1; level += 1) {
    const slabTop = level * storey
    pieces.push(blockBetween([-half - 0.02, slabTop - 0.035, slabFront - 0.01], [half + 0.02, slabTop + 0.005, slabFront + 0.045]))
    pieces.push(blockBetween([-half - 0.02, slabTop - slab, slabFront - 0.01], [half + 0.02, slabTop - slab + 0.03, slabFront + 0.025]))
  }
  return merge(pieces)
}

function streetFurnitureGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  for (const x of bollardXs) {
    pieces.push(place(new CylinderGeometry(0.09, 0.1, 0.86, 14), [x, 0.43, bollardZ]))
    pieces.push(place(new SphereGeometry(0.09, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), [x, 0.86, bollardZ]))
    pieces.push(place(new CylinderGeometry(0.104, 0.104, 0.05, 14), [x, 0.66, bollardZ]))
  }
  for (const x of bikeStandXs) {
    const legHeight = 0.62
    const halfSpan = 0.32
    const bend = 0.14
    for (const side of [-1, 1]) {
      pieces.push(cylinderBetween([x, 0, bikeStandZ + side * halfSpan], [x, legHeight, bikeStandZ + side * halfSpan], 0.024, 10))
      pieces.push(place(new TorusGeometry(bend, 0.024, 8, 10, Math.PI / 2), [x, legHeight, bikeStandZ + side * (halfSpan - bend)], [0, Math.PI / 2, side > 0 ? 0 : Math.PI / 2]))
    }
    pieces.push(cylinderBetween([x, legHeight + bend, bikeStandZ - halfSpan + bend], [x, legHeight + bend, bikeStandZ + halfSpan - bend], 0.024, 10))
  }
  const [binX, binZ] = litterBin
  pieces.push(place(new CylinderGeometry(0.24, 0.21, 0.82, 20, 1, true), [binX, 0.43, binZ]))
  pieces.push(place(new CylinderGeometry(0.26, 0.26, 0.06, 20), [binX, 0.87, binZ]))
  pieces.push(place(new CylinderGeometry(0.05, 0.05, 0.9, 10), [binX, 0.45, binZ - 0.3]))
  return merge(pieces)
}

function steelDetailGeometry(): BufferGeometry {
  const doorFrame = merge([
    blockBetween([-doorHalfWidth - 0.14, 0, half + 0.1], [-doorHalfWidth, doorHeight + 0.3, half + 0.32]),
    blockBetween([doorHalfWidth, 0, half + 0.1], [doorHalfWidth + 0.14, doorHeight + 0.3, half + 0.32]),
    blockBetween([-doorHalfWidth - 0.14, doorHeight, half + 0.1], [doorHalfWidth + 0.14, doorHeight + 0.3, half + 0.32]),
    block(entrance.canopySize, entrance.canopyCenter),
    ...[-1, 1].map((side) => strut(mirrorX(entrance.braceLow, side), mirrorX(entrance.braceHigh, side), 0.04)),
  ])
  const pieces: BufferGeometry[] = [place(doorFrame, [doorX, 0, 0]), doorLeafGeometry(-1).frame, doorLeafGeometry(1).frame, curtainWallGeometry(), coreStairGeometry()]
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
  pieces.push(doorLeafGeometry(-1).pane, doorLeafGeometry(1).pane)
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

function doorLeafGeometry(side: -1 | 1): { frame: BufferGeometry; pane: BufferGeometry } {
  const { leafWidth, leafOpenAngle, hingeZ } = entrance
  const leafHeight = doorHeight - 0.05
  const stile = 0.08
  const topRail = 0.1
  const bottomRail = 0.22
  const thickness = 0.05
  const centerX = (-side * leafWidth) / 2
  const frame = merge([
    block([stile, leafHeight, thickness], [centerX - (leafWidth - stile) / 2, 0, 0]),
    block([stile, leafHeight, thickness], [centerX + (leafWidth - stile) / 2, 0, 0]),
    block([leafWidth - stile * 2, topRail, thickness], [centerX, leafHeight / 2 - topRail / 2, 0]),
    block([leafWidth - stile * 2, bottomRail, thickness], [centerX, -leafHeight / 2 + bottomRail / 2, 0]),
    block([0.03, 0.9, 0.03], [centerX - side * (leafWidth / 2 - stile - 0.06), -0.1, thickness]),
  ])
  const pane = block([leafWidth - stile * 2, leafHeight - topRail - bottomRail, 0.012], [centerX, (bottomRail - topRail) / 2, 0])
  const hinge: Vec3 = [doorX + side * doorHalfWidth, doorHeight / 2, hingeZ]
  const swing: Vec3 = [0, side * leafOpenAngle, 0]
  return { frame: place(frame, hinge, swing), pane: place(pane, hinge, swing) }
}

function doorGeometry(): BufferGeometry {
  const canopyLight = block([4.2, 0.03, 0.08], [0, doorHeight + 0.43, half + 1.6])
  const threshold = block([doorHalfWidth * 2, 0.02, 0.12], [0, 0.012, half + 0.2])
  return place(merge([canopyLight, threshold]), [doorX, 0, 0])
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

interface NeighbourBlock {
  minX: number
  maxX: number
  height: number
  storeys: number
}

interface WindowOpening {
  center: Vec3
  width: number
  height: number
  shopfront: boolean
}

const neighbourBlocks: readonly NeighbourBlock[] = [
  { minX: -30, maxX: -9.2, height: 16, storeys: 4 },
  { minX: 10.5, maxX: 28, height: 7.5, storeys: 1 },
]
const neighbourFace = 6.6
const neighbourSkin = 0.3
const glassSetback = 0.22
const windowPitch = 2.4
const storeyPitch = 3.2
const upperWindow = { width: 1.3, height: 1.7, sill: 3.75 } as const
const shopfront = { width: 2, height: 2.4, sill: 0.5 } as const
const frameWidth = 0.06

function neighbourColumns({ minX, maxX }: NeighbourBlock): number[] {
  const count = Math.floor((maxX - minX - 1.2) / windowPitch)
  const start = (minX + maxX) / 2 - ((count - 1) * windowPitch) / 2
  return Array.from({ length: count }, (_, column) => start + column * windowPitch)
}

function neighbourOpenings(): WindowOpening[] {
  const openings: WindowOpening[] = []
  const glassZ = neighbourFace - glassSetback
  for (const building of neighbourBlocks) {
    for (const x of neighbourColumns(building)) {
      openings.push({ center: [x, shopfront.sill + shopfront.height / 2, glassZ], width: shopfront.width, height: shopfront.height, shopfront: true })
      for (let storey = 0; storey < building.storeys; storey += 1) {
        const bottom = upperWindow.sill + storey * storeyPitch
        openings.push({ center: [x, bottom + upperWindow.height / 2, glassZ], width: upperWindow.width, height: upperWindow.height, shopfront: false })
      }
    }
  }
  return openings
}

function neighbourGeometry(openings: readonly WindowOpening[]): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const skinBack = neighbourFace - neighbourSkin
  for (const building of neighbourBlocks) {
    const { minX, maxX, height } = building
    pieces.push(blockBetween([minX, -0.2, -12], [maxX, height, skinBack]))
    pieces.push(blockBetween([minX - 0.06, height - 0.35, skinBack], [maxX + 0.06, height - 0.1, neighbourFace + 0.14]))
    pieces.push(blockBetween([minX, height - 0.1, neighbourFace - 0.25], [maxX, height + 0.8, neighbourFace]))
    pieces.push(blockBetween([minX, -0.2, skinBack], [maxX, 0.45, neighbourFace + 0.06]))
    pieces.push(blockBetween([minX + 3, height, -6], [minX + 6.5, height + 1.6, -2]))
    pieces.push(blockBetween([maxX - 6, height, -9], [maxX - 2, height + 2.4, -4]))
    const own = openings.filter(({ center }) => center[0] > minX && center[0] < maxX)
    const columns = neighbourColumns(building)
    let cursor = minX
    for (const x of columns) {
      const halfWidth = shopfront.width / 2
      pieces.push(blockBetween([cursor, 0.45, skinBack], [x - halfWidth, height - 0.35, neighbourFace]))
      const stack = own.filter(({ center }) => center[0] === x).sort((a, b) => a.center[1] - b.center[1])
      let floor = 0.45
      for (const opening of stack) {
        const bottom = opening.center[1] - opening.height / 2
        const top = opening.center[1] + opening.height / 2
        const half = opening.width / 2
        if (bottom > floor) pieces.push(blockBetween([x - halfWidth, floor, skinBack], [x + halfWidth, bottom, neighbourFace]))
        if (half < halfWidth) {
          pieces.push(blockBetween([x - halfWidth, bottom, skinBack], [x - half, top, neighbourFace]))
          pieces.push(blockBetween([x + half, bottom, skinBack], [x + halfWidth, top, neighbourFace]))
        }
        if (!opening.shopfront) pieces.push(block([opening.width + 0.14, 0.07, 0.16], [x, bottom - 0.035, neighbourFace + 0.03]))
        floor = top
      }
      pieces.push(blockBetween([x - halfWidth, floor, skinBack], [x + halfWidth, height - 0.35, neighbourFace]))
      cursor = x + halfWidth
    }
    pieces.push(blockBetween([cursor, 0.45, skinBack], [maxX, height - 0.35, neighbourFace]))
  }
  return projectWorldUVs(merge(pieces), concreteTile * 1.5)
}

function windowFrameGeometry(openings: readonly WindowOpening[]): BufferGeometry {
  const pieces: BufferGeometry[] = []
  for (const { center, width, height, shopfront: isShop } of openings) {
    const [x, y, z] = center
    const depth = 0.08
    const frameZ = z + 0.01
    pieces.push(block([width, frameWidth, depth], [x, y + height / 2 - frameWidth / 2, frameZ]))
    pieces.push(block([width, frameWidth, depth], [x, y - height / 2 + frameWidth / 2, frameZ]))
    pieces.push(block([frameWidth, height, depth], [x - width / 2 + frameWidth / 2, y, frameZ]))
    pieces.push(block([frameWidth, height, depth], [x + width / 2 - frameWidth / 2, y, frameZ]))
    pieces.push(block([0.045, height, depth * 0.8], [x, y, frameZ]))
    if (isShop) pieces.push(block([width, 0.05, depth * 0.8], [x, y + height / 2 - 0.55, frameZ]))
    else pieces.push(block([width - 0.1, 0.045, depth * 0.8], [x, y + height * 0.22, frameZ]))
  }
  return merge(pieces)
}

const windowVertexShader = `
attribute vec3 aStyle;
varying vec2 vUv;
varying vec3 vTint;
varying vec3 vStyle;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vStyle = aStyle;
  vTint = instanceColor;
  vec4 world = modelMatrix * instanceMatrix * vec4( position, 1.0 );
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

const windowFragmentShader = `
uniform vec3 uReflection;
uniform float uLevel;
varying vec2 vUv;
varying vec3 vTint;
varying vec3 vStyle;
varying vec3 vWorld;
#include <fog_pars_fragment>
void main() {
  float lit = max( max( vTint.r, vTint.g ), vTint.b );
  float ceilingWash = 0.45 + 0.55 * smoothstep( 0.05, 0.95, vUv.y );
  float lampSpot = exp( -pow( ( vUv.x - vStyle.z ) * 3.2, 2.0 ) - pow( ( vUv.y - 0.86 ) * 4.0, 2.0 ) ) * 0.6;
  vec3 interior = vTint * ( ceilingWash + lampSpot );
  float blindEdge = 1.0 - vStyle.x;
  float blind = smoothstep( blindEdge - 0.004, blindEdge + 0.004, vUv.y );
  float slats = 0.7 + 0.3 * smoothstep( 0.35, 0.65, abs( fract( vUv.y * 26.0 ) - 0.5 ) * 2.0 );
  interior = mix( interior, vTint * 0.42 * slats, blind );
  float drape = vStyle.y * ( 1.0 - smoothstep( 0.08, 0.24, vUv.x ) + smoothstep( 0.76, 0.92, vUv.x ) );
  interior *= 1.0 - 0.55 * drape;
  vec3 view = normalize( vWorld - cameraPosition );
  float grazing = pow( 1.0 - abs( view.z ), 2.5 );
  float skyward = smoothstep( 0.0, 1.0, vUv.y );
  vec3 reflection = uReflection * ( 0.35 + 0.65 * grazing ) * ( 0.7 + 0.3 * skyward ) * ( 1.0 - 0.75 * min( lit * 3.0, 1.0 ) );
  gl_FragColor = vec4( interior * uLevel + reflection, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

interface NeighbourWindows {
  mesh: InstancedMesh
  reflection: Color
  level: { value: number }
}

function neighbourWindows(openings: readonly WindowOpening[]): NeighbourWindows {
  const random = createRandom(77)
  const warmLamps = ['#FFB25E', '#FFC27A', '#FFD49A', '#F2A65A'].map((hex) => new Color(hex))
  const screenGlow = new Color('#8FA6E8')
  const dark = new Color('#020304')
  const matrices: Matrix4[] = []
  const colors: Color[] = []
  const styles: number[] = []
  for (const { center, width, height, shopfront: isShop } of openings) {
    matrices.push(composeMatrix(center, [0, 0, 0], [width - frameWidth, height - frameWidth, 1]))
    const roll = random()
    const litChance = isShop ? 0.2 : 0.18
    const tint = roll < litChance
      ? warmLamps[Math.floor(random() * warmLamps.length)].clone().multiplyScalar(0.06 + random() * 0.1)
      : roll < litChance + 0.06
        ? screenGlow.clone().multiplyScalar(0.035 + random() * 0.035)
        : dark
    colors.push(tint)
    const blinds = random() < 0.45 ? 0.15 + random() * 0.55 : 0
    styles.push(isShop ? Math.min(blinds, 0.25) : blinds, random() < 0.35 ? 1 : 0, 0.25 + random() * 0.5)
  }
  const geometry = new PlaneGeometry(1, 1)
  geometry.setAttribute('aStyle', new InstancedBufferAttribute(new Float32Array(styles), 3))
  const reflection = new Color()
  const level = { value: 1 }
  const material = new ShaderMaterial({
    uniforms: { ...UniformsUtils.clone(UniformsLib.fog), uReflection: { value: reflection }, uLevel: level },
    vertexShader: windowVertexShader,
    fragmentShader: windowFragmentShader,
    fog: true,
  })
  return { mesh: instances(geometry, material, matrices, colors), reflection, level }
}

function wetReflectionGeometry(): BufferGeometry {
  const lift = 0.004
  const roadDepth = streetFarZ - kerbZ - 0.25
  const pavementDepth = kerbZ - half
  return merge([
    place(new PlaneGeometry(streetHalfWidth * 2, roadDepth), [0, roadY + lift, kerbZ + 0.25 + roadDepth / 2], [-Math.PI / 2, 0, 0]),
    place(new PlaneGeometry(streetHalfWidth * 2, pavementDepth), [0, lift, half + pavementDepth / 2], [-Math.PI / 2, 0, 0]),
  ])
}

function createWetReflections(wetness: Texture): { mesh: Mesh; material: ShaderMaterial } {
  const material = new ShaderMaterial({
    uniforms: {
      uSources: { value: reflectionSources.map(({ position, strength }) => new Vector4(...position, strength)) },
      uSpread: { value: reflectionSources.map(({ spread }) => spread) },
      uColor: { value: new Color(palette.warm) },
      uIntensity: { value: 1 },
      uFogDensity: { value: 0 },
      uWetness: { value: wetness },
      uWetnessFrame: { value: [-streetHalfWidth, streetFarZ, asphaltTile] },
    },
    vertexShader: reflectionVertexShader,
    fragmentShader: reflectionFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  })
  const mesh = new Mesh(wetReflectionGeometry(), material)
  mesh.renderOrder = 1
  return { mesh, material }
}

export const createTower: FloorFactory = (context) => {
  const { textures, renderer } = context
  const root = new Group()
  root.name = 'street'

  const slabSurface = createSlabTextures()
  const asphalt = createWetAsphaltTextures()
  const anisotropy = Math.min(anisotropyLevel, renderer.capabilities.getMaxAnisotropy())
  for (const texture of [slabSurface.map, slabSurface.roughnessMap, asphalt.map, asphalt.roughnessMap]) {
    texture.anisotropy = anisotropy
  }
  const glow = createGlowTexture()
  const ownedTextures = [slabSurface.map, slabSurface.roughnessMap, asphalt.map, asphalt.roughnessMap, glow]

  const shell = new Mesh(shellGeometry(), wornConcreteMaterial(textures, groundWear))
  const slabParts = splitByFacing(slabGeometry())
  const slabs = new Mesh(slabParts.rest, wornConcreteMaterial(textures, groundWear))
  const slabTops = new Mesh(
    slabParts.up,
    wornConcreteMaterial(textures, groundWear, { map: slabSurface.map, roughnessMap: slabSurface.roughnessMap, normalMap: null }),
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

  const washFaces = 3
  const washMatrices = Array.from({ length: indexedFloorCount * washFaces }, (_, index) => {
    const floor = Math.floor(index / washFaces)
    const face = index % washFaces
    const y = floor * storey + storey / 2
    const height = storey - slab - 0.3
    const span = half * 2 - 0.6
    if (face === 0) return composeMatrix([0, y, -half + interiorWashInset], [0, 0, 0], [span, height, 1])
    const side = face === 1 ? -1 : 1
    return composeMatrix([side * (half - interiorWashInset), y, 0], [0, Math.PI / 2, 0], [span, height, 1])
  })
  const interiorWash: InstancedMesh = instances(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false, side: DoubleSide }),
    washMatrices,
    washMatrices.map(() => new Color(0x000000)),
  )
  interiorWash.renderOrder = 1

  const doorEmitter = createEmitter(palette.warm, 1.6)
  const door = new Mesh(doorGeometry(), doorEmitter.material)

  const road = new Mesh(
    scaleUVs(
      place(new PlaneGeometry(streetHalfWidth * 2, streetFarZ - kerbZ - 0.25), [0, roadY, (kerbZ + 0.25 + streetFarZ) / 2], [-Math.PI / 2, 0, 0]),
      (streetHalfWidth * 2) / 8,
      (streetFarZ - kerbZ) / 8,
    ),
    new MeshStandardMaterial({ map: asphalt.map, roughnessMap: asphalt.roughnessMap, roughness: 1, metalness: 0 }),
  )
  const wetReflections = createWetReflections(asphalt.roughnessMap)
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
  const furniture = new Mesh(streetFurnitureGeometry(), steelMaterial({ color: '#2A2E35', roughness: 0.4 }))
  furniture.castShadow = true
  const lampEmitter = createEmitter(palette.warm, 2.4)
  const lampHeads = instances(
    new BoxGeometry(0.42, 0.02, 0.22),
    lampEmitter.material,
    lampXs.map((x) => composeMatrix([x, 4.955, lampZ + 1.05])),
  )

  const openings = neighbourOpenings()
  const neighbours = new Mesh(neighbourGeometry(openings), wornConcreteMaterial(textures, groundWear, { color: '#9C9A96' }))
  const neighbourFrames = new Mesh(windowFrameGeometry(openings), steelMaterial({ color: '#2C2F34', metalness: 0.4, roughness: 0.5 }))
  const windows = neighbourWindows(openings)

  for (const mesh of [shell, slabs, slabTops, facade, neighbours]) {
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
    slabTops,
    facade,
    steelDetail,
    glass,
    strips,
    interiorWash,
    door,
    road,
    wetReflections.mesh,
    markings,
    pools,
    lamps,
    lampHeads,
    furniture,
    neighbours,
    neighbourFrames,
    windows.mesh,
    ...proxies.map((proxy) => proxy.object),
  )

  function update(frame: FrameState): void {
    const { world, dt, reducedMotion, progress } = frame
    const interior = smoothstep(chapterIndex.frontend - 1, chapterIndex.frontend, progress.smooth) * (1 - smoothstep(chapterIndex.aiProducts, chapterIndex.aiCoding, progress.smooth))
    const underDeck = smoothstep(chapterIndex.aiCoding - 0.85, chapterIndex.aiCoding - 0.25, progress.smooth) * (1 - smoothstep(chapterIndex.aiCoding + 0.35, chapterIndex.aiCoding + 0.95, progress.smooth))
    const edgeLevel = (1 - interiorEdgeDimming * interior) * (1 - underDeck)
    const washLevel = (1 - interior) * (1 - underDeck)
    for (let floor = 0; floor < indexedFloorCount; floor += 1) {
      indexEmphasis[floor] = reducedMotion ? indexTarget[floor] : approach(indexEmphasis[floor], indexTarget[floor], 10, dt)
      const lit = smoothstep(0, 1, world.floorsLit - floor)
      const intensity = (0.05 + lit * 0.8) * edgeLevel + indexEmphasis[floor] * 1.2
      stripScratch.copy(stripColor).multiplyScalar(intensity)
      for (let face = 0; face < 3; face += 1) strips.setColorAt(floor * 3 + face, stripScratch)
      stripScratch.copy(stripColor).multiplyScalar((lit * interiorWashStrength + indexEmphasis[floor] * 0.2) * washLevel)
      for (let face = 0; face < washFaces; face += 1) interiorWash.setColorAt(floor * washFaces + face, stripScratch)
    }
    if (strips.instanceColor) strips.instanceColor.needsUpdate = true
    if (interiorWash.instanceColor) interiorWash.instanceColor.needsUpdate = true

    const daylight = 1 - world.dawn * 0.45
    doorEmitter.set(1.6 * daylight)
    lampEmitter.set(2.4 * daylight)
    poolMaterial.color.set(palette.warm).multiplyScalar(0.55 * daylight)
    wetReflections.material.uniforms.uIntensity.value = reflectionStrength * daylight
    const fog = context.scene.fog instanceof FogExp2 ? context.scene.fog : null
    wetReflections.material.uniforms.uFogDensity.value = fog ? fog.density : 0
    if (fog) windows.reflection.copy(fog.color).multiplyScalar(0.7)
    windows.level.value = 1 - world.dawn * 0.55
  }

  function dispose(): void {
    disposeTree(root)
    for (const texture of ownedTextures) texture.dispose()
  }

  return { id: 'street', root, proxies, update, dispose }
}
