import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  ShaderMaterial,
  Shape,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type ColorRepresentation,
} from 'three'
import { block, blockBetween, composeMatrix, createRandom, cylinderBetween, instances, merge, place, projectWorldUVs, strut, tintVertices } from '../geometry'
import type { FloorFactory, FrameState, InteractiveProxy, Vec3 } from '../types'
import {
  approach,
  chapterIndex,
  concreteMaterial,
  createEmitter,
  createProxy,
  disposeTree,
  emphasisOf,
  floorBase,
  palette,
  patchSurface,
  smoothstep,
  towerSpec,
} from './kit'
import { createSceneClock, paintedSteelMaterial } from './kit-upper'

const deck = { minX: towerSpec.halfSize + towerSpec.wallThickness, maxX: 15, halfDepth: 4 } as const
const kerbHeight = 0.15
const padTop = 0.3
const padRadius = 1.5
const rocketBase: Vec3 = [11, padTop, 0]
const launchTower = { x: 13.4, z: -2.2, half: 0.55, top: 11, bay: 1.35 } as const
const maxLift = 34
const exhaustPuffCount = 30
const ventPuffCount = 10
const flareHoldSeconds = 2.4
const flareAttack = 2.2
const flareRelease = 1.4
const flameCoreLength = 2.6
const plumeLength = 4.6
const exhaustIntensity = 60
const scorchRadius = 3.4

interface Puff {
  angle: number
  reach: number
  rise: number
  size: number
  phase: number
}

const padScorchHeader = `
uniform vec3 uScorchCentre;
uniform float uScorchRadius;
`

const padScorchAlbedo = `
  float scorchField = surfaceFbm( vSurfacePosition * 1.3 );
  float scorchReach = length( vSurfacePosition.xz - uScorchCentre.xz ) / uScorchRadius;
  float scorchStreak = surfaceNoise( vec3( atan( vSurfacePosition.z - uScorchCentre.z, vSurfacePosition.x - uScorchCentre.x + 1e-5 ) * 7.0, 0.0, scorchReach * 2.0 ) );
  float scorch = 1.0 - smoothstep( 0.25, 1.0, scorchReach + ( scorchField - 0.5 ) * 0.5 - scorchStreak * 0.18 );
  float scorchHeight = 1.0 - smoothstep( 0.0, 0.9, vSurfacePosition.y - uScorchCentre.y );
  scorch *= scorchHeight;
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.16, 0.14, 0.13 ), scorch );
  float scorchRing = smoothstep( 0.55, 0.75, scorchReach ) * ( 1.0 - smoothstep( 0.75, 1.0, scorchReach ) ) * scorchHeight;
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.2, 0.17, 0.15 ), scorchRing * 0.35 * scorchField );
`

const padScorchRoughness = `
  roughnessFactor = mix( roughnessFactor, 0.9, scorch * 0.7 );
`

const skinVaryings = `
varying vec3 vSkinPosition;
`

const skinFragment = `
  float skinPanel = 1.0 - smoothstep( 0.0, 0.006, abs( fract( vSkinPosition.y / 0.62 ) - 0.5 ) - 0.494 );
  float skinAngle = atan( vSkinPosition.z, vSkinPosition.x + 1e-5 );
  float skinSeam = 1.0 - smoothstep( 0.0, 0.01, abs( fract( skinAngle / 6.2831853 * 8.0 ) - 0.5 ) - 0.49 );
  float skinSoot = 1.0 - smoothstep( 0.6, 2.4, vSkinPosition.y + sin( skinAngle * 9.0 ) * 0.25 );
  float skinStreak = smoothstep( 0.55, 0.95, fract( sin( floor( skinAngle * 18.0 ) * 43.7 ) * 921.3 ) ) * ( 1.0 - smoothstep( 0.8, 4.5, vSkinPosition.y ) );
  diffuseColor.rgb *= 1.0 - max( skinPanel, skinSeam ) * 0.35;
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.05, 0.045, 0.04 ), clamp( skinSoot * 0.85 + skinStreak * 0.3, 0.0, 0.9 ) );
`

const skinRoughness = `
  roughnessFactor = mix( roughnessFactor, 0.8, clamp( skinSoot + skinStreak * 0.5, 0.0, 1.0 ) );
`

function rocketSkinMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: '#D7D3CA', metalness: 0.1, roughness: 0.36, emissive: palette.warm, emissiveIntensity: 0 })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${skinVaryings}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinPosition = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${skinVaryings}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${skinFragment}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${skinRoughness}`)
  }
  material.customProgramCacheKey = () => 'rocket-skin'
  return material
}

function deckConcreteGeometry(): BufferGeometry {
  const { minX, maxX, halfDepth } = deck
  return projectWorldUVs(
    merge([
      blockBetween([minX, -towerSpec.slabThickness, -halfDepth], [maxX, 0, halfDepth]),
      blockBetween([maxX - 0.15, 0, -halfDepth], [maxX, kerbHeight, halfDepth]),
      blockBetween([minX, 0, -halfDepth], [maxX - 0.15, kerbHeight, -halfDepth + 0.15]),
      blockBetween([minX, 0, halfDepth - 0.15], [maxX - 0.15, kerbHeight, halfDepth]),
      place(new CylinderGeometry(padRadius, padRadius + 0.1, padTop, 48), [rocketBase[0], padTop / 2, rocketBase[2]]),
    ]),
    2.4,
  )
}

function launchTowerGeometry(): BufferGeometry[] {
  const { x, z, half, top, bay } = launchTower
  const corners: readonly (readonly [number, number])[] = [[-half, -half], [half, -half], [half, half], [-half, half]]
  const pieces: BufferGeometry[] = []
  for (const [dx, dz] of corners) {
    const height = top - padTop
    pieces.push(block([0.12, height, 0.012], [x + dx, (top + padTop) / 2, z + dz - Math.sign(dz) * 0.054]))
    pieces.push(block([0.012, height, 0.12], [x + dx - Math.sign(dx) * 0.054, (top + padTop) / 2, z + dz]))
    pieces.push(block([0.3, 0.02, 0.3], [x + dx, padTop + 0.01, z + dz]))
  }
  for (let y = padTop; y < top - 0.1; y += bay) {
    const next = Math.min(top, y + bay)
    corners.forEach(([dx, dz], corner) => {
      const [nx, nz] = corners[(corner + 1) % corners.length]
      pieces.push(strut([x + dx, next, z + dz], [x + nx, next, z + nz], 0.07))
      pieces.push(strut([x + dx, y + 0.05, z + dz], [x + nx, next - 0.05, z + nz], 0.045))
      pieces.push(block([0.1, 0.1, 0.012], [x + dx, next - 0.08, z + dz]))
    })
  }
  pieces.push(block([1.7, 0.08, 1.7], [x, top, z]))
  for (const side of [-1, 1]) pieces.push(block([1.7, 0.6, 0.03], [x, top + 0.34, z + side * 0.835]))
  pieces.push(block([0.03, 0.6, 1.7], [x + 0.835, top + 0.34, z]))
  for (let rung = 0; rung < Math.floor((top - padTop) / 0.3); rung += 1) {
    pieces.push(block([0.4, 0.025, 0.025], [x - half - 0.12, padTop + 0.25 + rung * 0.3, z]))
  }
  for (const side of [-1, 1]) pieces.push(block([0.03, top - padTop, 0.03], [x - half - 0.12, (top + padTop) / 2, z + side * 0.2]))
  for (const y of [5.5, 8]) {
    const reachX = rocketBase[0] + 0.5
    const reachZ = rocketBase[2] - 0.35
    pieces.push(strut([x - half, y, z + half], [reachX, y, reachZ], 0.16))
    pieces.push(strut([x - half, y - 0.45, z + half], [reachX, y - 0.08, reachZ], 0.06))
    pieces.push(block([0.5, 0.06, 0.6], [rocketBase[0] + 0.62, y - 0.08, rocketBase[2] - 0.45]))
    pieces.push(place(new CylinderGeometry(0.12, 0.12, 0.24, 12), [x - half, y, z + half]))
  }
  return pieces
}

function deckSteelGeometry(): BufferGeometry {
  const { minX, maxX, halfDepth } = deck
  const pieces: BufferGeometry[] = []
  for (const side of [-1, 1]) {
    const z = side * (halfDepth - 0.6)
    pieces.push(block([maxX - minX - 0.2, 0.5, 0.025], [(minX + maxX) / 2, -0.6, z]))
    pieces.push(block([maxX - minX - 0.2, 0.02, 0.25], [(minX + maxX) / 2, -0.36, z]))
    pieces.push(block([maxX - minX - 0.2, 0.02, 0.25], [(minX + maxX) / 2, -0.84, z]))
    pieces.push(strut([minX + 0.1, -4.2, z], [12.5, -0.85, z], 0.22))
    pieces.push(block([0.1, 4.2, 0.6], [minX + 0.05, -2.3, z]))
    for (let x = minX + 0.6; x < maxX - 0.3; x += 0.9) pieces.push(block([0.016, 0.44, 0.2], [x, -0.6, z]))
    const railZ = side * (halfDepth - 0.05)
    for (let x = minX + 1; x <= maxX; x += 1.1) {
      pieces.push(cylinderBetween([x, kerbHeight, railZ], [x, kerbHeight + 1.1, railZ], 0.025, 8))
      pieces.push(place(new CylinderGeometry(0.06, 0.06, 0.012, 12), [x, kerbHeight + 0.006, railZ]))
    }
    pieces.push(cylinderBetween([minX, kerbHeight + 1.25, railZ], [maxX - 0.05, kerbHeight + 1.25, railZ], 0.028, 10))
    pieces.push(cylinderBetween([minX, kerbHeight + 0.7, railZ], [maxX - 0.05, kerbHeight + 0.7, railZ], 0.016, 8))
  }
  for (const x of [10, 13]) pieces.push(block([0.25, 0.4, halfDepth * 2 - 1], [x, -0.55, 0]))
  for (let z = -halfDepth; z <= halfDepth; z += 1) {
    pieces.push(cylinderBetween([maxX - 0.05, kerbHeight, z], [maxX - 0.05, kerbHeight + 1.1, z], 0.025, 8))
  }
  pieces.push(cylinderBetween([maxX - 0.05, kerbHeight + 1.25, -halfDepth], [maxX - 0.05, kerbHeight + 1.25, halfDepth], 0.028, 10))
  pieces.push(cylinderBetween([maxX - 0.05, kerbHeight + 0.7, -halfDepth], [maxX - 0.05, kerbHeight + 0.7, halfDepth], 0.016, 8))
  for (const [dx, dz] of [[0.55, 0], [-0.55, 0], [0, 0.55], [0, -0.55]] as const) {
    pieces.push(block([0.18, 0.3, 0.18], [rocketBase[0] + dx, padTop + 0.15, rocketBase[2] + dz]))
    pieces.push(block([0.26, 0.03, 0.26], [rocketBase[0] + dx, padTop + 0.015, rocketBase[2] + dz]))
  }
  pieces.push(place(new TorusGeometry(padRadius - 0.12, 0.05, 8, 48), [rocketBase[0], padTop + 0.02, rocketBase[2]], [Math.PI / 2, 0, 0]))
  for (let vane = 0; vane < 16; vane += 1) {
    const angle = (vane / 16) * Math.PI * 2
    const inner: Vec3 = [rocketBase[0] + Math.cos(angle) * 0.75, padTop + 0.01, rocketBase[2] + Math.sin(angle) * 0.75]
    const outer: Vec3 = [rocketBase[0] + Math.cos(angle) * (padRadius - 0.15), padTop + 0.01, rocketBase[2] + Math.sin(angle) * (padRadius - 0.15)]
    pieces.push(strut(inner, outer, 0.04))
  }
  return merge([...pieces, ...launchTowerGeometry()])
}

function rocketBodyGeometry(): BufferGeometry {
  const profile = [
    [0, 0.85], [0.3, 0.85], [0.42, 1], [0.42, 6.3], [0.41, 6.7], [0.36, 7.3],
    [0.26, 7.95], [0.14, 8.45], [0.04, 8.8], [0, 8.9],
  ].map(([radius, height]) => new Vector2(radius, height))
  return new LatheGeometry(profile, 48)
}

function rocketTrimGeometry(): BufferGeometry {
  const fin = new Shape([new Vector2(0.4, 0.15), new Vector2(1.2, -0.05), new Vector2(1.2, 0.55), new Vector2(0.4, 2.7)])
  const pieces: BufferGeometry[] = [new CylinderGeometry(0.22, 0.34, 0.8, 32, 1, true).translate(0, 0.45, 0)]
  for (let index = 0; index < 4; index += 1) {
    const finGeometry = new ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 }).translate(0, 0, -0.03)
    pieces.push(place(finGeometry, [0, 0, 0], [0, (index * Math.PI) / 2 + Math.PI / 4, 0]))
  }
  for (const y of [1.05, 3.7, 6.3]) pieces.push(place(new TorusGeometry(0.425, 0.03, 8, 48), [0, y, 0], [Math.PI / 2, 0, 0]))
  pieces.push(new CylinderGeometry(0.26, 0.2, 0.18, 32, 1, true).translate(0, 0.02, 0))
  return merge(pieces)
}

const flameVertexShader = `
attribute float aFalloff;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vTint;
varying float vFalloff;
void main() {
  vUv = uv;
  vTint = color;
  vFalloff = aFalloff;
  vec4 viewPosition = modelViewMatrix * vec4( position, 1.0 );
  vNormal = normalize( normalMatrix * normal );
  vView = normalize( -viewPosition.xyz );
  gl_Position = projectionMatrix * viewPosition;
}
`

const flameFragmentShader = `
uniform float uIntensity;
uniform float uTime;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vTint;
varying float vFalloff;
float flameHash( vec2 cell ) {
  return fract( sin( dot( cell, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
float flameNoise( vec2 point ) {
  vec2 cell = floor( point );
  vec2 blend = fract( point );
  blend = blend * blend * ( 3.0 - 2.0 * blend );
  return mix( mix( flameHash( cell ), flameHash( cell + vec2( 1.0, 0.0 ) ), blend.x ), mix( flameHash( cell + vec2( 0.0, 1.0 ) ), flameHash( cell + vec2( 1.0, 1.0 ) ), blend.x ), blend.y );
}
void main() {
  float along = clamp( vUv.y, 0.0, 1.0 );
  float edge = pow( abs( dot( normalize( vNormal ), normalize( vView ) ) ), 1.3 );
  float turbulence = flameNoise( vec2( vUv.x * 10.0, along * 5.0 + uTime * 0.7 ) );
  float shock = 0.88 + 0.12 * smoothstep( 0.3, 0.7, sin( along * 26.0 ) );
  float alpha = pow( along, vFalloff ) * edge * uIntensity * ( 0.85 + 0.15 * turbulence ) * shock;
  gl_FragColor = vec4( vTint * alpha, min( alpha, 1.0 ) );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

interface FlameMaterial extends ShaderMaterial {
  uniforms: {
    uIntensity: { value: number }
    uTime: { value: number }
  }
}

function createFlameMaterial(): FlameMaterial {
  return new ShaderMaterial({
    uniforms: { uIntensity: { value: 0 }, uTime: { value: 0 } },
    vertexColors: true,
    vertexShader: flameVertexShader,
    fragmentShader: flameFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  }) as FlameMaterial
}

interface FlameLayer {
  radius: number
  length: number
  color: ColorRepresentation
  strength: number
  falloff: number
}

const flameLayers: readonly FlameLayer[] = [
  { radius: 0.28, length: flameCoreLength, color: '#FFD9A8', strength: 1.5, falloff: 1.1 },
  { radius: 0.55, length: plumeLength, color: palette.fusion, strength: 0.85, falloff: 1.7 },
]

function flameGeometry(): BufferGeometry {
  return merge(
    flameLayers.map((layer) => {
      const cone = tintVertices(
        place(new ConeGeometry(layer.radius, layer.length, 28, 1, true), [0, -layer.length / 2, 0], [Math.PI, 0, 0]),
        new Color(layer.color).multiplyScalar(layer.strength),
      )
      const count = cone.getAttribute('position').count
      cone.setAttribute('aFalloff', new Float32BufferAttribute(new Float32Array(count).fill(layer.falloff), 1))
      return cone
    }),
  )
}

const smokeVertexShader = `
attribute float aShade;
attribute float aOpacity;
varying vec2 vUv;
varying float vShade;
varying float vOpacity;
varying float vHeight;
void main() {
  vUv = uv;
  vShade = aShade;
  vOpacity = aOpacity;
  vec4 centre = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  float size = length( instanceMatrix[ 0 ].xyz );
  vHeight = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).y;
  centre.xy += position.xy * size;
  gl_Position = projectionMatrix * centre;
}
`

const smokeFragmentShader = `
uniform vec3 uShadow;
uniform vec3 uLit;
uniform vec3 uGlow;
uniform float uGlowAmount;
uniform float uGlowHeight;
varying vec2 vUv;
varying float vShade;
varying float vOpacity;
varying float vHeight;
float smokeHash( vec2 cell ) {
  return fract( sin( dot( cell, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}
float smokeNoise( vec2 point ) {
  vec2 cell = floor( point );
  vec2 blend = fract( point );
  blend = blend * blend * ( 3.0 - 2.0 * blend );
  return mix( mix( smokeHash( cell ), smokeHash( cell + vec2( 1.0, 0.0 ) ), blend.x ), mix( smokeHash( cell + vec2( 0.0, 1.0 ) ), smokeHash( cell + vec2( 1.0, 1.0 ) ), blend.x ), blend.y );
}
void main() {
  vec2 centred = vUv - 0.5;
  float radius = length( centred ) * 2.0;
  float billow = smokeNoise( vUv * 4.0 + vShade * 17.0 ) * 0.6 + smokeNoise( vUv * 9.0 - vShade * 5.0 ) * 0.4;
  float density = ( 1.0 - smoothstep( 0.35, 1.0, radius + ( billow - 0.5 ) * 0.5 ) ) * vOpacity;
  if ( density < 0.003 ) discard;
  float topLight = smoothstep( -0.5, 0.5, centred.y + ( billow - 0.5 ) * 0.4 );
  vec3 color = mix( uShadow, uLit, topLight * ( 0.55 + 0.45 * vShade ) );
  float underGlow = ( 1.0 - smoothstep( 0.0, uGlowHeight, vHeight ) ) * ( 1.0 - topLight * 0.6 );
  color += uGlow * uGlowAmount * underGlow;
  gl_FragColor = vec4( color, density );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

interface SmokeCloud {
  mesh: InstancedMesh
  material: ShaderMaterial
  glow: Color
  opacity: InstancedBufferAttribute
}

function createSmokeCloud(count: number, seed: number, worldBaseY: number): SmokeCloud {
  const random = createRandom(seed)
  const geometry = new PlaneGeometry(1, 1)
  const shades = new Float32Array(count).map(() => random())
  const opacity = new InstancedBufferAttribute(new Float32Array(count), 1)
  geometry.setAttribute('aShade', new InstancedBufferAttribute(shades, 1))
  geometry.setAttribute('aOpacity', opacity)
  const glow = new Color(palette.fusion)
  const material = new ShaderMaterial({
    uniforms: {
      uShadow: { value: new Color('#16171C') },
      uLit: { value: new Color('#6A6E78') },
      uGlow: { value: glow },
      uGlowAmount: { value: 0 },
      uGlowHeight: { value: worldBaseY + 2.4 },
    },
    vertexShader: smokeVertexShader,
    fragmentShader: smokeFragmentShader,
    transparent: true,
    depthWrite: false,
  })
  const mesh = new InstancedMesh(geometry, material, count)
  mesh.frustumCulled = false
  mesh.renderOrder = 3
  return { mesh, material, glow, opacity }
}

function createPuffs(count: number, seed: number): Puff[] {
  const random = createRandom(seed)
  return Array.from({ length: count }, () => ({ angle: random() * Math.PI * 2, reach: random(), rise: random(), size: random(), phase: random() }))
}

export const createRocketFloor: FloorFactory = (context) => {
  const { textures } = context
  const root = new Group()
  root.name = 'rocket'
  root.position.y = floorBase.rocket

  const scorchCentre = new Vector3(rocketBase[0], floorBase.rocket + padTop, rocketBase[2])
  const deckConcrete = new Mesh(
    deckConcreteGeometry(),
    patchSurface(concreteMaterial(textures), {
      key: 'pad-scorch',
      uniforms: { uScorchCentre: { value: scorchCentre }, uScorchRadius: { value: scorchRadius } },
      fragmentHeader: padScorchHeader,
      albedo: padScorchAlbedo,
      roughness: padScorchRoughness,
    }),
  )
  deckConcrete.castShadow = true
  deckConcrete.receiveShadow = true
  const deckSteel = new Mesh(
    deckSteelGeometry(),
    paintedSteelMaterial({
      paint: '#4A1D19',
      cellsPerMetre: 2.6,
      chipShare: 0.14,
      groundY: floorBase.rocket + kerbHeight,
      grimeHeight: 0.6,
      scorch: { centre: [scorchCentre.x, scorchCentre.y, scorchCentre.z], radius: 4.2, strength: 1 },
    }),
  )
  deckSteel.castShadow = true
  deckSteel.receiveShadow = true

  const rocket = new Group()
  rocket.position.set(...rocketBase)
  const bodyMaterial = rocketSkinMaterial()
  const body = new Mesh(rocketBodyGeometry(), bodyMaterial)
  const trim = new Mesh(
    rocketTrimGeometry(),
    new MeshStandardMaterial({ color: '#8E2620', metalness: 0.2, roughness: 0.46 }),
  )
  body.castShadow = true

  const clock = createSceneClock()
  const flame = new Group()
  flame.position.y = 0.05
  const flameMaterial = createFlameMaterial()
  flame.add(new Mesh(flameGeometry(), flameMaterial))
  const exhaust = new PointLight('#FF6A3D', 0, 24, 2)
  exhaust.position.y = -0.6

  let launchTarget = 0
  let launchEmphasis = 0
  let flareRequested = false
  let flareHoldUntil = Number.NEGATIVE_INFINITY
  let flare = 0
  const proxy: InteractiveProxy = createProxy({
    id: 'rocket-launch',
    chapters: ['stop-ai-coding'],
    geometry: new CylinderGeometry(1, 1, 9.4, 12),
    position: [0, 4.6, 0],
    onState(state) {
      launchTarget = emphasisOf(state)
      if (state === 'active') flareRequested = true
    },
  })
  rocket.add(body, trim, flame, exhaust, proxy.object)

  const exhaustPuffs = createPuffs(exhaustPuffCount, 2203)
  const ventPuffs = createPuffs(ventPuffCount, 4409)
  const exhaustCloud = createSmokeCloud(exhaustPuffCount, 77, floorBase.rocket)
  const ventCloud = createSmokeCloud(ventPuffCount, 91, floorBase.rocket)

  const deckLightPositions: Vec3[] = []
  for (let z = -3.5; z <= 3.5; z += 1.75) deckLightPositions.push([deck.maxX - 0.08, kerbHeight + 0.03, z])
  for (let x = 8.5; x < 14.5; x += 1.8) {
    deckLightPositions.push([x, kerbHeight + 0.03, -deck.halfDepth + 0.08], [x, kerbHeight + 0.03, deck.halfDepth - 0.08])
  }
  const deckLightEmitter = createEmitter(palette.warm, 1.4)
  const deckLights = instances(new BoxGeometry(0.14, 0.05, 0.14), deckLightEmitter.material, deckLightPositions.map((position) => composeMatrix(position)))

  root.add(deckConcrete, deckSteel, rocket, exhaustCloud.mesh, ventCloud.mesh, deckLights)

  const warm = new Color(palette.warm)
  const red = new Color(palette.fusion)
  const deckColor = new Color()
  const puffMatrix = new Matrix4()
  const puffPosition = new Vector3()
  const puffScale = new Vector3()
  const noRotation = new Quaternion()

  function placeExhaust(time: number, amount: number, reducedMotion: boolean): void {
    exhaustPuffs.forEach((puff, index) => {
      const churn = reducedMotion ? 0 : Math.sin(time * 0.35 + puff.phase * 6.28) * 0.12
      const reach = 0.7 + amount * (1.2 + 3.6 * puff.reach)
      puffPosition.set(
        rocketBase[0] + Math.cos(puff.angle + churn * 0.2) * reach,
        padTop + 0.2 + amount * (0.1 + 1.5 * puff.rise) + churn,
        rocketBase[2] + Math.sin(puff.angle + churn * 0.2) * reach,
      )
      puffScale.setScalar(Math.max(1e-3, amount * (1.1 + 1.8 * puff.size)))
      exhaustCloud.mesh.setMatrixAt(index, puffMatrix.compose(puffPosition, noRotation, puffScale))
      exhaustCloud.opacity.setX(index, amount * (0.32 + 0.3 * puff.size))
    })
    exhaustCloud.mesh.instanceMatrix.needsUpdate = true
    exhaustCloud.opacity.needsUpdate = true
  }

  function placeVent(time: number, amount: number): void {
    ventPuffs.forEach((puff, index) => {
      const life = (time * 0.07 + puff.phase) % 1
      const sway = Math.sin(time * 0.21 + puff.phase * 6.28) * 0.15
      puffPosition.set(
        rocketBase[0] + 0.62 + life * 1.6 + sway,
        padTop + 0.35 + life * 2.2 + puff.rise * 0.3,
        rocketBase[2] - 0.2 + life * 0.9 + Math.cos(puff.angle) * 0.2,
      )
      puffScale.setScalar(0.35 + life * 1.5 + puff.size * 0.3)
      ventCloud.mesh.setMatrixAt(index, puffMatrix.compose(puffPosition, noRotation, puffScale))
      ventCloud.opacity.setX(index, amount * 0.22 * Math.sin(Math.PI * life))
    })
    ventCloud.mesh.instanceMatrix.needsUpdate = true
    ventCloud.opacity.needsUpdate = true
  }

  function update(frame: FrameState): void {
    const { world, reducedMotion, dt } = frame
    const time = clock(frame)
    if (flareRequested) {
      flareHoldUntil = time + flareHoldSeconds
      flareRequested = false
    }
    const flareTarget = !reducedMotion && time < flareHoldUntil ? 1 : 0
    flare = approach(flare, flareTarget, flareTarget > flare ? flareAttack : flareRelease, dt)

    const ignition = smoothstep(0.02, 0.16, world.launch)
    const climb = smoothstep(0.16, 1, world.launch)
    const thrust = Math.max(ignition, flare * 0.9)
    const shake = reducedMotion ? 0 : thrust * (1 - climb) * 0.02
    rocket.position.set(
      rocketBase[0] + Math.sin(time * 23) * shake,
      rocketBase[1] + maxLift * climb * climb,
      rocketBase[2] + Math.cos(time * 19) * shake,
    )

    flame.visible = thrust > 0.01
    flame.scale.set(0.7 + thrust * 0.3, 0.25 + thrust * 0.75, 0.7 + thrust * 0.3)
    flameMaterial.uniforms.uIntensity.value = thrust
    flameMaterial.uniforms.uTime.value = time
    exhaust.intensity = exhaustIntensity * thrust

    const settled = 1 - smoothstep(chapterIndex.teaching + 0.3, chapterIndex.about - 0.1, frame.progress.smooth)
    const smokeAmount = Math.max(smoothstep(0.04, 0.4, world.launch) * settled, flare * 0.55)
    exhaustCloud.mesh.visible = smokeAmount > 0.001
    if (exhaustCloud.mesh.visible) placeExhaust(time, smokeAmount, reducedMotion)
    exhaustCloud.material.uniforms.uGlowAmount.value = 0.9 * thrust * (1 - climb)
    const venting = (1 - ignition) * (1 - smoothstep(0.5, 1, world.launch))
    ventCloud.mesh.visible = venting > 0.01
    if (ventCloud.mesh.visible) placeVent(time, venting)

    deckColor.copy(warm).lerp(red, world.red)
    deckLightEmitter.set(0.6 + 1.4 * Math.max(world.practicals, world.red), deckColor)

    launchEmphasis = reducedMotion ? launchTarget : approach(launchEmphasis, launchTarget, 9, dt)
    bodyMaterial.emissiveIntensity = launchEmphasis * 0.12
  }

  function dispose(): void {
    disposeTree(root)
  }

  return { id: 'rocket', root, proxies: [proxy], update, dispose }
}
