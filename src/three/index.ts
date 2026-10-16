import { gsap } from 'gsap'
import { Mesh, NoToneMapping, PMREMGenerator, Scene, SRGBColorSpace, type Texture, Vector3, WebGLRenderer } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { motionDebug, preserveBuffer, probeEvent, timed } from '../debug/probe'
import { env } from '../env'
import { HERO_IMPACT } from '../figures/shapes'
import { sineInOut } from '../math'
import { copyFrame, createFrame, sameFrame } from '../frame'
import type { FigureId, PathApi } from '../types'
import { AgentNodes } from './agent-nodes'
import { CanvasAnchor, type Placement } from './anchor'
import { beatClock } from './beat-clock'
import { NO_BUFFER, resizedBuffer } from './buffer'
import { aimCamera, createCamera, fitCamera, getCamera, getViewport, pageToWorld } from './camera'
import type { FrameContext, PathExtra } from './extras'
import { FIGURE_IDS, type Figure, type FigureVariant, getFigure, PATH_POINT_COUNT, sampleAllFigures } from './figures'
import { createPathMaterials, NIGHT_EMISSIVE_MAX } from './materials'
import { BLOOM_STRENGTH, NightGlow } from './night'
import { RocketExtra } from './rocket'
import { ContactShadow, SHADOW_LAYER, type ShadowCaster } from './shadow'
import { designToPage, designToPageStrict, type StageFit, StageRegistry, VIEWPORT_ORIGIN } from './stages'
import { DataStrands } from './strands'
import { SunExtra } from './sun'
import { PathTube } from './tube'

const RADIAL_SEGMENTS = 20
const ENVIRONMENT_BLUR = 0.18
const TUBE_RADIUS_DESIGN = 17
const TUBE_RADIUS_MOBILE = 11
const DPR_CAP_DESKTOP = 2
const DPR_CAP_TOUCH = 1.5
const SHADOW_STRENGTH_DAY = 0.16
const SHADOW_OFFSET_DESIGN = 16
const EDGE_MARGIN_EXTRA = 60
const WAVE_SPREAD = 0.5
const WAVE_GAIN = 1.5
const SMOOTH_RADIUS = 12
const SMOOTH_PASSES = 3
const RIPPLE_BASE = 2.2
const RIPPLE_BEAT = 5
const RIPPLE_WAVELENGTH_DESIGN = 380
const INK_EDGE_DESIGN = 20
const GLOW_FLOOR = 30 / 58
const GLOW_RANGE = 28 / 58
const STEADY_PULSE = 0.32
const STAGE_MOVE_EPSILON = 0.25
const READY_CLASS = 'three-ready'
const IDLE_SLICE_TIMEOUT_MS = 120
const READY_FALLBACK_MS = 700
const ANCHOR_BLEED = 160
const DRAW_ON_FIGURES = new Set<FigureId>(['frontend', 'backend', 'cloud', 'data', 'ai-products', 'ai-coding', 'teaching'])

function createEnvironment(renderer: WebGLRenderer): Texture {
  const pmrem = new PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const texture = pmrem.fromScene(room, ENVIRONMENT_BLUR).texture
  room.dispose()
  pmrem.dispose()
  return texture
}

function idleSlice(): Promise<void> {
  return new Promise((resume) => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => resume(), { timeout: IDLE_SLICE_TIMEOUT_MS })
    else globalThis.setTimeout(resume, 0)
  })
}

function isFigureId(value: string): value is FigureId {
  return (FIGURE_IDS as string[]).includes(value)
}

