import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  InstancedMesh,
  Light,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  Vector4,
  type BufferGeometry,
  type ColorRepresentation,
  type IUniform,
  type Material,
  type MeshBasicMaterialParameters,
  type MeshStandardMaterialParameters,
  type Object3D,
  type Texture,
} from 'three'
import type { ChapterId, ConductorState, FloorId, InteractionState, InteractiveProxy, SharedTextures, Vec3 } from '../types'

export const palette = {
  night: '#0A0E17',
  concrete: '#2B3039',
  steel: '#1A1D23',
  readable: '#E9E5DB',
  warm: '#FFB25E',
  signal: '#2F58FF',
  fusion: '#E5392B',
  dawn: '#F4C9A0',
} as const

export const towerSpec = {
  halfSize: 7,
  wallThickness: 0.4,
  floorHeight: 4,
  slabThickness: 0.35,
  levels: 8,
  roof: 28,
  core: { minX: -7, maxX: -4, minZ: -7, maxZ: -3 },
} as const

export const floorBase: Readonly<Record<Exclude<FloorId, 'street'>, number>> = {
  frontend: 0,
  backend: 4,
  cloud: 8,
  data: 12,
  'ai-core': 16,
  rocket: 20,
  teaching: 24,
  lounge: 28,
  beacon: 28,
}

export const chapterIndex = {
  frontend: 2,
  backend: 3,
  cloud: 4,
  data: 5,
  aiProducts: 6,
  aiCoding: 7,
  teaching: 8,
  about: 9,
  sayHi: 10,
} as const

export const beatsPerSecond = 124 / 60

export type LightLevel = 'practical' | 'screen' | 'street'

export type LightWindow = readonly [riseStart: number, fullStart: number, fullEnd: number, fallEnd: number]

export interface Breath {
  period: number
  depth: number
}

export interface LedgerLight {
  id: string
  lane: number
  window: LightWindow
  position: Vec3
  color: string
  intensity: number
  distance: number
  level: LightLevel
  breath?: Breath
}

export const dataAlarmBreath: Breath = { period: 4, depth: 0.2 }
export const aiCoreBreath: Breath = { period: 4.8, depth: 0.12 }

export const lightLaneCount = 6
export const breathLimits = { minimumPeriod: 3.5, maximumDepth: 0.2 } as const

const fromStart = [-1, -0.5] as const
const toEnd = [11, 11.5] as const

function around(chapter: number): LightWindow {
  return [chapter - 0.85, chapter - 0.15, chapter + 0.15, chapter + 0.85]
}

const frontendHandover = 2.5
const streetWindow: LightWindow = [...fromStart, 2.15, frontendHandover]
const atelierEntry: LightWindow = [1.15, 1.85, 2.15, frontendHandover]
const machineRoom: LightWindow = [frontendHandover, 2.85, 3.15, 3.85]
const morningStreet: LightWindow = [9.15, 9.85, ...toEnd]

const streetDoorLight = { position: [4, 2.4, 8.4], color: palette.warm, intensity: 16, distance: 16, level: 'street' } as const
const streetLampLight = { position: [-8, 4.7, 11.65], color: palette.warm, intensity: 28, distance: 20, level: 'street' } as const
const fillColor = '#B4C0E6'
const facadeFillZ = 6.4

