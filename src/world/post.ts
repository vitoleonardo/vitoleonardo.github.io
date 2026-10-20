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
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

const BLOOM_ACTIVE_THRESHOLD = 0.01
const BLOOM_MAX_STRENGTH = 0.9
const BLOOM_RADIUS = 0.32
const BLOOM_LUMINANCE_THRESHOLD = 0.95
const MULTISAMPLE_COUNT = 4
const GRADE_ACTIVE_THRESHOLD = 0.01
const VICE_BLOOM = 0.55
const GRAIN_FRAMES = 240

const viceGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uAmount: { value: 0 },
    uFrame: { value: 0 },
  },
  vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform float uAmount;
uniform float uFrame;
varying vec2 vUv;
float hash(vec2 point) {
  return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec2 fromCentre = vUv - 0.5;
  float edge = dot(fromCentre, fromCentre);
  vec2 shift = fromCentre * edge * 0.018 * uAmount;
  vec4 base = texture2D(tDiffuse, vUv);
  vec3 color = vec3(texture2D(tDiffuse, vUv + shift).r, base.g, texture2D(tDiffuse, vUv - shift).b);
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec3 shadows = vec3(0.16, 0.05, 0.22);
  vec3 highlights = vec3(1.08, 0.9, 1.0);
  vec3 toned = color * mix(vec3(1.0), highlights, smoothstep(0.2, 1.2, luma)) + shadows * 0.06 * (1.0 - smoothstep(0.0, 0.35, luma));
  toned = mix(vec3(luma), toned, 1.18);
  toned *= 1.0 - smoothstep(0.18, 0.62, edge) * 0.38;
  toned += (hash(vUv * 913.0 + uFrame) - 0.5) * 0.014;
  gl_FragColor = vec4(mix(base.rgb, max(toned, 0.0), uAmount), base.a);
}
`,
}

export interface PostPipeline {
  render(bloom: number, vice: number): void
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
  gradePass: ShaderPass
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
  const gradePass = new ShaderPass(viceGradeShader)
  const outputPass = new OutputPass()
  composer.addPass(renderPass)
  composer.addPass(bloomPass)
  composer.addPass(gradePass)
  composer.addPass(outputPass)
  composer.setPixelRatio(pixelRatio)
  composer.setSize(size.x, size.y)

  return {
    composer,
    bloomPass,
    gradePass,
    dispose() {
      renderPass.dispose()
      bloomPass.dispose()
      gradePass.dispose()
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

  let frame = 0

  function render(bloom: number, vice: number): void {
    const strength = Math.max(bloom, vice * VICE_BLOOM)
    const graded = vice > GRADE_ACTIVE_THRESHOLD
    if (!chain || (strength <= BLOOM_ACTIVE_THRESHOLD && !graded)) {
      renderer.render(scene, camera)
      return
    }
    frame = (frame + 1) % GRAIN_FRAMES
    chain.bloomPass.enabled = strength > BLOOM_ACTIVE_THRESHOLD
    chain.bloomPass.strength = strength * BLOOM_MAX_STRENGTH
    chain.gradePass.enabled = graded
    chain.gradePass.uniforms.uAmount.value = vice
    chain.gradePass.uniforms.uFrame.value = frame
    chain.composer.render()
  }

  function warmUp(): void {
    if (!chain) return
    chain.bloomPass.enabled = true
    chain.bloomPass.strength = BLOOM_MAX_STRENGTH
    chain.gradePass.enabled = true
    chain.gradePass.uniforms.uAmount.value = 1
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
