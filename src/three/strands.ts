import { Group, Mesh } from 'three'
import { DATA_BRAID } from '../figures/shapes'
import { clamp01, smoothstep } from '../math'
import { tokens } from '../tokens'
import type { FrameContext, PathExtra } from './extras'
import { type Figure, lastIndexWhere, PATH_POINT_COUNT } from './figures'
import type { PathMaterials } from './materials'
import { SHADOW_LAYER, type ShadowCaster } from './shadow'
import { PathTube } from './tube'

const STRAND_COLOURS = [tokens.colour.blue, '#3D69FF', '#143ADC', '#5A80FF']
const STRAND_RINGS = 150
const STRAND_SEGMENTS = 12
const STRAND_RADIUS_DESIGN = 5.5
const STRAND_RADIUS_MOBILE_PX = 3.5
const SPREAD = 40
const BRAID = 11
const BRAID_LENGTH = 55
const BRAID_PHASE = 1.7
const BRAID_SPEED = 3
const WEAVE_DEPTH = 7
const ENVELOPE_FROM = 380
const FADE_FROM = 620
const FADE_TO = 900

export class DataStrands implements PathExtra {
  readonly object = new Group()
  readonly casters: ShadowCaster[] = []
  private readonly tubes: PathTube[] = []
  private readonly meshes: Mesh[] = []
  private readonly raw = new Float32Array(PATH_POINT_COUNT * 3)
  private readonly rings = new Float32Array(STRAND_RINGS * 3)
  private readonly mergeIndex = new Map<Figure, number>()

  constructor(materials: PathMaterials) {
    STRAND_COLOURS.forEach((colour) => {
      const material = materials.glossy(colour)
      const tube = new PathTube(STRAND_RINGS, STRAND_SEGMENTS, 4)
      const body = new Mesh(tube.geometry, material)
      const caps = new Mesh(tube.capsGeometry, material)
      for (const mesh of [body, caps]) {
        mesh.frustumCulled = false
        mesh.layers.enable(SHADOW_LAYER)
        this.casters.push({ mesh, opacity: () => 1 })
        this.meshes.push(mesh)
        this.object.add(mesh)
      }
      this.tubes.push(tube)
    })
  }

  private mergeFor(figure: Figure): number {
    let index = this.mergeIndex.get(figure)
    if (index === undefined) {
      index = Math.max(2, lastIndexWhere(figure, (x) => x <= DATA_BRAID.mergeX))
      this.mergeIndex.set(figure, index)
    }
    return index
  }

  update(context: FrameContext): boolean {
    const amount = clamp01(context.frame.strands)
    this.object.visible = amount > 0.002
    if (!this.object.visible) return false
    const figure = context.figure('data')
    const merge = this.mergeFor(figure)
    const scale = context.stageScale('data')
    const path = context.pathWorld
    const time = context.time
    const radius = context.variant === 'mobile' ? STRAND_RADIUS_MOBILE_PX : STRAND_RADIUS_DESIGN * scale
    this.tubes.forEach((tube, k) => {
      for (let i = 0; i <= merge; i++) {
        const before = Math.max(0, i - 1)
        const after = Math.min(PATH_POINT_COUNT - 1, i + 1)
        const tx = path[after * 3] - path[before * 3]
        const ty = path[after * 3 + 1] - path[before * 3 + 1]
        const length = Math.hypot(tx, ty) || 1
        const x = figure.points[i * 3]
        const envelope = 1 - smoothstep(ENVELOPE_FROM, FADE_TO, x)
        const fade = 1 - smoothstep(FADE_FROM, FADE_TO, x)
        const phase = x / BRAID_LENGTH + k * BRAID_PHASE - time * BRAID_SPEED
        const offset = amount * ((k - 1.5) * SPREAD * envelope + BRAID * Math.sin(phase) * fade) * scale
        this.raw[i * 3] = path[i * 3] + (ty / length) * offset
        this.raw[i * 3 + 1] = path[i * 3 + 1] - (tx / length) * offset
        this.raw[i * 3 + 2] = path[i * 3 + 2] + WEAVE_DEPTH * Math.cos(phase) * fade * amount * scale
      }
      for (let ring = 0; ring < STRAND_RINGS; ring++) {
        const position = (ring / (STRAND_RINGS - 1)) * merge
        const floor = Math.min(merge - 1, Math.floor(position))
        const t = position - floor
        for (let axis = 0; axis < 3; axis++) {
          this.rings[ring * 3 + axis] = this.raw[floor * 3 + axis] + (this.raw[(floor + 1) * 3 + axis] - this.raw[floor * 3 + axis]) * t
        }
      }
      const shown = tube.update(this.rings, radius * (0.4 + 0.6 * amount))
      this.meshes[k * 2].visible = shown
      this.meshes[k * 2 + 1].visible = shown
    })
    return true
  }

  dispose(): void {
    this.tubes.forEach((tube) => tube.dispose())
  }
}
