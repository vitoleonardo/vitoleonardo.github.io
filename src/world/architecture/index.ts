import { Color, DirectionalLight, FogExp2, Group, Mesh } from 'three'
import { env } from '../../env'
import { merge, projectWorldUVs } from '../geometry'
import { chapterIndex, concreteMaterial, disposeTree, palette, smoothstep } from '../floors/kit'
import type { FloorContext, FloorSet, FrameState } from '../types'
import { finConcreteGeometry } from './fins'
import { createGreenery } from './greenery'
import { createGrounding } from './grounding'
import { installHeightFog } from './height-fog'
import { bakeOcclusion, exteriorShade } from './occlusion'
import { createWindowSpill, spillRhythm } from './spill'
import { createTerraces, terraceConcreteGeometry } from './terraces'

const rimColor = '#86A6FF'
const rimStrength = 0.55
const rimFrom = [26, 34, -40] as const
const rimTarget = [0, 16, 0] as const
const concreteTile = 2.4
const shadeReach = 1.4

function interiorWeight(progress: number): number {
  return smoothstep(chapterIndex.frontend - 1, chapterIndex.frontend, progress) * (1 - smoothstep(chapterIndex.aiProducts, chapterIndex.aiCoding, progress))
}

function floorLitWeight(floorsLit: number, level: number): number {
  return smoothstep(0, 1, floorsLit - (level - 1))
}

function createExteriorConcrete(context: FloorContext): Mesh {
  const geometry = bakeOcclusion(projectWorldUVs(merge([finConcreteGeometry(), terraceConcreteGeometry()]), concreteTile), exteriorShade(shadeReach))
  const mesh = new Mesh(geometry, concreteMaterial(context.textures, { vertexColors: true }))
  mesh.name = 'exterior-concrete'
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export function createArchitecture(context: FloorContext): FloorSet {
  installHeightFog()
  const root = new Group()
  root.name = 'architecture'

  const concrete = createExteriorConcrete(context)
  const terraces = createTerraces()
  const greenery = createGreenery(env.mobile)
  const spill = createWindowSpill(spillRhythm.fins)
  const grounding = createGrounding(!env.mobile)

  const rim = new DirectionalLight(rimColor, 0)
  rim.position.set(...rimFrom)
  rim.target.position.set(...rimTarget)
  const rimBase = new Color(rimColor)
  const rimDawn = new Color(palette.dawn)

  root.add(concrete, terraces.root, greenery.root, spill.mesh, grounding.decals, grounding.shafts, rim, rim.target)

  function update(frame: FrameState): void {
    const { world, progress } = frame
    const fog = context.scene.fog instanceof FogExp2 ? context.scene.fog.density : 0
    const interior = interiorWeight(progress.smooth)
    spill.update(frame, fog, interior)
    grounding.update(frame)
    greenery.update(frame)
    rim.intensity = rimStrength * (0.6 + 0.6 * world.dawn) * (1 - 0.5 * interior)
    rim.color.copy(rimBase).lerp(rimDawn, world.dawn * 0.6)
    const edgeLevel = (1 - 0.6 * interior) * (1 - 0.5 * world.dawn)
    terraces.setEdgeLight((level) => (0.08 + 0.7 * floorLitWeight(world.floorsLit, level)) * edgeLevel)
  }

  function dispose(): void {
    disposeTree(root)
    for (const texture of [...spill.textures, ...grounding.textures]) texture.dispose()
  }

  return { id: 'street', root, proxies: [], update, dispose }
}
