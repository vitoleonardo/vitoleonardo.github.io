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
  type BufferGeometry,
  type ColorRepresentation,
  type Material,
  type MeshBasicMaterialParameters,
  type MeshStandardMaterialParameters,
  type Object3D,
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

export interface InteriorPractical {
  chapter: number
  position: Vec3
  color: string
  intensity: number
  distance: number
  pulses: boolean
  fill: number
}

export const interiorPracticals: readonly InteriorPractical[] = [
  { chapter: chapterIndex.frontend, position: [0.6, floorBase.frontend + 3, 2.2], color: palette.warm, intensity: 20, distance: 14, pulses: false, fill: 7 },
  { chapter: chapterIndex.backend, position: [2, floorBase.backend + 3.2, 1.5], color: '#BCCBFF', intensity: 22, distance: 15, pulses: false, fill: 7 },
  { chapter: chapterIndex.cloud, position: [-2.8, floorBase.cloud + 3.2, 1], color: '#D2DAFF', intensity: 20, distance: 14, pulses: false, fill: 7 },
  { chapter: chapterIndex.data, position: [0.5, floorBase.data + 3.3, 3.2], color: '#BCCBFF', intensity: 20, distance: 14, pulses: false, fill: 7 },
  { chapter: chapterIndex.aiProducts, position: [-2.5, floorBase['ai-core'] + 3.2, 3.5], color: '#9FB2FF', intensity: 7, distance: 12, pulses: false, fill: 0 },
  { chapter: chapterIndex.teaching, position: [0.5, floorBase.teaching + 3.3, 2.5], color: palette.warm, intensity: 10, distance: 13, pulses: false, fill: 0 },
  { chapter: chapterIndex.about, position: [4.4, floorBase.lounge + 2, 3.4], color: palette.warm, intensity: 9, distance: 11, pulses: true, fill: 0 },
]

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

export const steelAlbedo = '#30343B'

export function steelMaterial(parameters: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: steelAlbedo, metalness: 0.6, roughness: 0.45, ...parameters })
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
