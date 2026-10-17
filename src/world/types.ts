import type { Object3D, PerspectiveCamera, Scene, Texture, WebGLRenderer } from 'three'

export type Vec3 = readonly [number, number, number]

export type ChapterId =
  | 'hero'
  | 'index'
  | 'stop-frontend'
  | 'stop-backend'
  | 'stop-cloud'
  | 'stop-data'
  | 'stop-ai-products'
  | 'stop-ai-coding'
  | 'stop-teaching'
  | 'about'
  | 'say-hi'

export type FloorId =
  | 'street'
  | 'frontend'
  | 'backend'
  | 'cloud'
  | 'data'
  | 'ai-core'
  | 'rocket'
  | 'teaching'
  | 'lounge'
  | 'beacon'

export interface CameraPose {
  position: Vec3
  target: Vec3
  fov: number
  approach?: Vec3
}

export interface ChapterCamera extends CameraPose {
  mobile: CameraPose
}

export interface WorldChannels {
  key: number
  ambient: number
  practicals: number
  fog: number
  rain: number
  red: number
  dawn: number
  pulse: number
  bloom: number
  floorsLit: number
  launch: number
}

export type WorldChannel = keyof WorldChannels

export interface ChapterSpec {
  id: ChapterId
  scrollWeight: number
  landmark: string
  change: string
  camera: ChapterCamera
  world: WorldChannels
  focus: readonly FloorId[]
  interactions: readonly string[]
}

export interface ConductorState {
  exact: number
  smooth: number
  index: number
  next: number
  localExact: number
  localSmooth: number
  direction: -1 | 0 | 1
}

export interface FrameState {
  progress: ConductorState
  world: WorldChannels
  time: number
  dt: number
  reducedMotion: boolean
  mobile: boolean
}

export type InteractionState = 'unavailable' | 'idle' | 'hover' | 'focused' | 'active'

export interface InteractiveProxy {
  id: string
  object: Object3D
  chapters: readonly ChapterId[]
  apply(state: InteractionState): void
}

export interface FloorContext {
  scene: Scene
  renderer: WebGLRenderer
  camera: PerspectiveCamera
  textures: SharedTextures
  quality: QualityTier
}

export interface FloorSet {
  id: FloorId
  root: Object3D
  proxies: readonly InteractiveProxy[]
  update(frame: FrameState): void
  dispose(): void
}

export type FloorFactory = (context: FloorContext) => FloorSet

export interface SharedTextures {
  concrete: { map: Texture; normalMap: Texture; roughnessMap: Texture }
  blueprint: Texture
  work: { hih: Texture; baysal: Texture; fakhari: Texture }
  portrait: Texture
}

export type QualityName = 'high' | 'medium' | 'low'

export interface QualityTier {
  name: QualityName
  dpr: number
  shadows: number
  particles: number
  bloom: boolean
  antialias: boolean
}
