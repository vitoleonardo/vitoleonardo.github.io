export type FigureId =
  | 'hero'
  | 'index'
  | 'frontend'
  | 'backend'
  | 'cloud'
  | 'data'
  | 'ai-products'
  | 'ai-coding'
  | 'teaching'
  | 'about'
  | 'say-hi'

export interface SunFrame {
  x: number
  y: number
  scale: number
  squashX: number
  squashY: number
  opacity: number
}

export interface PathFrame {
  from: FigureId
  to: FigureId
  morph: number
  heroGrow: number
  sun: SunFrame
  inkStart: number
  inkEnd: number
  night: number
  shadow: number
  ripple: number
  pulse: number
  strands: number
  nodes: number
  rocket: number
}

export interface PathApi {
  setFrame(frame: PathFrame): void
  setIntro(sunScale: number): void
  refresh(): void
  dispose(): void
}
