import { activeListener, attachProbeSink } from './probe'

const FRAME_CAPACITY = 1800
const EVENT_CAPACITY = 800
const SUMMARY_WINDOW_MS = 2000
const SUMMARY_EVERY_MS = 500

interface FrameRecord {
  t: number
  dt: number
  scrollY: number
  scrollEvents: number
  viewportHeight: number
  viewportTop: number
  innerHeight: number
  canvasCss: string
  canvasBuffer: string
  canvasPlacement: string
  scene: number
  seconds: number
  listeners: Record<string, number>
  rects: number
  reallocations: number
  rebuilds: number
}

interface EventRecord {
  t: number
  type: string
  detail: Record<string, unknown>
}

interface MotionLogDump {
  meta: Record<string, unknown>
  frames: FrameRecord[]
  events: EventRecord[]
}

interface MotionLog {
  dump(): MotionLogDump
  clear(): void
  copy(): Promise<void>
}

declare global {
  interface Window {
    __motionLog?: MotionLog
  }
}

const round = (value: number): number => Math.round(value * 100) / 100

function append<T>(list: T[], item: T, capacity: number): void {
  list.push(item)
  if (list.length > capacity) list.splice(0, list.length - capacity)
}

function pathCanvas(): HTMLCanvasElement | null {
  const element = document.getElementById('path-canvas')
  return element instanceof HTMLCanvasElement ? element : null
}

export function startMotionLog(): void {
  if (window.__motionLog) return
  const frames: FrameRecord[] = []
  const events: EventRecord[] = []
  let listeners: Record<string, number> = {}
  let rects = 0
  let reallocations = 0
  let rebuilds = 0
  let scrollEvents = 0
  let scene = -1
  let seconds = 0
  let canvasCss = ''
  let last = performance.now()

  const event = (type: string, detail: Record<string, unknown>): void => {
    if (type === 'score') {
      scene = Number(detail.scene)
      seconds = Number(detail.seconds)
      return
    }
    if (type === 'rebuild') {
      rebuilds++
      return
    }
    append(events, { t: round(performance.now()), type, detail }, EVENT_CAPACITY)
  }
  attachProbeSink({
    event,
    listener(name, ms) {
      listeners[name] = (listeners[name] ?? 0) + ms
    },
  })

  const measure = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect')?.value as (this: Element) => DOMRect
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    rects++
    return measure.call(this)
  }

  for (const property of ['width', 'height'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property)
    if (!descriptor?.get || !descriptor.set) continue
    Object.defineProperty(HTMLCanvasElement.prototype, property, {
      ...descriptor,
      set(this: HTMLCanvasElement, value: number) {
        if (this.id === 'path-canvas') {
          reallocations++
          event('reallocation', { property, from: descriptor.get?.call(this) as number, to: value, during: activeListener() ?? 'outside the ticker' })
        }
        descriptor.set?.call(this, value)
      },
    })
  }

  const canvas = pathCanvas()
  if (canvas) {
    new ResizeObserver((entries) => {
      const box = entries[entries.length - 1].contentRect
      canvasCss = `${Math.round(box.width)}x${Math.round(box.height)}`
      event('canvas-resize', { width: round(box.width), height: round(box.height) })
    }).observe(canvas)
  }
  const viewport = window.visualViewport
  viewport?.addEventListener('resize', () => event('viewport-resize', { height: round(viewport.height), top: round(viewport.offsetTop) }))
  viewport?.addEventListener('scroll', () => event('viewport-scroll', { top: round(viewport.offsetTop) }))
  window.addEventListener('resize', () => event('window-resize', { width: window.innerWidth, height: window.innerHeight }))
  window.addEventListener('scroll', () => scrollEvents++, { passive: true })

  const record = (now: number): void => {
    const element = pathCanvas()
    append(
      frames,
      {
        t: round(now),
        dt: round(now - last),
        scrollY: round(window.scrollY),
        scrollEvents,
        viewportHeight: round(viewport?.height ?? window.innerHeight),
        viewportTop: round(viewport?.offsetTop ?? 0),
        innerHeight: window.innerHeight,
        canvasCss,
        canvasBuffer: element ? `${element.width}x${element.height}` : '',
        canvasPlacement: element ? `${element.parentElement?.id ?? ''} ${element.style.top}`.trim() : '',
        scene,
        seconds: round(seconds),
        listeners: Object.fromEntries(Object.entries(listeners).map(([name, ms]) => [name, round(ms)])),
        rects,
        reallocations,
        rebuilds,
      },
      FRAME_CAPACITY,
    )
    last = now
    listeners = {}
    rects = 0
    reallocations = 0
    rebuilds = 0
    scrollEvents = 0
    requestAnimationFrame(record)
  }
  requestAnimationFrame(record)

  const dump = (): MotionLogDump => ({
    meta: {
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      screen: `${window.screen.width}x${window.screen.height}`,
      url: window.location.href,
      capturedAt: new Date().toISOString(),
    },
    frames: frames.slice(),
    events: events.slice(),
  })
  const clear = (): void => {
    frames.length = 0
    events.length = 0
  }
  const copy = async (): Promise<void> => {
    const json = JSON.stringify(dump())
    try {
      await navigator.clipboard.writeText(json)
    } catch {
      const area = document.createElement('textarea')
      area.value = json
      area.style.cssText = 'position:fixed;inset:10%;z-index:2147483647;font:10px monospace'
      document.body.append(area)
      area.select()
    }
  }
  window.__motionLog = { dump, clear, copy }

  const panel = document.createElement('div')
  panel.dataset.motionLog = ''
  panel.style.cssText =
    'position:fixed;left:8px;top:8px;z-index:2147483647;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.78);color:#fff;font:11px/1.45 ui-monospace,monospace;max-width:calc(100vw - 16px)'
  const summary = document.createElement('div')
  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;gap:8px;margin-top:4px'
  const action = (label: string, run: () => void): void => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.style.cssText = 'font:inherit;color:#000;background:#fff;border:0;border-radius:4px;padding:2px 8px'
    button.addEventListener('click', run)
    actions.append(button)
  }
  action('copy log', () => {
    void copy().then(() => event('copied', { frames: frames.length }))
  })
  action('clear', clear)
  panel.append(summary, actions)
  document.body.append(panel)

  window.setInterval(() => {
    const now = performance.now()
    const recent = frames.filter((frame) => now - frame.t <= SUMMARY_WINDOW_MS)
    if (recent.length === 0) return
    const worst = Math.max(...recent.map((frame) => frame.dt))
    const three = recent.reduce((sum, frame) => sum + (frame.listeners.three ?? 0), 0) / recent.length
    const perFrame = (key: 'rects' | 'reallocations' | 'rebuilds' | 'scrollEvents'): number =>
      round(recent.reduce((sum, frame) => sum + frame[key], 0) / recent.length)
    summary.textContent =
      `fps ${round((recent.length * 1000) / SUMMARY_WINDOW_MS)} · worst ${Math.round(worst)} ms · three ${round(three)} ms` +
      ` · rects ${perFrame('rects')}/f · rebuild ${perFrame('rebuilds')}/f · realloc ${recent.reduce((sum, frame) => sum + frame.reallocations, 0)}` +
      ` · scroll ev ${perFrame('scrollEvents')}/f · scene ${scene}`
  }, SUMMARY_EVERY_MS)
}
