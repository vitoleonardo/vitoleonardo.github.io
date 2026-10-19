import { describe, expect, it } from 'vitest'
import { readableText, staggerMilliseconds, tokenizeWords } from './words'

describe('tokenizeWords', () => {
  it('preserves the original text when the tokens are joined', () => {
    const samples = [
      'Frontend',
      'From the first pixel to production, with AI on every step.',
      "Most companies don't use AI yet. I teach them how.",
      '  leading and  double   spaces\n\tand tabs ',
      'Dr. Fakhari, Köln: Frauenärztin',
      '',
    ]
    for (const sample of samples) {
      expect(tokenizeWords(sample).map((token) => token.text).join('')).toBe(sample)
    }
  })

  it('separates words from whitespace without merging neighbours', () => {
    expect(tokenizeWords('AI for coding')).toEqual([
      { kind: 'word', text: 'AI' },
      { kind: 'space', text: ' ' },
      { kind: 'word', text: 'for' },
      { kind: 'space', text: ' ' },
      { kind: 'word', text: 'coding' },
    ])
  })

  it('keeps punctuation attached to its word', () => {
    const words = tokenizeWords('Hello, world.').filter((token) => token.kind === 'word')
    expect(words.map((token) => token.text)).toEqual(['Hello,', 'world.'])
  })
})

describe('readableText', () => {
  it('collapses whitespace into the label a screen reader should hear', () => {
    expect(readableText('  Vito \n Krawutschke ')).toBe('Vito Krawutschke')
  })
})

describe('staggerMilliseconds', () => {
  it('stays between 40 and 90 ms for any word count', () => {
    for (const count of [0, 1, 2, 5, 10, 11, 20, 60, 400]) {
      const stagger = staggerMilliseconds(count)
      expect(stagger).toBeGreaterThanOrEqual(40)
      expect(stagger).toBeLessThanOrEqual(90)
    }
  })

  it('shortens the stagger for long headings so the entrance stays brief', () => {
    expect(staggerMilliseconds(4)).toBeGreaterThan(staggerMilliseconds(16))
    expect(staggerMilliseconds(16)).toBe(56)
  })
})
