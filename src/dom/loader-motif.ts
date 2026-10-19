export type LoaderStage = 'script' | 'textures' | 'compiled' | 'ready'

export const LOADER_STAGES: readonly LoaderStage[] = ['script', 'textures', 'compiled', 'ready']

export interface HandoffTarget {
  altimeter: DOMRect
  rail: DOMRect
  altitude: string
}

export interface LoaderMotif {
  mount(root: HTMLElement): void
  setStage(stage: LoaderStage): void
  handoff(target: HandoffTarget): Promise<void>
  destroy(): void
}
