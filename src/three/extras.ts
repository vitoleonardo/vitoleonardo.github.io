import type { Object3D, Vector3 } from 'three'
import type { FigureId, PathFrame } from '../types'
import type { Figure, FigureVariant } from './figures'
import type { PathMaterials } from './materials'
import type { ShadowCaster } from './shadow'

export interface FrameContext {
  frame: PathFrame
  time: number
  radius: number
  variant: FigureVariant
  materials: PathMaterials
  figure(id: FigureId): Figure
  toWorld(id: FigureId, stageX: number, stageY: number, out: Vector3, depth?: number): Vector3
  stageScale(id: FigureId): number
  pathWorld: Float32Array
  pathCount: number
}

export interface PathExtra {
  readonly object: Object3D
  readonly casters: ShadowCaster[]
  update(context: FrameContext): boolean
  dispose(): void
}
