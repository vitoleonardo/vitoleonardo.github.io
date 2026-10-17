import {
  HalfFloatType,
  type PerspectiveCamera,
  type Scene,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

const BLOOM_ACTIVE_THRESHOLD = 0.01
const BLOOM_MAX_STRENGTH = 1.1
const BLOOM_RADIUS = 0.55
const BLOOM_LUMINANCE_THRESHOLD = 0.82
const MULTISAMPLE_COUNT = 4

export interface PostPipeline {
  render(bloom: number): void
  warmUp(): void
  setSize(width: number, height: number, pixelRatio: number): void
  disableBloom(): void
  dispose(): void
}

export interface PostOptions {
  bloom: boolean
  antialias: boolean
}

interface BloomChain {
  composer: EffectComposer
  bloomPass: UnrealBloomPass
  dispose(): void
}

function createBloomChain(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  antialias: boolean,
): BloomChain {
  const size = renderer.getSize(new Vector2())
  const pixelRatio = renderer.getPixelRatio()
  const target = new WebGLRenderTarget(size.x * pixelRatio, size.y * pixelRatio, {
    type: HalfFloatType,
    samples: antialias ? MULTISAMPLE_COUNT : 0,
  })
  const composer = new EffectComposer(renderer, target)
  const renderPass = new RenderPass(scene, camera)
  const bloomPass = new UnrealBloomPass(size, 0, BLOOM_RADIUS, BLOOM_LUMINANCE_THRESHOLD)
  const outputPass = new OutputPass()
  composer.addPass(renderPass)
  composer.addPass(bloomPass)
  composer.addPass(outputPass)
  composer.setPixelRatio(pixelRatio)
  composer.setSize(size.x, size.y)

  return {
    composer,
    bloomPass,
    dispose() {
      renderPass.dispose()
      bloomPass.dispose()
      outputPass.dispose()
      composer.dispose()
    },
  }
}

export function createPost(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  options: PostOptions,
): PostPipeline {
  let chain = options.bloom ? createBloomChain(renderer, scene, camera, options.antialias) : null

  function render(bloom: number): void {
    if (!chain || bloom <= BLOOM_ACTIVE_THRESHOLD) {
      renderer.render(scene, camera)
      return
    }
    chain.bloomPass.strength = bloom * BLOOM_MAX_STRENGTH
    chain.composer.render()
  }

  function warmUp(): void {
    if (!chain) return
    chain.bloomPass.strength = BLOOM_MAX_STRENGTH
    chain.composer.render()
  }

  function setSize(width: number, height: number, pixelRatio: number): void {
    if (!chain) return
    chain.composer.setPixelRatio(pixelRatio)
    chain.composer.setSize(width, height)
  }

  function disableBloom(): void {
    chain?.dispose()
    chain = null
  }

  function dispose(): void {
    disableBloom()
  }

  return { render, warmUp, setSize, disableBloom, dispose }
}
