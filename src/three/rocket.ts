import {
  Color,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  type MeshPhysicalMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { clamp01 } from '../math'
import { tokens } from '../tokens'
import type { FrameContext, PathExtra } from './extras'
import { PATH_POINT_COUNT } from './figures'
import type { PathMaterials } from './materials'
import { SHADOW_LAYER, type ShadowCaster } from './shadow'

const DESIGN_RADIUS = 17
const NOSE_HEIGHT = 80 / DESIGN_RADIUS
const NOSE_BASE = 19 / DESIGN_RADIUS
const NOSE_DROP = 3 / DESIGN_RADIUS
const NOSE_OGIVE_POWER = 1.8
const WINDOW_DROP = 93 / DESIGN_RADIUS
const WINDOW_RADIUS = 8 / DESIGN_RADIUS
const WINDOW_RIM = 3 / DESIGN_RADIUS
const FIN: [number, number][] = [
  [8, 213],
  [56, 291],
  [12, 271],
].map(([x, y]) => [x / DESIGN_RADIUS, y / DESIGN_RADIUS])
const FIN_DEPTH = 0.3
const GLOW_RADIUS = 170 / DESIGN_RADIUS
const GLOW_RISE = 35 / DESIGN_RADIUS
const GLOW_OPACITY = 0.42
const LIFT_DESIGN = 30
const WINDOW_RIM_COLOUR = '#F4F1EC'

const glowVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const glowFragment = `
uniform vec3 uColour;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float glow = exp(-d * d * 3.2) * (1.0 - smoothstep(0.8, 1.0, d));
  gl_FragColor = vec4(uColour, glow * uOpacity);
}
`

function createNoseGeometry(): LatheGeometry {
  const profile: Vector2[] = []
  const steps = 32
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps
    profile.push(new Vector2(NOSE_BASE * Math.pow(Math.max(0, 1 - ratio * ratio), 1 / NOSE_OGIVE_POWER), ratio * NOSE_HEIGHT))
  }
  return new LatheGeometry(profile, 40)
}

function createFinGeometry(): ExtrudeGeometry {
  const shape = new Shape()
  FIN.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, -y)
    else shape.lineTo(x, -y)
  })
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, {
    depth: FIN_DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 3,
    curveSegments: 4,
  })
  geometry.translate(0, 0, -FIN_DEPTH / 2)
  geometry.computeVertexNormals()
  return geometry
}

export class RocketExtra implements PathExtra {
  readonly object = new Group()
  readonly casters: ShadowCaster[] = []
  private readonly nose: Mesh<LatheGeometry, MeshPhysicalMaterial>
  private readonly fin: Mesh<ExtrudeGeometry, MeshPhysicalMaterial>
  private readonly windowGlass: Mesh<SphereGeometry, MeshPhysicalMaterial>
  private readonly windowRim: Mesh<TorusGeometry, MeshPhysicalMaterial>
  private readonly glow: Mesh<PlaneGeometry, ShaderMaterial>
  private readonly tip = new Vector3()
  private readonly materialsUsed: MeshPhysicalMaterial[]

  constructor(materials: PathMaterials) {
    this.nose = new Mesh(createNoseGeometry(), materials.glossy(tokens.colour.ink, { transparent: true }))
    this.fin = new Mesh(createFinGeometry(), materials.glossy(tokens.colour.red, { transparent: true }))
    this.windowGlass = new Mesh(new SphereGeometry(WINDOW_RADIUS, 24, 16), materials.glossy(tokens.colour.ink, { transparent: true }))
    this.windowRim = new Mesh(
      new TorusGeometry(WINDOW_RADIUS + WINDOW_RIM * 0.5, WINDOW_RIM * 0.55, 12, 40),
      materials.glossy(WINDOW_RIM_COLOUR, { transparent: true, roughness: 0.35 }),
    )
    this.glow = new Mesh(
      new PlaneGeometry(1, 1),
      new ShaderMaterial({
        uniforms: { uColour: { value: new Color(tokens.colour.red) }, uOpacity: { value: 0 } },
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
        transparent: true,
        depthWrite: false,
      }),
    )
    this.glow.renderOrder = -3
    this.materialsUsed = [this.nose.material, this.fin.material, this.windowGlass.material, this.windowRim.material]
    this.object.add(this.glow, this.nose, this.fin, this.windowGlass, this.windowRim)
    this.object.traverse((child) => {
      child.frustumCulled = false
    })
    for (const mesh of [this.nose, this.fin]) {
      mesh.layers.enable(SHADOW_LAYER)
      this.casters.push({ mesh, opacity: () => mesh.material.opacity })
    }
  }

  update(context: FrameContext): boolean {
    const appear = clamp01(context.frame.rocket)
    this.object.visible = appear > 0.002
    if (!this.object.visible) return false
    const figure = context.figure('ai-coding')
    const last = PATH_POINT_COUNT - 1
    context.toWorld('ai-coding', figure.points[last * 3], figure.points[last * 3 + 1], this.tip)
    const unit = context.radius
    const lift = (1 - appear) * LIFT_DESIGN * context.stageScale('ai-coding')
    const baseX = this.tip.x
    const baseY = this.tip.y - lift
    const opacity = appear * appear * (3 - 2 * appear)
    this.materialsUsed.forEach((material) => {
      material.opacity = opacity
      material.depthWrite = opacity > 0.98
    })

    this.nose.position.set(baseX, baseY - NOSE_DROP * unit, 0)
    this.nose.scale.setScalar(unit)
    this.windowGlass.position.set(baseX, baseY - WINDOW_DROP * unit, unit * 0.9)
    this.windowGlass.scale.set(unit, unit, unit * 0.45)
    this.windowRim.position.set(baseX, baseY - WINDOW_DROP * unit, unit * 0.95)
    this.windowRim.scale.setScalar(unit)
    this.fin.position.set(baseX, baseY, 0)
    this.fin.scale.setScalar(unit)
    this.glow.position.set(baseX, baseY + GLOW_RISE * unit, -unit * 3)
    this.glow.scale.setScalar(GLOW_RADIUS * 2 * unit)
    this.glow.material.uniforms.uOpacity.value = GLOW_OPACITY * opacity
    return false
  }

  dispose(): void {
    this.nose.geometry.dispose()
    this.fin.geometry.dispose()
    this.windowGlass.geometry.dispose()
    this.windowRim.geometry.dispose()
    this.glow.geometry.dispose()
    this.glow.material.dispose()
  }
}