export const lightLedger: readonly LedgerLight[] = [
  { id: 'street-door', lane: 0, window: streetWindow, ...streetDoorLight, position: [...streetDoorLight.position] },
  { id: 'backend-aisle-west', lane: 0, window: machineRoom, position: [-1.3, floorBase.backend + 2.45, -1.6], color: '#C4D4FF', intensity: 12, distance: 10, level: 'practical' },
  { id: 'data-practical', lane: 0, window: around(chapterIndex.data), position: [0.2, floorBase.data + 2.1, 3.4], color: '#BCCBFF', intensity: 13, distance: 13, level: 'practical' },
  { id: 'teaching-practical', lane: 0, window: around(chapterIndex.teaching), position: [0.5, floorBase.teaching + 1.6, 2.5], color: palette.warm, intensity: 7, distance: 12, level: 'practical' },

  { id: 'street-lamp', lane: 1, window: [...fromStart, 1.15, 1.5], ...streetLampLight, position: [...streetLampLight.position] },
  { id: 'frontend-fill', lane: 1, window: [1.5, 1.85, 2.15, frontendHandover], position: [0.8, floorBase.frontend + 2.2, facadeFillZ], color: fillColor, intensity: 7, distance: 16, level: 'practical' },
  { id: 'backend-aisle-east', lane: 1, window: machineRoom, position: [4.6, floorBase.backend + 2.45, -1.6], color: '#C4D4FF', intensity: 12, distance: 10, level: 'practical' },
  { id: 'data-fill', lane: 1, window: around(chapterIndex.data), position: [0.5, floorBase.data + 2.4, facadeFillZ], color: fillColor, intensity: 6, distance: 16, level: 'practical' },
  { id: 'rocket-gantry-fill', lane: 1, window: around(chapterIndex.aiCoding), position: [13.6, floorBase.rocket + 2.4, 4.6], color: '#FF7A5E', intensity: 16, distance: 16, level: 'practical' },
  { id: 'say-hi-door', lane: 1, window: morningStreet, ...streetDoorLight, position: [...streetDoorLight.position] },

  { id: 'frontend-pendants-west', lane: 2, window: streetWindow, position: [-3.6, floorBase.frontend + 2.35, 3.75], color: palette.warm, intensity: 6.5, distance: 7.5, level: 'practical' },
  { id: 'backend-fill', lane: 2, window: machineRoom, position: [1.7, floorBase.backend + 2.2, facadeFillZ], color: fillColor, intensity: 6, distance: 16, level: 'practical' },
  { id: 'data-alarm', lane: 2, window: around(chapterIndex.data), position: [1.4, floorBase.data + 3.25, 0.6], color: palette.fusion, intensity: 2.2, distance: 4.5, level: 'practical', breath: dataAlarmBreath },
  { id: 'rocket-deck-fill', lane: 2, window: around(chapterIndex.aiCoding), position: [9, floorBase.rocket + 1.2, 2.6], color: '#F0604A', intensity: 7, distance: 9, level: 'practical' },
  { id: 'say-hi-lamp', lane: 2, window: morningStreet, ...streetLampLight, position: [...streetLampLight.position] },

  { id: 'frontend-pendants-east', lane: 3, window: streetWindow, position: [3.8, floorBase.frontend + 2.35, 3.75], color: palette.warm, intensity: 6.5, distance: 7.5, level: 'practical' },
  { id: 'cloud-practical', lane: 3, window: around(chapterIndex.cloud), position: [-2.2, floorBase.cloud + 2.5, 1.2], color: '#D2DAFF', intensity: 15, distance: 13, level: 'practical' },
  { id: 'ai-core-signal', lane: 3, window: around(chapterIndex.aiProducts), position: [1.2, floorBase['ai-core'] + 1.9, 0.6], color: '#3D63FF', intensity: 22, distance: 15, level: 'practical', breath: aiCoreBreath },
  { id: 'about-floor-lamp', lane: 3, window: around(chapterIndex.about), position: [6.32, floorBase.lounge + 1.25, 2.75], color: palette.warm, intensity: 7, distance: 9, level: 'practical' },

  { id: 'frontend-practical', lane: 4, window: atelierEntry, position: [0.8, floorBase.frontend + 2.6, 0.6], color: palette.warm, intensity: 8, distance: 12, level: 'practical' },
  { id: 'about-wall-spill', lane: 4, window: around(chapterIndex.about), position: [1.6, floorBase.lounge + 2.4, -2.4], color: '#8FA3D9', intensity: 14, distance: 16, level: 'practical' },
  { id: 'cloud-fill', lane: 4, window: around(chapterIndex.cloud), position: [-2.8, floorBase.cloud + 2.4, facadeFillZ], color: fillColor, intensity: 7, distance: 16, level: 'practical' },
  { id: 'ai-core-fill', lane: 4, window: around(chapterIndex.aiProducts), position: [-2.5, floorBase['ai-core'] + 2.2, facadeFillZ], color: '#9FB2FF', intensity: 5, distance: 14, level: 'practical' },

  { id: 'frontend-screen-spill', lane: 5, window: streetWindow, position: [1, floorBase.frontend + 1.3, -0.9], color: '#E1DDD3', intensity: 3.6, distance: 7.5, level: 'screen' },
  { id: 'cloud-blueprint-glow', lane: 5, window: around(chapterIndex.cloud), position: [1.4, floorBase.cloud + 1.1, -1.5], color: palette.signal, intensity: 2, distance: 6, level: 'practical' },
]

