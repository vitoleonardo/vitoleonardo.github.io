import type { PerspectiveCamera } from 'three'
import type { ChapterSource } from './chapter-source'

const CURRENT_ATTRIBUTE = 'aria-current'
const MATRIX_TRANSLATION_Y_INDEX = 13

const FLOOR_BASE_METRES: Readonly<Record<string, number>> = {
  hero: 0,
  index: 0,
  'stop-frontend': 0,
  'stop-backend': 4,
  'stop-cloud': 8,
  'stop-data': 12,
  'stop-ai-products': 16,
  'stop-ai-coding': 20,
  'stop-teaching': 24,
  about: 28,
  'say-hi': 40,
}

export interface AltitudeSource {
  camera: Pick<PerspectiveCamera, 'matrixWorld'>
  onFrame(listener: () => void): () => void
}

export interface Rail {
  followCamera(world: AltitudeSource): void
  dispose(): void
}

export function formatAltitude(metres: number): string {
  return String(Math.max(0, Math.round(metres)))
}

export function floorBaseMetres(chapterId: string): number {
  return FLOOR_BASE_METRES[chapterId] ?? 0
}

export function initRail(chapters: ChapterSource, sectionIds: readonly string[]): Rail {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.floor-rail a[href^="#"]'))
  const altimeter = document.querySelector<HTMLElement>('.altimeter-value')
  let shown = ''
  let cameraFollowing = false
  let stopFollowing: (() => void) | null = null

  function showAltitude(metres: number): void {
    const text = formatAltitude(metres)
    if (!altimeter || text === shown) return
    shown = text
    altimeter.textContent = text
  }

  function markCurrent(index: number): void {
    const currentId = sectionIds[index]
    for (const link of links) {
      if (link.getAttribute('href') === `#${currentId}`) link.setAttribute(CURRENT_ATTRIBUTE, 'true')
      else link.removeAttribute(CURRENT_ATTRIBUTE)
    }
    if (!cameraFollowing) showAltitude(floorBaseMetres(currentId))
  }

  markCurrent(chapters.current)
  const unsubscribe = chapters.subscribe(markCurrent)

  return {
    followCamera(world) {
      stopFollowing?.()
      cameraFollowing = true
      stopFollowing = world.onFrame(() => {
        showAltitude(world.camera.matrixWorld.elements[MATRIX_TRANSLATION_Y_INDEX])
      })
    },
    dispose() {
      unsubscribe()
      stopFollowing?.()
    },
  }
}
