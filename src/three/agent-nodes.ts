import { Group, Mesh, type MeshPhysicalMaterial, SphereGeometry, Vector3 } from 'three'
import { AGENT_LOOP, toStageY } from '../figures/shapes'
import { clamp01 } from '../math'
import { tokens } from '../tokens'
import type { FrameContext, PathExtra } from './extras'
import type { PathMaterials } from './materials'
import { SHADOW_LAYER, type ShadowCaster } from './shadow'

const DOT_RADIUS_DESIGN = 8
const DOT_RADIUS_MOBILE_PX = 6
const STAGGER = 0.12
const MOBILE_LOOP = { x: 700, y: 420, radiusX: 300, radiusY: 300 }
const ANGLES = [-Math.PI / 2, Math.PI, 0, Math.PI / 2]

export class AgentNodes implements PathExtra {
  readonly object = new Group()
  readonly casters: ShadowCaster[] = []
  private readonly dots: Mesh<SphereGeometry, MeshPhysicalMaterial>[] = []
  private readonly world = new Vector3()

  constructor(materials: PathMaterials) {
    const geometry = new SphereGeometry(1, 24, 16)
    const material = materials.glossy(tokens.colour.nightText, { roughness: 0.3, clearcoat: 0.6 })
    material.emissiveIntensity = 0.25
    ANGLES.forEach(() => {
      const dot = new Mesh(geometry, material)
      dot.frustumCulled = false
      dot.layers.enable(SHADOW_LAYER)
      this.casters.push({ mesh: dot, opacity: () => 1 })
      this.dots.push(dot)
      this.object.add(dot)
    })
  }

  update(context: FrameContext): boolean {
    const amount = clamp01(context.frame.nodes)
    this.object.visible = amount > 0.002
    if (!this.object.visible) return false
    const mobile = context.figure('ai-products').fill
    const scale = context.stageScale('ai-products')
    const radius = mobile ? DOT_RADIUS_MOBILE_PX : DOT_RADIUS_DESIGN * scale
    this.dots.forEach((dot, index) => {
      const angle = ANGLES[index]
      const x = mobile ? MOBILE_LOOP.x + MOBILE_LOOP.radiusX * Math.cos(angle) : AGENT_LOOP.x + AGENT_LOOP.radius * Math.cos(angle)
      const y = mobile ? MOBILE_LOOP.y + MOBILE_LOOP.radiusY * Math.sin(angle) : toStageY(AGENT_LOOP.y + AGENT_LOOP.radius * Math.sin(angle))
      const local = clamp01((amount - index * STAGGER) / (1 - 3 * STAGGER))
      const pop = local < 1 ? 1 + 2.7 * Math.pow(local - 1, 3) + 1.7 * Math.pow(local - 1, 2) : 1
      context.toWorld('ai-products', x, y, this.world, context.radius * 1.05)
      dot.position.copy(this.world)
      dot.scale.setScalar(Math.max(0.001, radius * pop))
      dot.visible = local > 0.001
    })
    return false
  }

  dispose(): void {
    this.dots[0]?.geometry.dispose()
  }
}
