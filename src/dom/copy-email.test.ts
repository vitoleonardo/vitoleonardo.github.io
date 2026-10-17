import { describe, expect, it } from 'vitest'
import { addressFromMailto } from './copy-email'

describe('addressFromMailto', () => {
  it('strips the scheme', () => {
    expect(addressFromMailto('mailto:viktor.krawutschke@gmail.com')).toBe('viktor.krawutschke@gmail.com')
  })

  it('drops query parameters such as a subject', () => {
    expect(addressFromMailto('mailto:hello@example.com?subject=Hi')).toBe('hello@example.com')
  })

  it('decodes percent escapes and tolerates malformed ones', () => {
    expect(addressFromMailto('MAILTO:a%2Bb@example.com')).toBe('a+b@example.com')
    expect(addressFromMailto('mailto:broken%zz@example.com')).toBe('broken%zz@example.com')
  })
})
