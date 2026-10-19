import type { LoaderStage } from '../../../src/dom/loader-motif'

export const STAGE_LEVEL: Readonly<Record<LoaderStage, number>> = { script: 1, textures: 2, compiled: 3, ready: 4 }

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value))
  return node
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

export function retrigger(node: HTMLElement, className: string): void {
  node.classList.remove(className)
  void node.offsetWidth
  node.classList.add(className)
}

export function applyLevel(root: HTMLElement, stage: LoaderStage): void {
  for (let level = 1; level <= STAGE_LEVEL[stage]; level++) root.classList.add(`is-s${level}`)
}

export function flipTransform(from: DOMRect, to: DOMRect): string {
  const scale = to.height / from.height
  return `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})`
}

export function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3)
}

export function animateNumber(
  node: HTMLElement,
  from: number,
  to: number,
  durationMs: number,
  isAlive: () => boolean,
): void {
  const start = performance.now()
  const tick = (now: number): void => {
    const progress = Math.min(1, (now - start) / durationMs)
    node.textContent = String(Math.round(from + (to - from) * easeOutCubic(progress)))
    if (progress < 1 && isAlive()) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
