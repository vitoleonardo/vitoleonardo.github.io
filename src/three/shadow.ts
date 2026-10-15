import {
  Color,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  LinearFilter,
  MeshBasicMaterial,
  NoBlending,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Material,
  type WebGLRenderer,
} from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export const SHADOW_LAYER = 1
const RESOLUTION_DIVISOR = 2
const BLUR_STEP_TEXELS = 1.6

const fullScreenVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const blurFragment = `
uniform sampler2D tMap;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
  float weights[5] = float[5](1.0, 0.8825, 0.6065, 0.3247, 0.1353);
  float total = weights[0];
  float sum = texture2D(tMap, vUv).r * weights[0];
  for (int i = 1; i < 5; i++) {
    vec2 offset = uStep * float(i);
    sum += texture2D(tMap, vUv + offset).r * weights[i];
    sum += texture2D(tMap, vUv - offset).r * weights[i];
    total += weights[i] * 2.0;
  }
  gl_FragColor = vec4(vec3(sum / total), 1.0);
}
`

const compositeFragment = `
uniform sampler2D tMap;
uniform vec3 uTint;
uniform float uStrength;
uniform vec2 uOffset;
varying vec2 vUv;
void main() {
  float coverage = texture2D(tMap, vUv + uOffset).r;
  gl_FragColor = vec4(uTint, coverage * uStrength);
}
`

export interface ShadowCaster {
  mesh: Mesh
  opacity: () => number
}

export class ContactShadow {
  private readonly targetA: WebGLRenderTarget
  private readonly targetB: WebGLRenderTarget
  private readonly blurMaterial: ShaderMaterial
  private readonly compositeMaterial: ShaderMaterial
  private readonly quad: FullScreenQuad
  private readonly blurStep = new Vector2()
  private readonly compositeOffset = new Vector2()
  private readonly casterMaterials = new Map<Mesh, MeshBasicMaterial>()
  private readonly warmCasterKey = new Mesh()
  private width = 1
  private height = 1

  constructor() {
    const options = { minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false }
    this.targetA = new WebGLRenderTarget(1, 1, options)
    this.targetB = new WebGLRenderTarget(1, 1, options)
    this.blurMaterial = new ShaderMaterial({
      uniforms: { tMap: { value: null }, uStep: { value: this.blurStep } },
      vertexShader: fullScreenVertex,
      fragmentShader: blurFragment,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    })
    this.compositeMaterial = new ShaderMaterial({
      uniforms: {
        tMap: { value: this.targetA.texture },
        uTint: { value: new Color('#1A2140') },
        uStrength: { value: 0.2 },
        uOffset: { value: this.compositeOffset },
      },
      vertexShader: fullScreenVertex,
      fragmentShader: compositeFragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.blurMaterial)
  }

  async prepare(renderer: WebGLRenderer): Promise<void> {
    const warmScene = new Scene()
    const plane = new PlaneGeometry(1, 1)
    const casterTemplate = this.casterMaterial(this.warmCasterKey)
    warmScene.add(new Mesh(plane, casterTemplate), new Mesh(plane, this.blurMaterial), new Mesh(plane, this.compositeMaterial))
    const warmCamera = new OrthographicCamera()
    const savedTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(this.targetA)
    const compiling = renderer.compileAsync(warmScene, warmCamera)
    renderer.setRenderTarget(savedTarget)
    await compiling
    plane.dispose()
  }

  setSize(cssWidth: number, cssHeight: number): void {
    this.width = Math.max(1, Math.round(cssWidth / RESOLUTION_DIVISOR))
    this.height = Math.max(1, Math.round(cssHeight / RESOLUTION_DIVISOR))
    this.targetA.setSize(this.width, this.height)
    this.targetB.setSize(this.width, this.height)
  }

  private casterMaterial(mesh: Mesh): MeshBasicMaterial {
    let material = this.casterMaterials.get(mesh)
    if (!material) {
      material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false })
      this.casterMaterials.set(mesh, material)
    }
    return material
  }

  render(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    casters: ShadowCaster[],
    strength: number,
    offsetCssPx: number,
    output: WebGLRenderTarget | null = null,
  ): void {
    if (strength <= 0.001) return
    const originalMaterials: (Material | Material[])[] = []
    const swapped: Mesh[] = []
    for (const caster of casters) {
      const opacity = caster.opacity()
      if (!caster.mesh.visible || opacity <= 0.001) continue
      const material = this.casterMaterial(caster.mesh)
      material.opacity = opacity
      originalMaterials.push(caster.mesh.material)
      caster.mesh.material = material
      swapped.push(caster.mesh)
    }
    if (swapped.length === 0) return
    const savedLayers = camera.layers.mask
    camera.layers.set(SHADOW_LAYER)
    const savedBackground = scene.background
    scene.background = null
    renderer.setRenderTarget(this.targetA)
    renderer.clear(true, true, false)
    renderer.render(scene, camera)
    scene.background = savedBackground
    camera.layers.mask = savedLayers
    swapped.forEach((mesh, index) => {
      mesh.material = originalMaterials[index]
    })

    const blurUniforms = this.blurMaterial.uniforms
    this.quad.material = this.blurMaterial
    blurUniforms.tMap.value = this.targetA.texture
    this.blurStep.set(BLUR_STEP_TEXELS / this.width, 0)
    renderer.setRenderTarget(this.targetB)
    this.quad.render(renderer)
    blurUniforms.tMap.value = this.targetB.texture
    this.blurStep.set(0, BLUR_STEP_TEXELS / this.height)
    renderer.setRenderTarget(this.targetA)
    this.quad.render(renderer)
    renderer.setRenderTarget(output)

    const compositeUniforms = this.compositeMaterial.uniforms
    compositeUniforms.uStrength.value = strength
    this.compositeOffset.set(0, offsetCssPx / RESOLUTION_DIVISOR / this.height)
    this.quad.material = this.compositeMaterial
    this.quad.render(renderer)
  }

  dispose(): void {
    this.targetA.dispose()
    this.targetB.dispose()
    this.blurMaterial.dispose()
    this.compositeMaterial.dispose()
    this.casterMaterials.forEach((material) => material.dispose())
    this.casterMaterials.clear()
    this.quad.dispose()
  }
}
