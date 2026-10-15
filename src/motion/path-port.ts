import { copyFrame, createFrame } from '../frame'
import type { PathApi, PathFrame } from '../types'
import { scoreFrame, type ScoreTiming } from './score'

export class PathPort {
  private api: PathApi | null = null
  private readonly frame = createFrame()
  private readonly scratch = createFrame()
  private introScale = 1

  attach(api: PathApi): void {
    this.api = api
    api.setIntro(this.introScale)
    api.setFrame(this.frame)
    api.refresh()
  }

  get attached(): boolean {
    return this.api !== null
  }

  score(sceneIndex: number, seconds: number, timing: ScoreTiming): void {
    this.set(scoreFrame(sceneIndex, seconds, timing, this.scratch))
  }

  set(frame: PathFrame): void {
    copyFrame(this.frame, frame)
    this.api?.setFrame(this.frame)
  }

  setIntro(scale: number): void {
    this.introScale = scale
    this.api?.setIntro(scale)
  }

  refresh(): void {
    this.api?.refresh()
  }
}