export function lightWeight(window: LightWindow, progress: number): number {
  const [riseStart, fullStart, fullEnd, fallEnd] = window
  const rise = progress < fullStart ? smoothstep(riseStart, fullStart, progress) : 1
  const fall = progress > fullEnd ? 1 - smoothstep(fullEnd, fallEnd, progress) : 1
  return rise * fall
}

export function breathing(breath: Breath | undefined, time: number): number {
  if (!breath) return 1
  return 1 + breath.depth * Math.sin((time / breath.period) * Math.PI * 2)
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function smoothstep(edgeStart: number, edgeEnd: number, value: number): number {
  const t = clamp01((value - edgeStart) / (edgeEnd - edgeStart))
  return t * t * (3 - 2 * t)
}

export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

export const detailReach = 1.6

export function nearChapter(progress: ConductorState, index: number, reach = detailReach): boolean {
  return Math.abs(progress.smooth - index) < reach
}

export function chapterReveal(progress: ConductorState, index: number): number {
  return clamp01(progress.smooth - (index - 0.5))
}

export function beatEnvelope(time: number): number {
  const phase = (time * beatsPerSecond) % 1
  return Math.exp(-phase * 6)
}

export function emphasisOf(state: InteractionState): number {
  if (state === 'active') return 1
  if (state === 'hover' || state === 'focused') return 0.6
  return 0
}

export interface SurfacePatch {
  key: string
  uniforms?: Record<string, IUniform>
  fragmentHeader?: string
  albedo?: string
  roughness?: string
}

const surfaceVaryings = `
varying vec3 vSurfacePosition;
varying vec3 vSurfaceNormal;
`

const surfaceVertex = `
vec4 surfacePosition = vec4( transformed, 1.0 );
vec3 surfaceNormal = objectNormal;
#ifdef USE_INSTANCING
  surfacePosition = instanceMatrix * surfacePosition;
  surfaceNormal = mat3( instanceMatrix ) * surfaceNormal;
#endif
vSurfacePosition = ( modelMatrix * surfacePosition ).xyz;
vSurfaceNormal = normalize( mat3( modelMatrix ) * surfaceNormal );
`

const surfaceNoise = `
float surfaceHash( vec3 point ) {
  point = fract( point * 0.3183099 + 0.1 );
  point *= 17.0;
  return fract( point.x * point.y * point.z * ( point.x + point.y + point.z ) );
}
float surfaceNoise( vec3 point ) {
  vec3 cell = floor( point );
  vec3 blend = fract( point );
  blend = blend * blend * ( 3.0 - 2.0 * blend );
  float near = mix(
    mix( surfaceHash( cell ), surfaceHash( cell + vec3( 1.0, 0.0, 0.0 ) ), blend.x ),
    mix( surfaceHash( cell + vec3( 0.0, 1.0, 0.0 ) ), surfaceHash( cell + vec3( 1.0, 1.0, 0.0 ) ), blend.x ),
    blend.y
  );
  float far = mix(
    mix( surfaceHash( cell + vec3( 0.0, 0.0, 1.0 ) ), surfaceHash( cell + vec3( 1.0, 0.0, 1.0 ) ), blend.x ),
    mix( surfaceHash( cell + vec3( 0.0, 1.0, 1.0 ) ), surfaceHash( cell + vec3( 1.0, 1.0, 1.0 ) ), blend.x ),
    blend.y
  );
  return mix( near, far, blend.z );
}
float surfaceFbm( vec3 point ) {
  return surfaceNoise( point ) * 0.55 + surfaceNoise( point * 2.07 + 13.1 ) * 0.3 + surfaceNoise( point * 4.31 + 7.7 ) * 0.15;
}
`

export function patchSurface<T extends MeshStandardMaterial>(material: T, patch: SurfacePatch): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, patch.uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${surfaceVaryings}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${surfaceVertex}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${surfaceVaryings}${surfaceNoise}${patch.fragmentHeader ?? ''}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${patch.albedo ?? ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${patch.roughness ?? ''}`)
  }
  material.customProgramCacheKey = () => patch.key
  return material
}

export interface SurfaceBreakup {
  cellsPerMetre: number
  roughnessSwing: number
  albedoSwing: number
  verticalStretch: number
}

export function withSurfaceBreakup<T extends MeshStandardMaterial>(material: T, breakup: SurfaceBreakup): T {
  return patchSurface(material, {
    key: 'surface-breakup',
    uniforms: {
      uBreakup: { value: new Vector4(breakup.cellsPerMetre, breakup.roughnessSwing, breakup.albedoSwing, breakup.verticalStretch) },
    },
    fragmentHeader: 'uniform vec4 uBreakup;\n',
    albedo: `
      vec3 breakupScale = vec3( uBreakup.x, uBreakup.x / uBreakup.w, uBreakup.x );
      float breakupField = surfaceFbm( vSurfacePosition * breakupScale );
      float breakupFine = surfaceNoise( vSurfacePosition * uBreakup.x * 11.0 );
      diffuseColor.rgb *= 1.0 + ( breakupField - 0.5 ) * 2.0 * uBreakup.z;
    `,
    roughness: `
      roughnessFactor = clamp( roughnessFactor + ( breakupField - 0.5 ) * 2.0 * uBreakup.y + ( breakupFine - 0.5 ) * 0.6 * uBreakup.y, 0.05, 1.0 );
    `,
  })
}

export interface ConcreteWear {
  groundY: number
  dampHeight: number
  shelter: readonly [minX: number, minZ: number, maxX: number, maxZ: number]
  rainDrift: number
  polishPaths: readonly (readonly [fromX: number, fromZ: number, toX: number, toZ: number])[]
  polishWidth: number
}

const maxPolishPaths = 4
const unusedPolishPath = new Vector4(1e4, 1e4, 1e4, 1e4)

const concreteWearHeader = `
uniform vec4 uWearGround;
uniform vec4 uWearShelter;
uniform vec4 uWearPaths[ ${maxPolishPaths} ];
float wearSegmentDistance( vec2 point, vec4 segment ) {
  vec2 along = segment.zw - segment.xy;
  float t = clamp( dot( point - segment.xy, along ) / max( dot( along, along ), 1e-4 ), 0.0, 1.0 );
  return length( point - segment.xy - along * t );
}
`

const concreteWearAlbedo = `
  float wearNoise = surfaceFbm( vSurfacePosition * 1.7 );
  float wearFine = surfaceNoise( vSurfacePosition * 9.0 );
  float wearUp = smoothstep( 0.6, 0.9, vSurfaceNormal.y );
  float wearHeight = vSurfacePosition.y - uWearGround.x;
  float wearAtGround = 1.0 - smoothstep( 0.03, 0.1, abs( wearHeight ) );
  vec2 wearInside = step( uWearShelter.xy, vSurfacePosition.xz ) * step( vSurfacePosition.xz, uWearShelter.zw );
  float wearDrift = ( wearNoise - 0.5 ) * uWearGround.z;
  float wearSheltered = wearInside.x * wearInside.y * smoothstep( 0.0, uWearGround.z, uWearShelter.w - vSurfacePosition.z + wearDrift );
  float wearWet = wearUp * wearAtGround * ( 1.0 - wearSheltered );
  float wearDampEdge = uWearGround.y * ( 0.65 + 0.7 * wearNoise );
  float wearDamp = ( 1.0 - wearUp ) * ( 1.0 - smoothstep( wearDampEdge - 0.12, wearDampEdge, wearHeight ) ) * step( -0.6, wearHeight );
  float wearPolish = 0.0;
  for ( int path = 0; path < ${maxPolishPaths}; path ++ ) {
    float reach = wearSegmentDistance( vSurfacePosition.xz, uWearPaths[ path ] );
    wearPolish = max( wearPolish, 1.0 - smoothstep( uWearGround.w * 0.3, uWearGround.w, reach ) );
  }
  wearPolish *= wearUp * wearAtGround * ( 0.55 + 0.45 * wearNoise );
  diffuseColor.rgb *= mix( 1.0, 0.6, wearDamp ) * mix( 1.0, 0.52, wearWet ) * mix( 1.0, 0.88, wearPolish );
`

const concreteWearRoughness = `
  roughnessFactor = mix( roughnessFactor, 0.62, wearDamp * 0.6 );
  roughnessFactor = mix( roughnessFactor, 0.3 + wearFine * 0.14, wearPolish );
  roughnessFactor = mix( roughnessFactor, 0.07 + wearNoise * 0.24, wearWet );
`

export function concreteMaterial(
  textures: SharedTextures,
  parameters: MeshStandardMaterialParameters = {},
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    map: textures.concrete.map,
    normalMap: textures.concrete.normalMap,
    roughnessMap: textures.concrete.roughnessMap,
    roughness: 1,
    metalness: 0,
    ...parameters,
  })
}

export function wornConcreteMaterial(
  textures: SharedTextures,
  wear: ConcreteWear,
  parameters: MeshStandardMaterialParameters = {},
): MeshStandardMaterial {
  const paths = Array.from({ length: maxPolishPaths }, (_, index) => {
    const path = wear.polishPaths[index]
    return path ? new Vector4(...path) : unusedPolishPath.clone()
  })
  return patchSurface(concreteMaterial(textures, parameters), {
    key: 'concrete-wear',
    uniforms: {
      uWearGround: { value: new Vector4(wear.groundY, wear.dampHeight, wear.rainDrift, wear.polishWidth) },
      uWearShelter: { value: new Vector4(...wear.shelter) },
      uWearPaths: { value: paths },
    },
    fragmentHeader: concreteWearHeader,
    albedo: concreteWearAlbedo,
    roughness: concreteWearRoughness,
  })
}

const blackenedSteel: SurfaceBreakup = { cellsPerMetre: 2.4, roughnessSwing: 0.17, albedoSwing: 0.2, verticalStretch: 4 }
const agedBrass: SurfaceBreakup = { cellsPerMetre: 7, roughnessSwing: 0.13, albedoSwing: 0.16, verticalStretch: 1 }

export function steelMaterial(parameters: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
  return withSurfaceBreakup(
    new MeshStandardMaterial({ color: '#3A3E44', metalness: 0.78, roughness: 0.46, ...parameters }),
    blackenedSteel,
  )
}

export function brassMaterial(parameters: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
  return withSurfaceBreakup(
    new MeshStandardMaterial({ color: '#B08A52', metalness: 1, roughness: 0.34, ...parameters }),
    agedBrass,
  )
}

export const luminance = {
  screen: 0.62,
  screenEmphasis: 0.3,
  bulb: 7,
  shadeInterior: 0.38,
} as const

export function screenMaterial(texture: Texture, parameters: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: '#05070A',
    roughness: 0.42,
    metalness: 0,
    emissive: '#ffffff',
    emissiveMap: texture,
    emissiveIntensity: luminance.screen,
    ...parameters,
  })
}

export function bulbEmitter(color: ColorRepresentation = palette.warm, parameters: MeshBasicMaterialParameters = {}): Emitter {
  return createEmitter(color, luminance.bulb, parameters)
}

export function glassMaterial(opacity: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: '#9fb2c8',
    metalness: 0,
    roughness: 0.06,
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
  })
}

export interface Emitter {
  material: MeshBasicMaterial
  set(intensity: number, color?: Color): void
}

export function createEmitter(
  color: ColorRepresentation,
  intensity = 1,
  parameters: MeshBasicMaterialParameters = {},
): Emitter {
  const base = new Color(color)
  const material = new MeshBasicMaterial({ ...parameters, color: base.clone().multiplyScalar(intensity) })
  return {
    material,
    set(nextIntensity, nextColor) {
      material.color.copy(nextColor ?? base).multiplyScalar(nextIntensity)
    },
  }
}

const glowVertexShader = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vUv = uv;
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-viewPosition.xyz);
  gl_Position = projectionMatrix * viewPosition;
}
`

const beamFragmentShader = `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uApexBright;
uniform float uFalloff;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float along = clamp(mix(1.0 - vUv.y, vUv.y, uApexBright), 0.0, 1.0);
  float edge = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.4);
  float alpha = pow(along, uFalloff) * edge * uIntensity;
  gl_FragColor = vec4(uColor * alpha, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const haloFragmentShader = `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uFalloff;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  float alpha = pow(facing, uFalloff) * uIntensity;
  gl_FragColor = vec4(uColor * alpha, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export interface GlowMaterial extends ShaderMaterial {
  uniforms: {
    uColor: { value: Color }
    uIntensity: { value: number }
    uApexBright: { value: number }
    uFalloff: { value: number }
  }
}

function glowMaterial(fragmentShader: string, color: ColorRepresentation, apexBright: boolean, falloff: number): GlowMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uIntensity: { value: 1 },
      uApexBright: { value: apexBright ? 1 : 0 },
      uFalloff: { value: falloff },
    },
    vertexShader: glowVertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  }) as GlowMaterial
}

