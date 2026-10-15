import { gsap } from 'gsap'
import { SAY_HI_LOOP, toStageY } from '../../figures/shapes'
import { DESIGN_WIDTH } from '../../three/stages'
import { TUNE } from '../../tune'
import type { MotionContext, SectionMotion } from '../context'
import { annotationReveal, fadeIn, query, riseIn, wordsReveal } from '../reveal'

const toggleActions = 'play none none reverse'

function aboutReveal(): void {
  const section = document.getElementById('about')
  if (!section) return
  const timeline = gsap.timeline({ scrollTrigger: { trigger: section, start: 'top 45%', toggleActions } })
  const caption = riseIn(query(section, '.fig-caption'), { y: 12, duration: 0.6 })
  if (caption) timeline.add(caption, 0)
  const heading = section.querySelector('h2')
  const words = heading ? wordsReveal(heading) : null
  if (words) timeline.add(words, 0.05)
  const text = riseIn(query(section, '.about-text'), { duration: TUNE.revealDuration })
  if (text) timeline.add(text, 0.25)
  const portrait = riseIn(query(section, '.portrait'), { y: 30, duration: 1 })
  if (portrait) timeline.add(portrait, 0.3)
  const facts = riseIn(query(section, '.facts .fact'), { stagger: 0.08 })
  if (facts) timeline.add(facts, 0.5)
}

function sayHiReveal(): void {
  const section = document.getElementById('say-hi')
  if (!section) return
  const timeline = gsap.timeline({ scrollTrigger: { trigger: section, start: 'top 70%', toggleActions } })
  const pill = riseIn(query(section, '.sayhi-core .pill'), { y: 14, duration: 0.6 })
  if (pill) timeline.add(pill, 0)
  const link = riseIn(query(section, '.say-hi-link'), { y: 40, duration: TUNE.revealDuration })
  if (link) timeline.add(link, 0.1)
  const line = riseIn(query(section, '.sayhi-line'), { duration: TUNE.revealDuration })
  if (line) timeline.add(line, 0.3)
  const lines = annotationReveal(query(section, '.annotation .ann-line'))
  if (lines) timeline.add(lines, 0.4)
  const note = fadeIn(query(section, '.annotation .ann-dot, .annotation .ann-note'), { stagger: 0.08 })
  if (note) timeline.add(note, 0.5)
  const footer = riseIn(query(section, '.site-footer'), { y: 16 })
  if (footer) timeline.add(footer, 0.5)
}

const COPY_VISIBLE_MS = 2000
const RING_HIT_SLOP = 30

function selectText(element: HTMLElement): void {
  const range = document.createRange()
  range.selectNodeContents(element)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

async function writeClipboard(text: string, fallbackSource: HTMLElement | null): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    let copied: boolean
    try {
      copied = document.execCommand('copy')
    } catch {
      copied = false
    }
    area.remove()
    if (!copied && fallbackSource) selectText(fallbackSource)
  }
}

function bindCopyEmail(): () => void {
  const section = document.getElementById('say-hi')
  const trigger = section?.querySelector<HTMLElement>('.copy-email')
  const toast = section?.querySelector<HTMLElement>('.copy-toast')
  const status = document.getElementById('copy-status')
  const stage = section?.querySelector<HTMLElement>('[data-path-stage="say-hi"]')
  if (!section || !trigger || !stage) return () => {}
  const email = trigger.dataset.email ?? ''
  const emailLink = section.querySelector<HTMLElement>('.email-link')
  let hideTimer = 0

  const copy = (): void => {
    void writeClipboard(email, emailLink).then(() => {
      const message = toast?.textContent ?? ''
      if (status) status.textContent = message
      toast?.classList.add('is-visible')
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => {
        toast?.classList.remove('is-visible')
        if (status) status.textContent = ''
      }, COPY_VISIBLE_MS)
    })
  }

  const insideRing = (event: MouseEvent): boolean => {
    const rect = stage.getBoundingClientRect()
    const scale = rect.width / DESIGN_WIDTH
    const dx = event.clientX - (rect.left + SAY_HI_LOOP.x * scale)
    const dy = event.clientY - (rect.top + toStageY(SAY_HI_LOOP.y) * scale)
    return Math.hypot(dx, dy) <= (SAY_HI_LOOP.radius + RING_HIT_SLOP) * scale
  }

  const onClick = (event: MouseEvent): void => {
    if (event.button !== 0) return
    const target = event.target as Element | null
    if (target?.closest('.copy-email')) {
      event.preventDefault()
      copy()
      return
    }
    if (target?.closest('a, button, summary')) return
    if (!section.contains(target) || !insideRing(event)) return
    copy()
  }
  const onMove = (event: MouseEvent): void => {
    section.style.cursor = insideRing(event) && section.contains(event.target as Node) ? 'pointer' : ''
  }
  document.addEventListener('click', onClick)
  section.addEventListener('mousemove', onMove)
  return () => {
    window.clearTimeout(hideTimer)
    document.removeEventListener('click', onClick)
    section.removeEventListener('mousemove', onMove)
    section.style.cursor = ''
  }
}

