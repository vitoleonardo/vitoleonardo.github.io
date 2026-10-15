import type { FigureId } from '../types'
import { SCENES } from './score'

export interface StepEntry {
  id: string
  number: string
  title: string
}

const NAVIGATOR_ID = 'section-navigator'
const SEGMENT_CLASS = 'seg'
const NAVIGATOR_LABEL: Record<string, string> = { en: 'All sections', de: 'Alle Abschnitte' }
const POPUP_GAP = 10
const POPUP_EDGE = 12
const POPUP_MAX_HEIGHT = 360

function language(): 'en' | 'de' {
  return document.documentElement.lang.startsWith('de') ? 'de' : 'en'
}

function text(element: Element | null | undefined): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

export function readSteps(): StepEntry[] {
  const stopNames = Array.from(document.querySelectorAll('#index .index-stop .stop-name')).map(text)
  const navText = (hash: string): string => text(document.querySelector(`.nav-links a[href="${hash}"]`))
  let stopIndex = 0
  const titleOf = (section: HTMLElement, figure: FigureId): string => {
    if (figure === 'hero') return text(section.querySelector('h1'))
    if (figure === 'index') return text(section.querySelector('.bar-mid')) || navText('#index')
    if (section.id.startsWith('stop-')) return stopNames[stopIndex++] ?? text(section.querySelector('h2'))
    return navText(`#${section.id}`) || text(section.querySelector('h2'))
  }
  return SCENES.flatMap((scene, index) => {
    const section = document.getElementById(scene.id)
    if (!section) return []
    return [{ id: section.id, number: String(index + 1).padStart(2, '0'), title: titleOf(section, scene.figure) }]
  })
}

function enhanceSegments(steps: StepEntry[]): void {
  const stops = steps.filter((step) => step.id.startsWith('stop-'))
  document.querySelectorAll<HTMLElement>('#stack .stack-track > .panel').forEach((panel) => {
    const progress = panel.querySelector<HTMLElement>('.stack-progress')
    if (!progress || progress.dataset.enhanced === 'true') return
    progress.dataset.enhanced = 'true'
    progress.removeAttribute('aria-hidden')
    const counter = text(panel.querySelector('.stack-count'))
    Array.from(progress.querySelectorAll<HTMLElement>(`.${SEGMENT_CLASS}`)).forEach((segment, index) => {
      const stop = stops[index]
      if (!stop) return
      const link = document.createElement('a')
      link.className = segment.className
      link.href = `#${stop.id}`
      link.tabIndex = -1
      link.setAttribute('aria-label', `${counter.replace(/\d+/, String(index + 1))}: ${stop.title}`)
      segment.replaceWith(link)
    })
  })
}

function buildNavigator(steps: StepEntry[]): HTMLElement {
  const navigator = document.createElement('nav')
  navigator.id = NAVIGATOR_ID
  navigator.className = 'section-navigator'
  navigator.hidden = true
  navigator.setAttribute('aria-label', NAVIGATOR_LABEL[language()])
  const list = document.createElement('ol')
  steps.forEach((step) => {
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.href = `#${step.id}`
    link.dataset.step = step.id
    const number = document.createElement('span')
    number.className = 'section-navigator-number'
    number.textContent = step.number
    link.append(number, document.createTextNode(` ${step.title}`))
    item.append(link)
    list.append(item)
  })
  navigator.append(list)
  document.body.append(navigator)
  return navigator
}

function enhanceCounters(navigator: HTMLElement): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('main .page-count')).map((counter, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = counter.className
    button.textContent = counter.textContent
    button.setAttribute('aria-haspopup', 'true')
    button.setAttribute('aria-expanded', 'false')
    button.setAttribute('aria-controls', navigator.id)
    button.setAttribute('aria-label', `${navigator.getAttribute('aria-label')}, ${text(counter)}`)
    if (index > 0) button.tabIndex = -1
    counter.replaceWith(button)
    return button
  })
}

export function currentStepId(steps: StepEntry[]): string {
  const staged = document.documentElement.dataset.scene
  if (staged && steps.some((step) => step.id === staged)) return staged
  const probe = window.innerHeight * 0.5
  let current = steps[0]?.id ?? ''
  steps.forEach((step) => {
    const section = document.getElementById(step.id)
    if (!section) return
    const rect = section.getBoundingClientRect()
    if (rect.left > -window.innerWidth / 2 && rect.left < window.innerWidth / 2 && rect.top <= probe) current = step.id
  })
  return current
}

export function installNavigation(): void {
  if (document.getElementById(NAVIGATOR_ID)) return
  const steps = readSteps()
  if (steps.length === 0) return
  enhanceSegments(steps)
  const navigator = buildNavigator(steps)
  const triggers = enhanceCounters(navigator)
  let opener: HTMLButtonElement | null = null

  const close = (restoreFocus: boolean): void => {
    if (navigator.hidden) return
    navigator.hidden = true
    triggers.forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'))
    if (restoreFocus) opener?.focus({ preventScroll: true })
    opener = null
  }

  const open = (trigger: HTMLButtonElement, focusFirst: boolean): void => {
    const rect = trigger.getBoundingClientRect()
    const fitsBelow = rect.bottom + POPUP_GAP + POPUP_MAX_HEIGHT <= window.innerHeight
    const top = fitsBelow ? rect.bottom + POPUP_GAP : Math.max(POPUP_EDGE, rect.top - POPUP_MAX_HEIGHT - POPUP_GAP)
    navigator.style.top = `${Math.round(top)}px`
    navigator.style.right = `${Math.max(POPUP_EDGE, Math.round(window.innerWidth - rect.right))}px`
    const current = currentStepId(steps)
    navigator.querySelectorAll<HTMLAnchorElement>('a[data-step]').forEach((link) => {
      if (link.dataset.step === current) link.setAttribute('aria-current', 'step')
      else link.removeAttribute('aria-current')
    })
    navigator.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    opener = trigger
    if (focusFirst) navigator.querySelector<HTMLAnchorElement>('a[aria-current="step"], a')?.focus({ preventScroll: true })
  }

  triggers.forEach((trigger) =>
    trigger.addEventListener('click', (event) => {
      event.stopPropagation()
      if (!navigator.hidden && opener === trigger) close(false)
      else open(trigger, event.detail === 0)
    }),
  )
  navigator.addEventListener('click', (event) => {
    if ((event.target as Element | null)?.closest('a')) close(false)
  })
  document.addEventListener('click', (event) => {
    if (!navigator.hidden && !navigator.contains(event.target as Node)) close(false)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !navigator.hidden) {
      event.preventDefault()
      close(true)
    }
  })
  window.addEventListener('scroll', () => close(false), { passive: true })
}
