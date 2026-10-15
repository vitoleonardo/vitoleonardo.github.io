import { Mesh, type MeshPhysicalMaterial, SphereGeometry, Vector3 } from 'three'
import { SUN_REST, toStageY } from '../figures/shapes'
import { tokens } from '../tokens'
import type { FrameContext, PathExtra } from './extras'
import type { PathMaterials } from './materials'
import { SHADOW_LAYER, type ShadowCaster } from './shadow'

const SUN_SELF_GLOW = 0.12

export class SunExtra implements PathExtra {
  readonly object: Mesh<SphereGeometry, MeshPhysicalMaterial>
  readonly casters: ShadowCaster[]
  private readonly world = new Vector3()
  introScale = 1

  constructor(materials: PathMaterials) {
    const material = materials.glossy(tokens.colour.blue, {
      transparent: true,
      roughness: 0.4,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.85,
    })
    material.emissiveIntensity = SUN_SELF_GLOW
    this.object = new Mesh(new SphereGeometry(1, 64, 48), material)
    this.object.frustumCulled = false
    this.object.layers.enable(SHADOW_LAYER)
    this.casters = [{ mesh: this.object, opacity: () => this.object.material.opacity }]
  }

  update(context: FrameContext): boolean {
    const sun = context.frame.sun
    const scale = sun.scale * this.introScale
    const opacity = Math.min(1, Math.max(0, sun.opacity))
    this.object.visible = opacity > 0.002 && scale > 0.002
    if (!this.object.visible) return false
    context.toWorld('hero', sun.x, toStageY(sun.y), this.world)
    const radius = SUN_REST.radius * context.stageScale('hero') * scale
    this.object.position.copy(this.world)
    this.object.scale.set(radius * sun.squashX, radius * sun.squashY, radius * Math.sqrt(sun.squashX * sun.squashY))
    const material = this.object.material
    material.opacity = opacity
    material.depthWrite = opacity > 0.98
    return false
  }

  dispose(): void {
    this.object.geometry.dispose()
  }
}
