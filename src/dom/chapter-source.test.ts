import { describe, expect, it } from 'vitest'
import { chapterAtViewportCentre, createChapterFeed, type ChapterListener, type ChapterSource } from './chapter-source'

function fakeSource(initial: number): ChapterSource & { push(index: number): void; subscriberCount(): number } {
  const listeners = new Set<ChapterListener>()
  let current = initial
  return {
    get current() {
      return current
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    push(index) {
      current = index
      for (const listener of listeners) listener(index)
    },
    subscriberCount: () => listeners.size,
  }
}

describe('chapterAtViewportCentre', () => {
  const tops = [0, 800, 1900]
  const bottoms = [800, 1900, 2600]

  it('picks the section that holds the centre line', () => {
    expect(chapterAtViewportCentre(tops, bottoms, 400)).toBe(0)
    expect(chapterAtViewportCentre(tops, bottoms, 800)).toBe(1)
    expect(chapterAtViewportCentre(tops, bottoms, 2599)).toBe(2)
  })

  it('clamps when the centre line is outside every section', () => {
    expect(chapterAtViewportCentre(tops, bottoms, -50)).toBe(0)
    expect(chapterAtViewportCentre(tops, bottoms, 5000)).toBe(2)
  })
})

describe('createChapterFeed', () => {
  it('announces the first connected chapter, including chapter zero', () => {
    const feed = createChapterFeed()
    const seen: number[] = []
    feed.subscribe((index) => seen.push(index))
    feed.connect(fakeSource(0))
    expect(seen).toEqual([0])
  })

  it('forwards changes from the connected source', () => {
    const feed = createChapterFeed()
    const source = fakeSource(0)
    const seen: number[] = []
    feed.subscribe((index) => seen.push(index))
    feed.connect(source)
    source.push(3)
    source.push(3)
    source.push(4)
    expect(seen).toEqual([0, 3, 4])
    expect(feed.current).toBe(4)
  })

  it('hands over to a new source and drops the old one', () => {
    const feed = createChapterFeed()
    const first = fakeSource(2)
    const second = fakeSource(2)
    const seen: number[] = []
    feed.subscribe((index) => seen.push(index))
    feed.connect(first)
    feed.connect(second)
    expect(first.subscriberCount()).toBe(0)
    expect(second.subscriberCount()).toBe(1)
    first.push(7)
    expect(seen).toEqual([2])
    second.push(5)
    expect(seen).toEqual([2, 5])
  })

  it('reports chapter zero before any source connects', () => {
    expect(createChapterFeed().current).toBe(0)
  })
})
