import {
  ACESFilmicToneMapping,
  DirectionalLight,
  Group,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PointLight,
  Scene,
  SpotLight,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { env } from '../env'
import { createArchitecture } from './architecture'
import { createAtmosphere } from './atmosphere'
import { createCameraRig, type Viewport } from './camera-rig'
import { chapters } from './chapters'
import { type Conductor, createConductor } from './conductor'
import { floorFactories } from './floors'
import { createChannels, interpolateChannels, presentedState, segmentState } from './interp'
import { createPost } from './post'
import { easeLook, type Look, lookTarget, stepLook } from './look'
import { createQualityGovernor, pickInitialTier, qualityTiers } from './quality'
import { createSharedTextures } from './textures'
import { createTower } from './tower'
import type {
  ConductorState,
  FloorContext,
  FloorSet,
  FrameState,
  InteractiveProxy,
  QualityName,
  QualityTier,
  SharedTextures,
} from './types'

const CAMERA_NEAR = 0.1
const CAMERA_FAR = 400
const INITIAL_FOV = 50
const MAX_FRAME_SECONDS = 1 / 30
const NOMINAL_FRAME_MS = 1000 / 60
const READY_CLASS = 'world-ready'
const NO_WEBGL_CLASS = 'no-webgl'
const TONE_MAPPING_EXPOSURE = 1.3

export type FrameListener = (frame: Readonly<FrameState>) => void

export interface WorldApi {
  conductor: Conductor
  proxies: readonly InteractiveProxy[]
  camera: PerspectiveCamera
  setLook(look: Look): void
  onFrame(listener: FrameListener): () => void
  dispose(): void
}

interface WorldDebugHandle {
  renderer: WebGLRenderer
  camera: PerspectiveCamera
  conductor: Conductor
}

declare global {
  interface Window {
    __world?: WorldDebugHandle
  }
}

function createRenderer(canvas: HTMLCanvasElement, quality: QualityTier): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: quality.antialias,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE
  renderer.shadowMap.enabled = quality.shadows > 0
  renderer.shadowMap.type = PCFShadowMap
  return renderer
}

function readViewport(canvas: HTMLCanvasElement): Viewport {
  return {
    width: Math.max(1, canvas.clientWidth || window.innerWidth),
    height: Math.max(1, canvas.clientHeight || window.innerHeight),
    mobile: env.mobile,
  }
}

type ShadowLight = DirectionalLight | SpotLight | PointLight

function isShadowLight(object: Object3D): object is ShadowLight {
  const castsShadow =
    object instanceof DirectionalLight || object instanceof SpotLight || object instanceof PointLight
  return castsShadow && object.castShadow
}

function applyShadowBudget(renderer: WebGLRenderer, scene: Scene, mapSize: number): void {
  if (mapSize === 0) {
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = true
    return
  }
  scene.traverse((object) => {
    if (!isShadowLight(object)) return
    object.shadow.mapSize.set(mapSize, mapSize)
    object.shadow.map?.dispose()
    object.shadow.map = null
  })
}

function disposeSharedTextures(textures: SharedTextures): void {
  const { concrete, blueprint, work, portrait } = textures
  for (const texture of [concrete.map, concrete.normalMap, concrete.roughnessMap, blueprint, portrait]) {
    texture.dispose()
  }
  for (const texture of Object.values(work)) texture.dispose()
}

function buildFloorSets(context: FloorContext): FloorSet[] {
  const atmosphere = createAtmosphere(context)
  const tower = createTower(context)
  const architecture = createArchitecture(context)
  const floors = floorFactories.map((factory) => factory(context))

  const worldRoot = new Group()
  worldRoot.name = 'world'
  const environment = new Group()
  environment.name = 'environment'
  const landmarks = new Group()
  landmarks.name = 'landmarks'
  const chapterSets = new Group()
  chapterSets.name = 'chapter-sets'
  environment.add(atmosphere.root)
  landmarks.add(tower.root, architecture.root)
  for (const floor of floors) chapterSets.add(floor.root)
  worldRoot.add(environment, landmarks, chapterSets)
  context.scene.add(worldRoot)
  context.scene.fog = atmosphere.fog

  return [atmosphere, tower, architecture, ...floors]
}

export type WorldStage = 'textures' | 'compiled' | 'ready'

export interface WorldOptions {
  onStage?: (stage: WorldStage) => void
  look?: Look
}

