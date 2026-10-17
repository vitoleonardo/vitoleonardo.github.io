export interface WordToken {
  kind: 'word' | 'space'
  text: string
}

const MIN_STAGGER_MS = 40
const MAX_STAGGER_MS = 90
const TARGET_TOTAL_MS = 900

export function tokenizeWords(text: string): WordToken[] {
  const parts = text.match(/\s+|\S+/g) ?? []
  return parts.map((part) => ({ kind: /^\s/.test(part) ? 'space' : 'word', text: part }))
}

export function readableText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function staggerMilliseconds(wordCount: number): number {
  if (wordCount <= 1) return MAX_STAGGER_MS
  return Math.min(MAX_STAGGER_MS, Math.max(MIN_STAGGER_MS, Math.round(TARGET_TOTAL_MS / wordCount)))
}

function collectTextNodes(element: HTMLElement): Text[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text)
  return nodes
}

export function splitIntoWords(element: HTMLElement): number {
  if (element.hasAttribute('data-split')) return 0
  const label = readableText(element.textContent)
  let wordIndex = 0
  for (const node of collectTextNodes(element)) {
    const fragment = document.createDocumentFragment()
    for (const token of tokenizeWords(node.data)) {
      if (token.kind === 'space') {
        fragment.append(token.text)
        continue
      }
      const word = document.createElement('span')
      word.className = 'word'
      word.setAttribute('aria-hidden', 'true')
      word.style.setProperty('--word-index', String(wordIndex))
      word.textContent = token.text
      fragment.append(word)
      wordIndex += 1
    }
    node.replaceWith(fragment)
  }
  element.setAttribute('aria-label', label)
  element.style.setProperty('--word-stagger', `${staggerMilliseconds(wordIndex)}ms`)
  element.setAttribute('data-split', '')
  return wordIndex
}
