import { Color, DirectionalLight, FogExp2, Group } from 'three'
import { env } from '../../env'
import { chapterIndex, disposeTree, palette, smoothstep } from '../floors/kit'
import type { FloorContext, FloorSet, FrameState } from '../types'
import { createExoskeleton } from './exoskeleton'
import { createFins } from './fins'
import { createGrounding } from './grounding'
import { installHeightFog } from './height-fog'
import { createHelix } from './helix'
import { readLook, type LookId } from './look'
import { createWindowSpill, spillRhythm, type FacadeRhythm } from './spill'

const rimColor = '#86A6FF'
const rimFrom = [26, 34, -40] as const
const rimTarget = [0, 16, 0] as const

interface LookTuning {
  rim: number
  rhythm: FacadeRhythm
}

const lookTuning: Readonly<Record<LookId, LookTuning>> = {
  a: { rim: 0.45, rhythm: spillRhythm.fins },
  b: { rim: 1.1, rhythm: spillRhythm.diagrid },
  c: { rim: 0.6, rhythm: spillRhythm.terraces },
}

function interiorWeight(progress: number): number {
  return smoothstep(chapterIndex.frontend - 1, chapterIndex.frontend, progress) * (1 - smoothstep(chapterIndex.aiProducts, chapterIndex.aiCoding, progress))
}

interface LookSet {
  root: Group
  update(frame: FrameState, interior: number): void
}

function floorLitWeight(floorsLit: number, level: number): number {
  return smoothstep(0, 1, floorsLit - (level - 1))
}

function buildLook(look: LookId, context: FloorContext): LookSet {
  if (look === 'a') return { root: createFins(context.textures), update: () => undefined }
  if (look === 'b') {
    const exoskeleton = createExoskeleton()
    return {
      root: exoskeleton.root,
      update(frame, interior) {
        exoskeleton.nodes.set(0.5 * (1 - 0.6 * interior) * (1 - 0.7 * frame.world.dawn) * (0.5 + 0.5 * frame.world.practicals))
      },
    }
  }
  const helix = createHelix(context.textures)
  return {
    root: helix.root,
    update(frame, interior) {
      const { world } = frame
      helix.spine.set(1.2 * (1 - 0.5 * world.dawn) * (0.6 + 0.4 * world.practicals))
      const edgeLevel = (1 - 0.6 * interior) * (1 - 0.5 * world.dawn)
      helix.setEdgeLight((level) => (0.08 + 0.7 * floorLitWeight(world.floorsLit, level)) * edgeLevel)
    },
  }
}

export function createArchitecture(context: FloorContext): FloorSet {
  installHeightFog()
  const look = readLook(window.location.search)
  const tuning = lookTuning[look]
  const root = new Group()
  root.name = `architecture-${look}`

  const exterior = buildLook(look, context)
  const spill = createWindowSpill(tuning.rhythm)
  const grounding = createGrounding(!env.mobile)

  const rim = new DirectionalLight(rimColor, 0)
  rim.position.set(...rimFrom)
  rim.target.position.set(...rimTarget)
  const rimBase = new Color(rimColor)
  const rimDawn = new Color(palette.dawn)

  root.add(exterior.root, spill.mesh, grounding.decals, grounding.shafts, rim, rim.target)

  function update(frame: FrameState): void {
    const { world, progress } = frame
    const fog = context.scene.fog instanceof FogExp2 ? context.scene.fog.density : 0
    const interior = interiorWeight(progress.smooth)
    spill.update(frame, fog, interior)
    grounding.update(frame)
    rim.intensity = tuning.rim * (0.6 + 0.6 * world.dawn) * (1 - 0.5 * interior)
    rim.color.copy(rimBase).lerp(rimDawn, world.dawn * 0.6)
    exterior.update(frame, interior)
  }

  function dispose(): void {
    disposeTree(root)
    for (const texture of [...spill.textures, ...grounding.textures]) texture.dispose()
  }

  return { id: 'street', root, proxies: [], update, dispose }
}
