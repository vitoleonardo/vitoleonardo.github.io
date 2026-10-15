import { HalfFloatType, Vector2, WebGLRenderTarget, type WebGLRenderer } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

export const BLOOM_STRENGTH = 1.35
const BLOOM_RADIUS = 0
const BLOOM_FACTORS = [1.0, 0.85, 0.5, 0.16, 0.0]
const BLOOM_THRESHOLD = 0.14
const BLOOM_SAMPLES = 4
const HIGH_DENSITY = 2

const glowAlphaShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
  fragmentShader: `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  vec4 texel = texture2D(tDiffuse, vUv);
  float glow = max(texel.r, max(texel.g, texel.b));
  gl_FragColor = vec4(texel.rgb, clamp(max(texel.a, glow), 0.0, 1.0));
}
`,
}

export class NightGlow {
  private composer: EffectComposer | null = null
  private bloom: UnrealBloomPass | null = null
  private width = 1
  private height = 1
  private pixelRatio = 1

  constructor(private readonly renderer: WebGLRenderer) {}

  setSize(cssWidth: number, cssHeight: number, pixelRatio: number): void {
    this.width = cssWidth
    this.height = cssHeight
    this.pixelRatio = pixelRatio
    if (this.composer) {
      this.composer.setPixelRatio(pixelRatio)
      this.composer.setSize(cssWidth, cssHeight)
    }
  }

  private ensure(): EffectComposer {
    if (this.composer) return this.composer
    const target = new WebGLRenderTarget(this.width * this.pixelRatio, this.height * this.pixelRatio, {
      type: HalfFloatType,
      samples: this.pixelRatio >= HIGH_DENSITY ? 0 : BLOOM_SAMPLES,
    })
    const composer = new EffectComposer(this.renderer, target)
    this.bloom = new UnrealBloomPass(new Vector2(this.width, this.height), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD)
    this.bloom.compositeMaterial.uniforms.bloomFactors.value = BLOOM_FACTORS
    composer.addPass(this.bloom)
    composer.addPass(new OutputPass())
    composer.addPass(new ShaderPass(glowAlphaShader))
    composer.setPixelRatio(this.pixelRatio)
    composer.setSize(this.width, this.height)
    this.composer = composer
    return composer
  }

  sceneTarget(): WebGLRenderTarget {
    return this.ensure().readBuffer
  }

  warm(): void {
    this.finish(0)
    this.renderer.setRenderTarget(null)
    this.renderer.clear(true, true, true)
  }

  finish(strength: number): void {
    const composer = this.ensure()
    if (this.bloom) this.bloom.strength = strength
    composer.render()
  }

  dispose(): void {
    if (!this.composer) return
    this.composer.passes.forEach((pass) => pass.dispose())
    this.composer.dispose()
    this.composer = null
    this.bloom = null
  }
}