export async function initWorld(canvas: HTMLCanvasElement, options: WorldOptions = {}): Promise<WorldApi> {
  const root = document.documentElement
  const initialTier = pickInitialTier({
    mobile: env.mobile,
    touch: env.touch,
    cores: navigator.hardwareConcurrency || 0,
  })
  const quality: QualityTier = { ...qualityTiers[initialTier] }
  const renderer = createRenderer(canvas, quality)
  const scene = new Scene()
  const camera = new PerspectiveCamera(INITIAL_FOV, 1, CAMERA_NEAR, CAMERA_FAR)

  let textures: SharedTextures
  let sets: FloorSet[]
  try {
    textures = await createSharedTextures(renderer)
    options.onStage?.('textures')
    sets = buildFloorSets({ scene, renderer, camera, textures, quality })
  } catch (error) {
    renderer.dispose()
    throw error
  }

  const conductor = createConductor({ reducedMotion: () => env.reducedMotion, touch: env.touch })
  conductor.start()

  let viewport = readViewport(canvas)
  const rig = createCameraRig(camera, chapters, viewport)
  scene.add(rig.root)
  const post = createPost(renderer, scene, camera, { bloom: quality.bloom, antialias: quality.antialias })
  const governor = createQualityGovernor(initialTier, performance.now())

  const presented: ConductorState = { ...conductor.state }
  const frame: FrameState = {
    progress: presented,
    world: createChannels(),
    time: 0,
    dt: 0,
    reducedMotion: env.reducedMotion,
    mobile: viewport.mobile,
    vice: 0,
  }
  let lookBlend = lookTarget(options.look ?? 'classic')
  let lookGoal = lookBlend

  const frameListeners = new Set<FrameListener>()
  let animationFrame = 0
  let lastTime = 0
  let resizePending = true
  let contextLost = false
  let disposed = false

  function applyResize(): void {
    resizePending = false
    viewport = readViewport(canvas)
    const pixelRatio = Math.min(window.devicePixelRatio || 1, quality.dpr)
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(viewport.width, viewport.height, false)
    rig.setViewport(viewport)
    post.setSize(viewport.width, viewport.height, pixelRatio)
  }

  function applyTier(name: QualityName): void {
    Object.assign(quality, qualityTiers[name])
    if (!quality.bloom) post.disableBloom()
    if (renderer.shadowMap.enabled) applyShadowBudget(renderer, scene, quality.shadows)
    resizePending = true
  }

  function advance(dt: number): void {
    if (resizePending) applyResize()
    conductor.update(dt)
    presentedState(conductor.state, env.reducedMotion, chapters.length, presented)
    const segment = segmentState(presented.smooth, chapters)
    interpolateChannels(segment.a.world, segment.b.world, segment.t, frame.world)
    frame.time += dt
    frame.dt = dt
    frame.reducedMotion = env.reducedMotion
    frame.mobile = viewport.mobile
    lookBlend = stepLook(lookBlend, lookGoal, dt, env.reducedMotion)
    frame.vice = easeLook(lookBlend)
    rig.update({ progress: presented.smooth, dt, parallax: !env.touch && !env.reducedMotion })
    for (const set of sets) set.update(frame)
  }

  function tick(now: number): void {
    const elapsedMs = lastTime ? now - lastTime : NOMINAL_FRAME_MS
    lastTime = now
    advance(Math.min(elapsedMs / 1000, MAX_FRAME_SECONDS))
    post.render(frame.world.bloom, frame.vice)
    for (const listener of frameListeners) listener(frame)
    const downgrade = governor.sample(elapsedMs, now)
    if (downgrade) applyTier(downgrade)
    animationFrame = requestAnimationFrame(tick)
  }

  function startLoop(): void {
    if (animationFrame || contextLost || disposed || document.hidden) return
    lastTime = 0
    governor.pause(performance.now())
    animationFrame = requestAnimationFrame(tick)
  }

  function stopLoop(): void {
    cancelAnimationFrame(animationFrame)
    animationFrame = 0
  }

  function onVisibilityChange(): void {
    if (document.hidden) stopLoop()
    else startLoop()
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return
    rig.setPointer((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1)
  }

  function onContextLost(event: Event): void {
    event.preventDefault()
    contextLost = true
    stopLoop()
    root.classList.remove(READY_CLASS)
    root.classList.add(NO_WEBGL_CLASS)
  }

  const canvasObserver = new ResizeObserver(() => {
    resizePending = true
  })
  canvasObserver.observe(canvas)
  document.addEventListener('visibilitychange', onVisibilityChange)
  canvas.addEventListener('webglcontextlost', onContextLost)
  if (!env.touch) window.addEventListener('pointermove', onPointerMove, { passive: true })

  advance(0)
  await renderer.compileAsync(scene, camera)
  options.onStage?.('compiled')
  if (!disposed && !contextLost) {
    post.warmUp()
    advance(0)
    post.render(frame.world.bloom, frame.vice)
    root.classList.add(READY_CLASS)
    options.onStage?.('ready')
    startLoop()
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    stopLoop()
    frameListeners.clear()
    canvasObserver.disconnect()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    canvas.removeEventListener('webglcontextlost', onContextLost)
    window.removeEventListener('pointermove', onPointerMove)
    conductor.stop()
    for (const set of sets) set.dispose()
    rig.dispose()
    post.dispose()
    disposeSharedTextures(textures)
    scene.clear()
    renderer.dispose()
    root.classList.remove(READY_CLASS)
    if (import.meta.env.DEV) delete window.__world
  }

  if (import.meta.env.DEV) window.__world = { renderer, camera, conductor }

  return {
    conductor,
    proxies: sets.flatMap((set) => set.proxies),
    camera,
    setLook(look) {
      lookGoal = lookTarget(look)
    },
    onFrame(listener) {
      frameListeners.add(listener)
      return () => frameListeners.delete(listener)
    },
    dispose,
  }
}