export async function initPath(canvas: HTMLCanvasElement): Promise<PathApi> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: preserveBuffer })
  let shaderFailed = false
  renderer.debug.onShaderError = () => {
    shaderFailed = true
  }
  renderer.setClearColor(0x000000, 0)
  renderer.autoClear = false
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = NoToneMapping

  await idleSlice()
  sampleAllFigures('desktop')
  sampleAllFigures('mobile')
  await idleSlice()
  let environment = createEnvironment(renderer)
  await idleSlice()
  const materials = createPathMaterials(environment)
  const scene = new Scene()
  createCamera()
  const stages = new StageRegistry()
  const anchor = new CanvasAnchor(canvas)
  const heroSection = document.getElementById('hero')
  const trackedRects: DOMRect[] = []
  const tube = new PathTube(PATH_POINT_COUNT, RADIAL_SEGMENTS)
  const tubeMesh = new Mesh(tube.geometry, materials.tube)
  const capsMesh = new Mesh(tube.capsGeometry, materials.tube)
  for (const mesh of [tubeMesh, capsMesh]) {
    mesh.frustumCulled = false
    mesh.layers.enable(SHADOW_LAYER)
  }
  scene.add(tubeMesh, capsMesh)
  const ghost = new PathTube(PATH_POINT_COUNT, RADIAL_SEGMENTS)
  const ghostMesh = new Mesh(ghost.geometry, materials.tube)
  const ghostCapsMesh = new Mesh(ghost.capsGeometry, materials.tube)
  for (const mesh of [ghostMesh, ghostCapsMesh]) {
    mesh.frustumCulled = false
    mesh.visible = false
    mesh.layers.enable(SHADOW_LAYER)
  }
  scene.add(ghostMesh, ghostCapsMesh)

  const shadow = new ContactShadow()
  const nightGlow = new NightGlow(renderer)
  const sun = new SunExtra(materials)
  const extras: PathExtra[] = [sun, new DataStrands(materials), new AgentNodes(materials), new RocketExtra(materials)]
  const shadowCasters: ShadowCaster[] = [
    { mesh: tubeMesh, opacity: () => 1 },
    { mesh: capsMesh, opacity: () => 1 },
    { mesh: ghostMesh, opacity: () => 1 },
    { mesh: ghostCapsMesh, opacity: () => 1 },
  ]
  extras.forEach((extra) => {
    scene.add(extra.object)
    shadowCasters.push(...extra.casters)
  })

  const frame = createFrame()
  const pagePoints = new Float32Array(PATH_POINT_COUNT * 3)
  const smoothed = new Float32Array(PATH_POINT_COUNT * 3)
  const scratch = new Float32Array(PATH_POINT_COUNT * 3)
  const worldPoints = new Float32Array(PATH_POINT_COUNT * 3)
  const ghostWorld = new Float32Array(PATH_POINT_COUNT * 3)
  const ringRadius = new Float32Array(PATH_POINT_COUNT).fill(1)
  const radiusScratch = new Float32Array(PATH_POINT_COUNT)
  const arcs = new Float32Array(PATH_POINT_COUNT)
  const page = { x: 0, y: 0 }
  const world = new Vector3()
  let frameDirty = true
  let pathVisible = false
  let ghostVisible = false
  let radius = TUBE_RADIUS_DESIGN
  let pathScale = 1
  let tabHidden = document.hidden
  let canvasOffscreen = false
  let contextLost = false
  let disposed = false
  let running = false
  let stateReceived = false
  let readyAnnounced = false
  let readyFallbackTimer = 0
  let renderedSignature = Number.NaN

  const variant = (): FigureVariant => (env.mobile ? 'mobile' : 'desktop')
  const figureOf = (id: FigureId): Figure => getFigure(id, variant())
  const fitOf = (id: FigureId): StageFit => stages.fit(id, figureOf(id).fill)
  const stageScale = (id: FigureId): number => fitOf(id).scale

  const toWorld = (id: FigureId, stageX: number, stageY: number, out: Vector3, depth = 0): Vector3 => {
    designToPageStrict(fitOf(id), stageX, stageY, page)
    return pageToWorld(page.x, page.y, out, depth)
  }

  const context: FrameContext = {
    frame,
    time: 0,
    radius,
    variant: 'desktop',
    materials,
    figure: figureOf,
    toWorld,
    stageScale,
    pathWorld: worldPoints,
    pathCount: PATH_POINT_COUNT,
  }

  let bufferSize = NO_BUFFER
  const resize = (cause: string, size?: Placement): boolean => {
    const width = size?.width ?? (canvas.clientWidth || window.innerWidth)
    const height = size?.height ?? (canvas.clientHeight || window.innerHeight)
    const next = resizedBuffer(bufferSize, width, height, window.devicePixelRatio, env.touch ? DPR_CAP_TOUCH : DPR_CAP_DESKTOP)
    if (!next) return false
    bufferSize = next
    const pixelRatio = next.pixelRatio
    renderer.setDrawingBufferSize(width, height, pixelRatio)
    fitCamera(width, height)
    shadow.setSize(width, height)
    nightGlow.setSize(width, height, pixelRatio)
    frameDirty = true
    if (motionDebug) probeEvent('resize', { cause, width, height, pixelRatio })
    return true
  }

  const mapFigure = (figure: Figure, id: FigureId, fit: StageFit, out: Float32Array, grow: number): void => {
    const points = figure.points
    const heroGrow = id === 'hero'
    for (let i = 0; i < PATH_POINT_COUNT; i++) {
      let x = points[i * 3]
      if (heroGrow) x = HERO_IMPACT.x + (x - HERO_IMPACT.x) * grow
      designToPage(fit, x, points[i * 3 + 1], page)
      out[i * 3] = page.x
      out[i * 3 + 1] = page.y
      out[i * 3 + 2] = points[i * 3 + 2] * fit.scale
    }
  }

  const smoothTowardAverage = (weight: number): void => {
    if (weight <= 1e-3) return
    smoothed.set(pagePoints)
    const count = PATH_POINT_COUNT
    const windowSize = SMOOTH_RADIUS * 2 + 1
    for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
      for (let axis = 0; axis < 3; axis++) {
        let sum = 0
        for (let j = -SMOOTH_RADIUS; j <= SMOOTH_RADIUS; j++) sum += smoothed[Math.min(count - 1, Math.max(0, j)) * 3 + axis]
        for (let i = 0; i < count; i++) {
          scratch[i * 3 + axis] = sum / windowSize
          const leaving = Math.min(count - 1, Math.max(0, i - SMOOTH_RADIUS))
          const entering = Math.min(count - 1, Math.max(0, i + SMOOTH_RADIUS + 1))
          sum += smoothed[entering * 3 + axis] - smoothed[leaving * 3 + axis]
        }
      }
      smoothed.set(scratch)
    }
    for (let i = 0; i < count * 3; i++) pagePoints[i] += (smoothed[i] - pagePoints[i]) * weight
  }

  const toWorldPoints = (source: Float32Array, out: Float32Array): void => {
    for (let i = 0; i < PATH_POINT_COUNT; i++) {
      pageToWorld(source[i * 3], source[i * 3 + 1], world, source[i * 3 + 2])
      out[i * 3] = world.x
      out[i * 3 + 1] = world.y
      out[i * 3 + 2] = world.z
    }
  }

  const keepDrawnShare = (share: number): void => {
    const count = PATH_POINT_COUNT
    arcs[0] = 0
    for (let i = 1; i < count; i++) {
      const dx = pagePoints[i * 3] - pagePoints[i * 3 - 3]
      const dy = pagePoints[i * 3 + 1] - pagePoints[i * 3 - 2]
      const dz = pagePoints[i * 3 + 2] - pagePoints[i * 3 - 1]
      arcs[i] = arcs[i - 1] + Math.hypot(dx, dy, dz)
    }
    scratch.set(pagePoints)
    radiusScratch.set(ringRadius)
    let segment = 1
    for (let i = 0; i < count; i++) {
      const target = (arcs[count - 1] * share * i) / (count - 1)
      while (segment < count - 1 && arcs[segment] < target) segment++
      const span = arcs[segment] - arcs[segment - 1]
      const t = span > 0 ? Math.min(1, Math.max(0, (target - arcs[segment - 1]) / span)) : 0
      for (let axis = 0; axis < 3; axis++) {
        const a = scratch[(segment - 1) * 3 + axis]
        pagePoints[i * 3 + axis] = a + (scratch[segment * 3 + axis] - a) * t
      }
      ringRadius[i] = radiusScratch[segment - 1] + (radiusScratch[segment] - radiusScratch[segment - 1]) * t
    }
  }

  const rebuildPath = (): boolean => {
    const from = figureOf(frame.from)
    const to = figureOf(frame.to)
    const fromFit = fitOf(frame.from)
    const toFit = fitOf(frame.to)
    const morph = frame.from === frame.to ? 0 : Math.min(1, Math.max(0, frame.morph))
    ghostVisible = false
    if (env.morph === 'a' && env.mobile && morph > 0 && DRAW_ON_FIGURES.has(frame.to)) {
      radius = TUBE_RADIUS_MOBILE
      pathScale = toFit.scale
      mapFigure(from, frame.from, fromFit, scratch, frame.heroGrow)
      toWorldPoints(scratch, ghostWorld)
      ghostVisible = ghost.update(ghostWorld, radius, from.radius)
      mapFigure(to, frame.to, toFit, pagePoints, frame.heroGrow)
      ringRadius.set(to.radius)
      keepDrawnShare(sineInOut(morph))
      toWorldPoints(pagePoints, worldPoints)
      return tube.update(worldPoints, radius, ringRadius)
    }
    mapFigure(from, frame.from, fromFit, pagePoints, frame.heroGrow)
    if (morph > 0) {
      mapFigure(to, frame.to, toFit, scratch, frame.heroGrow)
      for (let i = 0; i < PATH_POINT_COUNT; i++) {
        const local = Math.min(1, Math.max(0, morph * WAVE_GAIN - (WAVE_SPREAD * i) / (PATH_POINT_COUNT - 1)))
        const eased = 0.5 - 0.5 * Math.cos(local * Math.PI)
        for (let axis = 0; axis < 3; axis++) {
          pagePoints[i * 3 + axis] += (scratch[i * 3 + axis] - pagePoints[i * 3 + axis]) * eased
        }
        ringRadius[i] = from.radius[i] + (to.radius[i] - from.radius[i]) * eased
      }
      smoothTowardAverage(4 * morph * (1 - morph))
    } else {
      ringRadius.set(from.radius)
    }
    for (let i = 0; i < PATH_POINT_COUNT; i++) {
      pageToWorld(pagePoints[i * 3], pagePoints[i * 3 + 1], world, pagePoints[i * 3 + 2])
      worldPoints[i * 3] = world.x
      worldPoints[i * 3 + 1] = world.y
      worldPoints[i * 3 + 2] = world.z
    }
    pathScale = morph > 0.5 ? toFit.scale : fromFit.scale
    radius = env.mobile ? TUBE_RADIUS_MOBILE : TUBE_RADIUS_DESIGN * pathScale
    return tube.update(worldPoints, radius, ringRadius)
  }

  const glowLevel = (nowMs: number): number => {
    const pulse = STEADY_PULSE + (beatClock.pulse(nowMs) - STEADY_PULSE) * frame.pulse
    return GLOW_FLOOR + GLOW_RANGE * pulse
  }

  const updateUniforms = (nowMs: number, seconds: number): void => {
    const uniforms = materials.uniforms
    const night = frame.night
    const designUnit = env.mobile ? TUBE_RADIUS_MOBILE / TUBE_RADIUS_DESIGN : pathScale
    uniforms.uTime.value = seconds
    uniforms.uRippleAmp.value = (RIPPLE_BASE + RIPPLE_BEAT * beatClock.softBeat(nowMs) * night) * frame.ripple * designUnit
    uniforms.uRippleK.value = (Math.PI * 2) / (RIPPLE_WAVELENGTH_DESIGN * designUnit)
    uniforms.uInkStart.value = frame.inkStart
    uniforms.uInkEnd.value = frame.inkEnd
    uniforms.uInkEdge.value = (INK_EDGE_DESIGN * designUnit) / Math.max(1, tube.length)
    materials.setEmissive(NIGHT_EMISSIVE_MAX * night * glowLevel(nowMs))
    materials.setNightLighting(night)
  }

  const renderFrame = (nowMs: number, placement: Placement | null): void => {
    const viewport = getViewport()
    if (placement) aimCamera(placement.left, placement.top, placement.screenHeight)
    stages.beginFrame(viewport.width, viewport.height, radius * 2 + EDGE_MARGIN_EXTRA, !env.mobile, placement ?? VIEWPORT_ORIGIN)
    const seconds = nowMs / 1000
    if (frameDirty) {
      pathVisible = rebuildPath()
      frameDirty = false
      if (motionDebug) probeEvent('rebuild')
    }
    tubeMesh.visible = pathVisible
    capsMesh.visible = pathVisible
    ghostMesh.visible = ghostVisible
    ghostCapsMesh.visible = ghostVisible
    context.pathWorld = ghostVisible && frame.from === 'data' ? ghostWorld : worldPoints
    updateUniforms(nowMs, seconds)

    context.time = seconds
    context.radius = radius
    context.variant = variant()
    extras.forEach((extra) => extra.update(context))

    const camera = getCamera()
    const night = frame.night
    const shadowStrength = SHADOW_STRENGTH_DAY * frame.shadow * (1 - night)
    const shadowOffset = SHADOW_OFFSET_DESIGN * (env.mobile ? 0.6 : pathScale)
    if (!env.mobile && night > 0.001) {
      const target = nightGlow.sceneTarget()
      renderer.setRenderTarget(target)
      renderer.clear(true, true, true)
      shadow.render(renderer, scene, camera, shadowCasters, shadowStrength, shadowOffset, target)
      renderer.setRenderTarget(target)
      renderer.clearDepth()
      renderer.render(scene, camera)
      nightGlow.finish(BLOOM_STRENGTH * night * glowLevel(nowMs))
    } else {
      renderer.setRenderTarget(null)
      renderer.clear(true, true, true)
      shadow.render(renderer, scene, camera, shadowCasters, shadowStrength, shadowOffset)
      renderer.setRenderTarget(null)
      renderer.clearDepth()
      renderer.render(scene, camera)
    }
  }

  const trackedIds: FigureId[] = []
  const anchorCanvas = (): boolean => {
    if (!env.mobile) {
      if (!anchor.release()) return false
      bufferSize = NO_BUFFER
      resize('release')
      return true
    }
    trackedRects.length = 0
    for (const id of trackedIds) {
      const rect = stages.rect(id)
      if (rect) trackedRects.push(rect)
    }
    const heroOnly = trackedIds.every((id) => id === 'hero')
    if (!anchor.place(trackedRects, heroOnly ? heroSection : null, ANCHOR_BLEED)) return false
    resize('anchor', anchor.placement)
    if (motionDebug) probeEvent('anchor', { top: anchor.placement.top, height: anchor.placement.height, hero: heroOnly })
    return true
  }

  const currentPlacement = (): Placement | null => (anchor.anchored ? anchor.measure() : null)
  const drawNow = (): void => {
    stages.forget()
    renderFrame(performance.now(), currentPlacement())
  }

  const tick = timed('three', (): void => {
    if (disposed || contextLost || tabHidden) return
    stages.forget()
    trackedIds.length = 0
    trackedIds.push(frame.from)
    if (frame.to !== frame.from) trackedIds.push(frame.to)
    if (frame.from !== 'hero' && frame.to !== 'hero' && frame.sun.opacity > 0) trackedIds.push('hero')
    if (anchorCanvas()) frameDirty = true
    const placement = anchor.anchored ? anchor.placement : null
    const signature = stages.positionSignature(trackedIds, placement ?? VIEWPORT_ORIGIN)
    if (Math.abs(signature - renderedSignature) > STAGE_MOVE_EPSILON) frameDirty = true
    renderedSignature = signature
    if (canvasOffscreen && !frameDirty) return
    renderFrame(performance.now(), placement)
    if (stateReceived && !readyAnnounced) {
      readyAnnounced = true
      document.documentElement.classList.add(READY_CLASS)
    }
  })

  const receiveState = (): void => {
    stateReceived = true
  }

  const onVisibility = (): void => {
    tabHidden = document.hidden
    if (!tabHidden) frameDirty = true
  }

  const intersection = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1]
    canvasOffscreen = !entry.isIntersecting
    if (!canvasOffscreen) frameDirty = true
  })
  intersection.observe(canvas)
  const redraw = (): void => {
    if (!running || disposed || contextLost || tabHidden) return
    drawNow()
  }
  const resizeObserver = new ResizeObserver(() => {
    if (resize('observer')) redraw()
  })
  resizeObserver.observe(canvas)

  const onContextLost = (event: Event): void => {
    event.preventDefault()
    contextLost = true
    document.documentElement.classList.remove(READY_CLASS)
  }
  const onContextRestored = (): void => {
    environment.dispose()
    environment = createEnvironment(renderer)
    materials.setEnvironment(environment)
    contextLost = false
    resize('restore')
    frameDirty = true
    drawNow()
    document.documentElement.classList.add(READY_CLASS)
  }

  const markDirty = (): void => {
    frameDirty = true
  }
  window.addEventListener('resize', markDirty)
  document.addEventListener('visibilitychange', onVisibility)
  canvas.addEventListener('webglcontextlost', onContextLost)
  canvas.addEventListener('webglcontextrestored', onContextRestored)

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    window.clearTimeout(readyFallbackTimer)
    gsap.ticker.remove(tick)
    anchor.release()
    window.removeEventListener('resize', markDirty)
    document.removeEventListener('visibilitychange', onVisibility)
    canvas.removeEventListener('webglcontextlost', onContextLost)
    canvas.removeEventListener('webglcontextrestored', onContextRestored)
    intersection.disconnect()
    resizeObserver.disconnect()
    extras.forEach((extra) => extra.dispose())
    tube.dispose()
    ghost.dispose()
    materials.dispose()
    shadow.dispose()
    nightGlow.dispose()
    environment.dispose()
    scene.clear()
    renderer.dispose()
    document.documentElement.classList.remove(READY_CLASS)
  }

  const api: PathApi = {
    setFrame(next) {
      if (!isFigureId(next.from) || !isFigureId(next.to)) return
      receiveState()
      if (sameFrame(frame, next)) return
      copyFrame(frame, next)
      frameDirty = true
    },
    setIntro(scale) {
      sun.introScale = Math.max(0, scale)
    },
    refresh() {
      stages.collect()
      frameDirty = true
      if (resize('refresh')) redraw()
    },
    dispose,
  }

  try {
    resize('init')
    await renderer.compileAsync(scene, getCamera())
    await shadow.prepare(renderer)
    await idleSlice()
    if (!env.mobile) nightGlow.warm()
    drawNow()
  } catch (error) {
    dispose()
    throw error
  }
  if (shaderFailed || renderer.getContext().isContextLost()) {
    dispose()
    throw new Error('path renderer failed on first frame')
  }
  running = true
  gsap.ticker.add(tick)
  readyFallbackTimer = window.setTimeout(receiveState, READY_FALLBACK_MS)
  return api
}
