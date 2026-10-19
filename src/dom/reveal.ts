import type { ChapterSource } from './chapter-source'
import { splitIntoWords } from './words'

const ACTIVE_CLASS = 'is-active'
const ENTERED_CLASS = 'has-entered'
const WORD_HEADING_SELECTOR = '[data-reveal="words"]'

export interface RevealOptions {
  sections: readonly HTMLElement[]
  chapters: ChapterSource
  splitWords: boolean
}

export function initReveal(options: RevealOptions): () => void {
  const { sections, chapters } = options
  let active = -1

  if (options.splitWords) {
    for (const heading of document.querySelectorAll<HTMLElement>(WORD_HEADING_SELECTOR)) splitIntoWords(heading)
  }

  function activate(index: number): void {
    if (index === active) return
    const previous = sections[active]
    if (previous) {
      previous.classList.remove(ACTIVE_CLASS)
      previous.classList.add(ENTERED_CLASS)
    }
    active = index
    sections[index]?.classList.add(ACTIVE_CLASS)
  }

  activate(chapters.current)
  const unsubscribe = chapters.subscribe(activate)

  return () => {
    unsubscribe()
    for (const section of sections) section.classList.remove(ACTIVE_CLASS, ENTERED_CLASS)
  }
}
