import type Lenis from 'lenis'
import type { PathPort } from './path-port'
import type { Stage } from './stage'

export type MotionMode = 'desktop' | 'mobile' | 'reduced'

export type ProgressSource = () => number

export interface MotionContext {
  readonly mode: MotionMode
  readonly path: PathPort
  readonly lenis: Lenis | null
  readonly stage: Stage | null
  onCleanup(cleanup: () => void): void
}

export interface SectionMotion {
  order: number
  desktop?(context: MotionContext): void
  mobile?(context: MotionContext): void
  reduced?(context: MotionContext): void
}