const SOUND_LABELS: Record<string, [string, string]> = {
  en: ['Sound: off', 'Sound: on'],
  de: ['Ton: aus', 'Ton: an'],
}

const KICK_GAIN = 0.22
const LOOKAHEAD_S = 0.2
const SCHEDULER_MS = 50

function bindSound(): () => void {
  const buttons = query<HTMLButtonElement>(document, '.sound-toggle')
  if (buttons.length === 0) return () => {}
  let audio: AudioContext | null = null
  let timer = 0
  let nextBeat = 0
  let on = false
  const labels = SOUND_LABELS[document.documentElement.lang] ?? SOUND_LABELS.en

  const paint = (): void => {
    buttons.forEach((button) => {
      button.setAttribute('aria-pressed', String(on))
      button.textContent = labels[on ? 1 : 0]
    })
  }

  const kick = (context: AudioContext, when: number): void => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(150, when)
    oscillator.frequency.exponentialRampToValueAtTime(45, when + 0.12)
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(KICK_GAIN, when + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.28)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(when)
    oscillator.stop(when + 0.3)
  }

  const schedule = async (): Promise<void> => {
    const { beatClock } = await import('../../three/beat-clock')
    if (!audio) return
    const context = audio
    const beatMs = beatClock.beatSeconds * 1000
    const tick = (): void => {
      const now = performance.now()
      if (nextBeat < now) nextBeat = now + beatClock.msUntilNextBeat(now)
      while (nextBeat - now < LOOKAHEAD_S * 1000) {
        kick(context, context.currentTime + Math.max(0, (nextBeat - now) / 1000))
        nextBeat += beatMs
      }
    }
    nextBeat = performance.now() + beatClock.msUntilNextBeat()
    tick()
    timer = window.setInterval(tick, SCHEDULER_MS)
  }

  const stop = (): void => {
    window.clearInterval(timer)
    timer = 0
    void audio?.suspend()
  }

  const toggle = async (): Promise<void> => {
    on = !on
    paint()
    if (!on) {
      stop()
      return
    }
    try {
      audio = audio ?? new AudioContext()
      await audio.resume()
      await schedule()
    } catch {
      on = false
      paint()
    }
  }

  const onVisibility = (): void => {
    if (document.hidden && on) stop()
    else if (!document.hidden && on && audio) void audio.resume().then(schedule)
  }

  const handlers = buttons.map((button) => {
    const handler = (): void => void toggle()
    button.addEventListener('click', handler)
    return { button, handler }
  })
  document.addEventListener('visibilitychange', onVisibility)
  paint()
  return () => {
    handlers.forEach(({ button, handler }) => button.removeEventListener('click', handler))
    document.removeEventListener('visibilitychange', onVisibility)
    stop()
    void audio?.close()
    audio = null
  }
}

function buildInteractive(context: MotionContext): void {
  context.onCleanup(bindCopyEmail())
  context.onCleanup(bindSound())
}

export const sectionMotion: SectionMotion = {
  order: 40,
  desktop(context) {
    buildInteractive(context)
  },
  mobile(context) {
    aboutReveal()
    sayHiReveal()
    buildInteractive(context)
  },
  reduced(context) {
    buildInteractive(context)
  },
}
