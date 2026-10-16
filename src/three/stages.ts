import type { FigureId } from '../types'

export const DESIGN_WIDTH = 1280
const DESIGN_HEIGHT = 880
const DESIGN_OVERSHOOT = 60
const EDGE_REACH_FACTOR = 2

export interface StageFit {
  left: number
  top: number
  scale: number
  scaleX: number
  scaleY: number
  stretchLeft: number
  stretchRight: number
  stretchTop: number
  stretchBottom: number
}

export interface PagePoint {
  x: number
  y: number
}

export interface StageOrigin {
  left: number
  top: number
}

export const VIEWPORT_ORIGIN: StageOrigin = { left: 0, top: 0 }

export class StageRegistry {
  private elements = new Map<FigureId, HTMLElement>()
  private fits = new Map<string, StageFit>()
  private rects = new Map<FigureId, DOMRect>()
  private viewportWidth = 1
  private viewportHeight = 1
  private edgeMargin = 80
  private stretchVertically = true
  private origin = VIEWPORT_ORIGIN

  constructor(private readonly root: ParentNode = document) {
    this.collect()
  }

  collect(): void {
    this.elements.clear()
    this.rects.clear()
    this.root.querySelectorAll<HTMLElement>('[data-path-stage]').forEach((element) => {
      const id = element.dataset.pathStage as FigureId | undefined
      if (id && !this.elements.has(id)) this.elements.set(id, element)
    })
  }

  forget(): void {
    this.rects.clear()
  }

  measureAll(): void {
    this.rects.clear()
    this.elements.forEach((element, id) => this.rects.set(id, element.getBoundingClientRect()))
  }

  rect(id: FigureId): DOMRect | undefined {
    let rect = this.rects.get(id)
    if (!rect) {
      rect = this.elements.get(id)?.getBoundingClientRect()
      if (rect) this.rects.set(id, rect)
    }
    return rect
  }

  positionSignature(ids: FigureId[], origin: StageOrigin = VIEWPORT_ORIGIN): number {
    let signature = 0
    for (const id of ids) {
      const rect = this.rect(id)
      if (rect) signature += (rect.left - origin.left) * 1.37 + (rect.top - origin.top) * 0.73 + rect.width * 0.11
    }
    return signature
  }

  beginFrame(viewportWidth: number, viewportHeight: number, edgeMargin: number, stretchVertically: boolean, origin: StageOrigin = VIEWPORT_ORIGIN): void {
    this.viewportWidth = viewportWidth
    this.viewportHeight = viewportHeight
    this.edgeMargin = edgeMargin
    this.stretchVertically = stretchVertically
    this.origin = origin
    this.fits.clear()
  }

  fit(id: FigureId, fillStage = false): StageFit {
    const key = fillStage ? `fill:${id}` : id
    const cached = this.fits.get(key)
    if (cached) return cached
    const rect = this.rect(id)
    const usable = rect && rect.width > 0 && rect.height > 0
    const boxLeft = usable ? rect.left - this.origin.left : 0
    const boxTop = usable ? rect.top - this.origin.top : 0
    const boxWidth = usable ? rect.width : this.viewportWidth
    const boxHeight = usable ? rect.height : this.viewportHeight
    const containScale = Math.min(boxWidth / DESIGN_WIDTH, boxHeight / DESIGN_HEIGHT)
    const scaleX = fillStage ? boxWidth / DESIGN_WIDTH : containScale
    const scaleY = fillStage ? boxHeight / DESIGN_HEIGHT : containScale
    const left = boxLeft + (boxWidth - DESIGN_WIDTH * scaleX) / 2
    const top = boxTop + (boxHeight - DESIGN_HEIGHT * scaleY) / 2
    const right = left + DESIGN_WIDTH * scaleX
    const bottom = top + DESIGN_HEIGHT * scaleY
    const margin = this.edgeMargin
    const edgeReach = margin * EDGE_REACH_FACTOR
    const fit: StageFit = {
      left,
      top,
      scale: Math.min(scaleX, scaleY),
      scaleX,
      scaleY,
      stretchLeft: left <= this.viewportWidth ? Math.max(scaleX, (left + margin) / DESIGN_OVERSHOOT) : scaleX,
      stretchRight: right >= 0 ? Math.max(scaleX, (this.viewportWidth + margin - right) / DESIGN_OVERSHOOT) : scaleX,
      stretchTop: this.stretchVertically && top <= edgeReach ? Math.max(scaleY, (top + margin) / DESIGN_OVERSHOOT) : scaleY,
      stretchBottom:
        this.stretchVertically && bottom >= this.viewportHeight - edgeReach
          ? Math.max(scaleY, (this.viewportHeight + margin - bottom) / DESIGN_OVERSHOOT)
          : scaleY,
    }
    this.fits.set(key, fit)
    return fit
  }
}

export function designToPage(fit: StageFit, designX: number, designY: number, out: PagePoint): PagePoint {
  if (designX < 0) out.x = fit.left + designX * fit.stretchLeft
  else if (designX > DESIGN_WIDTH) out.x = fit.left + DESIGN_WIDTH * fit.scaleX + (designX - DESIGN_WIDTH) * fit.stretchRight
  else out.x = fit.left + designX * fit.scaleX
  if (designY < 0) out.y = fit.top + designY * fit.stretchTop
  else if (designY > DESIGN_HEIGHT) out.y = fit.top + DESIGN_HEIGHT * fit.scaleY + (designY - DESIGN_HEIGHT) * fit.stretchBottom
  else out.y = fit.top + designY * fit.scaleY
  return out
}

export function designToPageStrict(fit: StageFit, designX: number, designY: number, out: PagePoint): PagePoint {
  out.x = fit.left + designX * fit.scaleX
  out.y = fit.top + designY * fit.scaleY
  return out
}
