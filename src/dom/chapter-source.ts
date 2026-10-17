export type ChapterListener = (index: number) => void

export interface ChapterSource {
  readonly current: number
  subscribe(listener: ChapterListener): () => void
}

export interface ChapterFeed extends ChapterSource {
  connect(source: ChapterSource): void
}

interface ConductorLike {
  readonly chapter: number
  onChapterChange(listener: (chapter: number) => void): () => void
}

export function conductorSource(conductor: ConductorLike): ChapterSource {
  return {
    get current() {
      return conductor.chapter
    },
    subscribe: (listener) => conductor.onChapterChange((chapter) => listener(chapter)),
  }
}

export function chapterAtViewportCentre(tops: readonly number[], bottoms: readonly number[], centre: number): number {
  const index = tops.findIndex((top, position) => centre >= top && centre < bottoms[position])
  if (index >= 0) return index
  return centre < (tops[0] ?? 0) ? 0 : Math.max(0, tops.length - 1)
}

export function viewportSource(sections: readonly HTMLElement[]): ChapterSource {
  const listeners = new Set<ChapterListener>()
  let observer: IntersectionObserver | null = null
  let latest = -1

  function locate(): number {
    const rects = sections.map((section) => section.getBoundingClientRect())
    return chapterAtViewportCentre(
      rects.map((rect) => rect.top),
      rects.map((rect) => rect.bottom),
      window.innerHeight / 2,
    )
  }

  function observe(): void {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const index = sections.indexOf(entry.target as HTMLElement)
          if (index < 0 || index === latest) continue
          latest = index
          for (const listener of listeners) listener(index)
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    )
    for (const section of sections) observer.observe(section)
  }

  return {
    get current() {
      return latest >= 0 ? latest : locate()
    },
    subscribe(listener) {
      listeners.add(listener)
      if (!observer) observe()
      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        observer?.disconnect()
        observer = null
        latest = -1
      }
    },
  }
}

export function createChapterFeed(): ChapterFeed {
  const listeners = new Set<ChapterListener>()
  let release: (() => void) | null = null
  let emitted = -1

  function emit(index: number): void {
    if (index === emitted) return
    emitted = index
    for (const listener of listeners) listener(index)
  }

  return {
    get current() {
      return Math.max(0, emitted)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    connect(source) {
      release?.()
      release = source.subscribe(emit)
      emit(source.current)
    },
  }
}
