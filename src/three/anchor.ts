import type { StageOrigin } from './stages'

export interface Span {
  top: number
  bottom: number
}

export interface Placement extends StageOrigin {
  width: number
  height: number
  screenHeight: number
}

const ANCHORED_HEIGHT = '200vh'

const height = (span: Span): number => span.bottom - span.top

export function planTop(cover: Span, viewport: Span, bounds: Span, size: number, current: number | null): number {
  const margin = Math.max(0, (size - height(viewport)) / 2)
  const needed =
    height(cover) <= size
      ? cover
      : { top: Math.max(cover.top, viewport.top - margin / 2), bottom: Math.min(cover.bottom, viewport.bottom + margin / 2) }
  const highest = Math.max(bounds.top, Math.floor(bounds.bottom - size))
  const inBounds = (top: number): boolean => top >= bounds.top && top <= highest
  if (current !== null && inBounds(current) && current <= needed.top && current + size >= needed.bottom) return current
  const first = Math.floor(cover.top)
  const last = Math.ceil(cover.bottom - size)
  const ideal = Math.round(viewport.top - margin)
  const top = Math.min(Math.max(ideal, Math.min(first, last)), Math.max(first, last))
  return Math.min(Math.max(top, bounds.top), highest)
}

export class CanvasAnchor {
  readonly placement: Placement = { left: 0, top: 0, width: 0, height: 0, screenHeight: 0 }
  private readonly home: { parent: ParentNode; next: ChildNode | null }
  private host: HTMLElement | null | undefined
  private top = 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.home = { parent: canvas.parentNode ?? document.body, next: canvas.nextSibling }
  }

  get anchored(): boolean {
    return this.host !== undefined
  }

  place(stageRects: readonly DOMRectReadOnly[], hero: HTMLElement | null, bleed: number): boolean {
    const hostRect = (hero ?? document.documentElement).getBoundingClientRect()
    const screenHeight = window.innerHeight
    const attaching = !this.anchored
    if (attaching) this.attach()
    const sameHost = !attaching && this.host === hero
    let top = sameHost ? this.top : 0
    if (stageRects.length > 0) {
      const cover = { top: Infinity, bottom: -Infinity }
      for (const rect of stageRects) {
        cover.top = Math.min(cover.top, rect.top - hostRect.top - bleed)
        cover.bottom = Math.max(cover.bottom, rect.bottom - hostRect.top + bleed)
      }
      const viewport = { top: -hostRect.top, bottom: screenHeight - hostRect.top }
      const bounds = { top: 0, bottom: hostRect.height }
      top = planTop(cover, viewport, bounds, this.canvas.clientHeight, sameHost ? this.top : null)
    }
    this.measured(hostRect, top, screenHeight)
    if (sameHost && top === this.top) return false
    if (!sameHost) {
      if (hero) hero.prepend(this.canvas)
      else this.goHome()
      this.canvas.style.zIndex = hero ? '-1' : ''
    }
    this.canvas.style.top = `${top}px`
    this.host = hero
    this.top = top
    return true
  }

  measure(): Placement {
    if (this.anchored) this.measured((this.host ?? document.documentElement).getBoundingClientRect(), this.top, window.innerHeight)
    return this.placement
  }

  release(): boolean {
    if (!this.anchored) return false
    this.goHome()
    this.canvas.removeAttribute('style')
    this.host = undefined
    this.top = 0
    return true
  }

  private attach(): void {
    const style = this.canvas.style
    style.position = 'absolute'
    style.left = '0'
    style.right = 'auto'
    style.bottom = 'auto'
    style.width = '100%'
    style.height = ANCHORED_HEIGHT
  }

  private measured(hostRect: DOMRectReadOnly, top: number, screenHeight: number): void {
    const placement = this.placement
    placement.left = hostRect.left
    placement.top = hostRect.top + top
    placement.width = this.canvas.clientWidth
    placement.height = this.canvas.clientHeight
    placement.screenHeight = screenHeight
  }

  private goHome(): void {
    if (this.canvas.parentNode === this.home.parent && this.canvas.nextSibling === this.home.next) return
    this.home.parent.insertBefore(this.canvas, this.home.next)
  }
}
