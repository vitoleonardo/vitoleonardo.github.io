import type { FigureId } from '../types'

export interface ProofItem {
  title: string
  detail: string
}

export interface StatItem {
  value: string
  label: string
}

export interface Link {
  label: string
  href: string
}

export interface Stop {
  id: string
  figure: FigureId
  number: string
  caption: string
  title: string
  titleEmphasis?: string
  indexTitle: string
  indexTools: string
  tools: string[]
  intro?: string
  proof: ProofItem[]
  stats?: StatItem[]
  statsNote?: string[]
  annotation?: { title?: string; note: string }
  ringLabels?: string[]
  labels?: string[]
  labelNotes?: string[]
  footer: string
  red?: boolean
}

export interface UiStrings {
  skipLink: string
  mainNavLabel: string
  languageLabel: string
  whatIDo: string
  stackCount: string
  afterWork: string
  lastSong: string
  soundOff: string
  contactHeading: string
  contactLegalLabel: string
  thumbAlts: string[]
  freelancermap: string
}

export interface Content {
  ui: UiStrings
  meta: { title: string; description: string; lang: string }
  nav: { links: Link[]; switchLabel: string }
  hero: {
    pill: string
    name: string
    line: string
    buttons: { primary: Link; secondary: Link }
    footer: string
  }
  index: {
    caption: string
    heading: string
    headingEmphasis: string
    footer: string
    next: string
  }
  stackLabel: string
  stops: Stop[]
  about: {
    caption: string
    heading: string
    headingEmphasis: string
    text: string
    facts: { label: string; value: string }[]
    homelab: { summary: string; services: { name: string; note: string }[] }
    portraitAlt: string
    footer: string
    next: string
  }
  sayHi: {
    pill: string
    link: string
    line: string
    annotation: string
    email: string
    copied: string
    links: Link[]
    credit: string
  }
}
