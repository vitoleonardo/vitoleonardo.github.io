import { readFileSync, writeFileSync } from 'node:fs'

const projectRoot = new URL('../', import.meta.url).pathname
const { en } = await import(`${projectRoot}src/content/en.ts`)
const { de } = await import(`${projectRoot}src/content/de.ts`)

const SITE_URL = 'https://vitoleonardo.github.io'
const NON_COPY_KEYS = new Set(['href', 'id', 'figure', 'lang', 'email', 'number'])
const KEEP_AS_IS = new Set(['EN', 'DE', 'Vito', 'Krawutschke', 'Vito Krawutschke', 'viktor.krawutschke@gmail.com'])
const KNOWN_UNTRANSLATED = new Set(['Dr. Fakhari'])
const EN_SWITCH = '<a class="is-current" href="/" hreflang="en" lang="en" aria-current="true">EN</a><a href="/de/" hreflang="de" lang="de">DE</a>'
const DE_SWITCH = '<a href="/" hreflang="en" lang="en">EN</a><a class="is-current" href="/de/" hreflang="de" lang="de" aria-current="true">DE</a>'

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildDictionary(english, german) {
  const dictionary = new Map()
  const conflicts = []
  const walk = (source, target) => {
    if (typeof source === 'string') {
      const key = escapeHtml(source.trim())
      const value = escapeHtml(target.trim())
      if (!key) return
      if (dictionary.has(key) && dictionary.get(key) !== value) conflicts.push([key, dictionary.get(key), value])
      dictionary.set(key, value)
    } else if (Array.isArray(source)) {
      source.forEach((item, index) => walk(item, target[index]))
    } else if (source && typeof source === 'object') {
      for (const key of Object.keys(source)) if (!NON_COPY_KEYS.has(key)) walk(source[key], target[key])
    }
  }
  walk(english, german)
  if (conflicts.length) {
    console.error('gen-de: conflicting translations', conflicts)
    process.exit(1)
  }
  dictionary.set('Main', escapeHtml(german.ui.mainNavLabel))
  dictionary.set('Language', escapeHtml(german.ui.languageLabel))
  dictionary.set('Contact and legal', escapeHtml(german.ui.contactLegalLabel))
  dictionary.set('Stop', 'Station')
  return dictionary
}

function translateBody(body, dictionary) {
  const svgs = []
  const missing = new Set()
  let translated = body.replace(/<svg.*?<\/svg>/gs, (svg) => {
    svgs.push(svg)
    return `@@SVG${svgs.length - 1}@@`
  })
  translated = translated.replace(/>([^<]+)</g, (match, text) => {
    const key = text.trim()
    if (!key || key.startsWith('@@SVG') || /^\d+( \/ \d+)?$/.test(key) || KEEP_AS_IS.has(key)) return match
    const stackCount = key.match(/^Stack (\d) of 7$/)
    if (stackCount) return match.replace(key, de.ui.stackCount.replace('{n}', stackCount[1]))
    if (dictionary.has(key)) return match.replace(key, dictionary.get(key))
    missing.add(key)
    return match
  })
  translated = translated.replace(/(alt|aria-label)="([^"]*)"/g, (match, attribute, value) =>
    dictionary.has(value) ? `${attribute}="${dictionary.get(value)}"` : match,
  )
  translated = translated.replace(/@@SVG(\d+)@@/g, (_, index) => svgs[Number(index)])
  translated = translated.replace(
    '<a class="skip-link" href="#main">Skip to content</a>',
    `<a class="skip-link" href="#main">${escapeHtml(de.ui.skipLink)}</a>`,
  )
  translated = translated.split(EN_SWITCH).join(DE_SWITCH)
  return { html: translated, missing }
}

function translateHead(head) {
  const enTitle = escapeHtml(en.meta.title)
  const enDescription = escapeHtml(en.meta.description)
  let translated = head
    .replace('<html lang="en">', '<html lang="de">')
    .split(enTitle)
    .join(escapeHtml(de.meta.title))
    .split(enDescription)
    .join(escapeHtml(de.meta.description))
  translated = translated
    .replace(`<link rel="canonical" href="${SITE_URL}/">`, `<link rel="canonical" href="${SITE_URL}/de/">`)
    .replace(`<meta property="og:url" content="${SITE_URL}/">`, `<meta property="og:url" content="${SITE_URL}/de/">`)
    .replace('content="en_US"', 'content="de_DE"')
    .replace('<meta property="og:locale:alternate" content="de_DE">', '<meta property="og:locale:alternate" content="en_US">')
  return translated.replace(/<script type="application\/ld\+json">(.*?)<\/script>/s, (_, json) => {
    const person = JSON.parse(json)
    person.url = `${SITE_URL}/de/`
    person.jobTitle = 'Full-Stack- und KI-Engineer'
    person.address.addressLocality = 'Köln'
    person.inLanguage = 'de'
    return `<script type="application/ld+json">${JSON.stringify(person)}</script>`
  })
}

const source = readFileSync(`${projectRoot}index.html`, 'utf8')
const bodyStart = source.indexOf('<body>')
const dictionary = buildDictionary(en, de)
const body = translateBody(source.slice(bodyStart), dictionary)
writeFileSync(`${projectRoot}de/index.html`, translateHead(source.slice(0, bodyStart)) + body.html)

const untranslated = [...body.missing].filter((text) => !KNOWN_UNTRANSLATED.has(text))
if (untranslated.length) console.error('gen-de: untranslated strings', untranslated)