export function createBeamMaterial(color: ColorRepresentation, apexBright: boolean, falloff = 1.6): GlowMaterial {
  return glowMaterial(beamFragmentShader, color, apexBright, falloff)
}

export function createHaloMaterial(color: ColorRepresentation, falloff = 2.5): GlowMaterial {
  const material = glowMaterial(haloFragmentShader, color, false, falloff)
  material.side = FrontSide
  return material
}

const flowVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const flowFragmentShader = `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
uniform float uDensity;
uniform float uSpeed;
varying vec2 vUv;
void main() {
  float phase = fract(vUv.y * uDensity - uTime * uSpeed);
  float pulse = smoothstep(0.0, 0.06, phase) * (1.0 - smoothstep(0.06, 0.42, phase));
  gl_FragColor = vec4(uColor * (0.22 + 1.9 * pulse) * uIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export interface FlowMaterial extends ShaderMaterial {
  uniforms: {
    uColor: { value: Color }
    uIntensity: { value: number }
    uTime: { value: number }
    uDensity: { value: number }
    uSpeed: { value: number }
  }
}

export function createFlowMaterial(color: ColorRepresentation, pulsesPerMetre = 0.9, metresPerSecond = 0.9): FlowMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uIntensity: { value: 1 },
      uTime: { value: 0 },
      uDensity: { value: pulsesPerMetre },
      uSpeed: { value: metresPerSecond * pulsesPerMetre },
    },
    vertexShader: flowVertexShader,
    fragmentShader: flowFragmentShader,
  }) as FlowMaterial
}

export interface ProxyOptions {
  id: string
  chapters: readonly ChapterId[]
  geometry: BufferGeometry
  position: Vec3
  rotationY?: number
  onState: (state: InteractionState) => void
}

export function createProxy(options: ProxyOptions): InteractiveProxy & { object: Mesh } {
  const object = new Mesh(options.geometry, new MeshBasicMaterial({ visible: false }))
  object.name = options.id
  object.position.set(...options.position)
  object.rotation.y = options.rotationY ?? 0
  return { id: options.id, object, chapters: options.chapters, apply: options.onState }
}

function disposeMaterial(material: Material | Material[]): void {
  for (const entry of Array.isArray(material) ? material : [material]) entry.dispose()
}

export function disposeTree(root: Object3D): void {
  root.traverse((node) => {
    if (node instanceof InstancedMesh) node.dispose()
    if (node instanceof Light) node.dispose()
    if ('geometry' in node && 'material' in node) {
      const renderable = node as Mesh
      renderable.geometry.dispose()
      disposeMaterial(renderable.material)
    }
  })
}
