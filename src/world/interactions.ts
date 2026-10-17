import type { Object3D } from 'three'
import type { ChapterSource } from '../dom/chapter-source'
import { createHotspotActions } from '../dom/hotspot-actions'
import {
  createFlags,
  hotspotGroup,
  hotspotKind,
  isAvailable,
  resolveState,
  resolveTouchTap,
  type InteractionFlags,
} from './interaction-state'
import type { InteractionState, InteractiveProxy } from './types'

const PULSE_MILLISECONDS = 1100
const TAP_MAX_TRAVEL_PX = 10
const TAP_MAX_MILLISECONDS = 600
const POINTING_CLASS = 'is-pointing-hotspot'
const WORLD_BLOCKING_SELECTOR = '.chapter-copy, .site-header, .floor-rail, .altimeter, a, button, summary'
const POSE_ELEMENT_COUNT = 16

export interface InteractionWorld {
  proxies: readonly InteractiveProxy[]
  cameraMatrix: { readonly elements: readonly number[] }
  onFrame(listener: () => void): () => void
  pick(clientX: number, clientY: number, objects: Object3D[]): Object3D | null
  scrollToChapter(index: number): void
}

export interface InteractionOptions {
  sections: readonly HTMLElement[]
  chapters: ChapterSource
  reducedMotion: () => boolean
}

export interface Interactions {
  attachWorld(world: InteractionWorld): void
  dispose(): void
}

interface Entry {
  id: string
  button: HTMLButtonElement | null
  proxy: InteractiveProxy | null
  chapters: readonly string[]
  flags: InteractionFlags
  state: InteractionState
  pulseTimer: number
}

interface TapStart {
  x: number
  y: number
  time: number
}

function isWorldTarget(target: EventTarget | null): boolean {
  return !(target instanceof Element) || target.closest(WORLD_BLOCKING_SELECTOR) === null
}

export function initInteractions(options: InteractionOptions): Interactions {
  const { sections, chapters } = options
  const sectionIds = sections.map((section) => section.id)
  const root = document.documentElement
  const lifetime = new AbortController()
  const entries = new Map<string, Entry>()
  const entryByObject = new Map<Object3D, Entry>()

  let world: InteractionWorld | null = null
  let stopFrameListener: (() => void) | null = null
  let currentChapterId = sectionIds[chapters.current] ?? ''
  let pickable: Object3D[] = []
  let pickableStale = true
  let pointer: { x: number; y: number } | null = null
  let pointerDirty = false
  let hovered: Entry | null = null
  let tapStart: TapStart | null = null
  const poseSnapshot = new Array<number>(POSE_ELEMENT_COUNT).fill(0)

  const actions = createHotspotActions({
    scrollToChapter(index) {
      if (world) {
        world.scrollToChapter(index)
        return
      }
      sections[index]?.scrollIntoView({ behavior: options.reducedMotion() ? 'auto' : 'smooth', block: 'start' })
    },
  })

  function commit(entry: Entry, force = false): void {
    const next = resolveState(entry.flags)
    if (next === entry.state && !force) return
    entry.state = next
    entry.proxy?.apply(next)
    if (!entry.button) return
    entry.button.dataset.state = next
    if (hotspotKind(entry.id) === 'toggle') entry.button.setAttribute('aria-pressed', String(next === 'active'))
  }

  function createEntry(id: string, button: HTMLButtonElement | null, chapterIds: readonly string[]): Entry {
    const entry: Entry = { id, button, proxy: null, chapters: chapterIds, flags: createFlags(), state: 'unavailable', pulseTimer: 0 }
    entries.set(id, entry)
    return entry
  }

  function release(entry: Entry): void {
    window.clearTimeout(entry.pulseTimer)
    if (entry.flags.active && hotspotKind(entry.id) === 'toggle') actions.close(entry.id, entry.button)
    if (hovered === entry) hovered = null
    entry.flags = createFlags()
  }

  function syncAvailability(entry: Entry): void {
    const available = isAvailable(entry.chapters, currentChapterId)
    if (available === entry.flags.available) return
    if (available) {
      entry.flags.available = true
      entry.flags.buttonFocus = entry.button !== null && document.activeElement === entry.button
      entry.flags.buttonHover = entry.button?.matches(':hover') ?? false
    } else {
      release(entry)
    }
    pickableStale = true
    commit(entry)
  }

  function rebuildPickable(): void {
    pickable = []
    entryByObject.clear()
    for (const entry of entries.values()) {
      if (!entry.proxy || !entry.flags.available) continue
      pickable.push(entry.proxy.object)
      entryByObject.set(entry.proxy.object, entry)
    }
    pickableStale = false
  }

  function pickEntry(clientX: number, clientY: number): Entry | null {
    if (!world) return null
    if (pickableStale) rebuildPickable()
    if (pickable.length === 0) return null
    const object = world.pick(clientX, clientY, pickable)
    return object ? (entryByObject.get(object) ?? null) : null
  }

  function setPointerHover(next: Entry | null): void {
    if (next === hovered) return
    const previous = hovered
    hovered = next
    if (previous) {
      previous.flags.pointerOver = false
      commit(previous)
    }
    if (next) {
      next.flags.pointerOver = true
      commit(next)
    }
    root.classList.toggle(POINTING_CLASS, next !== null)
  }

  function cameraMoved(matrix: readonly number[]): boolean {
    let moved = false
    for (let index = 0; index < POSE_ELEMENT_COUNT; index += 1) {
      if (poseSnapshot[index] === matrix[index]) continue
      poseSnapshot[index] = matrix[index]
      moved = true
    }
    return moved
  }

  function onFrame(): void {
    if (!world || document.hidden) return
    const moved = cameraMoved(world.cameraMatrix.elements)
    if (!pointerDirty && !(pointer && moved)) return
    pointerDirty = false
    setPointerHover(pointer ? pickEntry(pointer.x, pointer.y) : null)
  }

  function deactivate(entry: Entry): void {
    if (!entry.flags.active) return
    entry.flags.active = false
    actions.close(entry.id, entry.button)
    commit(entry)
  }

  function startPulse(entry: Entry): void {
    window.clearTimeout(entry.pulseTimer)
    entry.flags.active = true
    commit(entry, true)
    entry.pulseTimer = window.setTimeout(() => {
      entry.flags.active = false
      commit(entry)
    }, PULSE_MILLISECONDS)
  }

  function activate(entry: Entry): void {
    if (hotspotKind(entry.id) === 'pulse') {
      actions.trigger(entry.id, entry.button)
      if (entry.flags.available) startPulse(entry)
      return
    }
    if (!entry.flags.available) return
    if (entry.flags.active) {
      deactivate(entry)
      return
    }
    const group = hotspotGroup(entry.id)
    for (const other of entries.values()) if (other !== entry && hotspotGroup(other.id) === group) deactivate(other)
    entry.flags.active = true
    actions.open(entry.id, entry.button)
    commit(entry)
  }

  function clearTouchFocus(except: Entry | null): void {
    for (const entry of entries.values()) {
      if (entry === except || !entry.flags.touchFocus) continue
      entry.flags.touchFocus = false
      commit(entry)
    }
  }

  function handleTouchTap(clientX: number, clientY: number): void {
    const entry = pickEntry(clientX, clientY)
    clearTouchFocus(entry)
    if (!entry) return
    const result = resolveTouchTap(entry.state)
    if (result === 'focus') {
      entry.flags.touchFocus = true
      commit(entry)
    } else if (result === 'activate') {
      activate(entry)
    }
  }

  function bindButton(entry: Entry, button: HTMLButtonElement): void {
    const { signal } = lifetime
    button.addEventListener(
      'pointerenter',
      (event) => {
        if (event.pointerType === 'touch') return
        entry.flags.buttonHover = true
        commit(entry)
      },
      { signal },
    )
    button.addEventListener(
      'pointerleave',
      () => {
        entry.flags.buttonHover = false
        commit(entry)
      },
      { signal },
    )
    button.addEventListener(
      'focus',
      () => {
        entry.flags.buttonFocus = button.matches(':focus-visible')
        commit(entry)
      },
      { signal },
    )
    button.addEventListener(
      'blur',
      () => {
        entry.flags.buttonFocus = false
        commit(entry)
      },
      { signal },
    )
    button.addEventListener('click', () => activate(entry), { signal })
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-hotspot]')) {
    const id = button.dataset.hotspot
    if (!id) continue
    const owner = button.closest('.chapter')?.id
    bindButton(createEntry(id, button, owner ? [owner] : []), button)
  }

  function onChapter(index: number): void {
    currentChapterId = sectionIds[index] ?? ''
    for (const entry of entries.values()) syncAvailability(entry)
    pointerDirty = true
  }

  const { signal } = lifetime

  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch') return
      pointer = isWorldTarget(event.target) ? { x: event.clientX, y: event.clientY } : null
      pointerDirty = true
    },
    { passive: true, signal },
  )
  document.documentElement.addEventListener(
    'pointerleave',
    () => {
      pointer = null
      pointerDirty = true
    },
    { signal },
  )
  document.addEventListener(
    'pointerdown',
    (event) => {
      tapStart = event.pointerType === 'touch' ? { x: event.clientX, y: event.clientY, time: event.timeStamp } : null
    },
    { passive: true, signal },
  )
  document.addEventListener(
    'pointerup',
    (event) => {
      const start = tapStart
      tapStart = null
      if (!start || event.pointerType !== 'touch' || !world || !isWorldTarget(event.target)) return
      const travel = Math.hypot(event.clientX - start.x, event.clientY - start.y)
      if (travel > TAP_MAX_TRAVEL_PX || event.timeStamp - start.time > TAP_MAX_MILLISECONDS) return
      handleTouchTap(event.clientX, event.clientY)
    },
    { passive: true, signal },
  )
  document.addEventListener(
    'click',
    (event) => {
      const fromTouch = 'pointerType' in event && event.pointerType === 'touch'
      if (fromTouch || event.defaultPrevented || !isWorldTarget(event.target)) return
      const entry = pickEntry(event.clientX, event.clientY)
      if (entry) activate(entry)
    },
    { signal },
  )
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return
      for (const entry of entries.values()) deactivate(entry)
    },
    { signal },
  )

  const stopChapters = chapters.subscribe(onChapter)
  for (const entry of entries.values()) {
    syncAvailability(entry)
    commit(entry, true)
  }

  return {
    attachWorld(next) {
      stopFrameListener?.()
      world = next
      for (const proxy of next.proxies) {
        const entry = entries.get(proxy.id) ?? createEntry(proxy.id, null, proxy.chapters)
        entry.proxy = proxy
        entry.chapters = proxy.chapters
      }
      for (const entry of entries.values()) {
        syncAvailability(entry)
        commit(entry, true)
      }
      pickableStale = true
      pointerDirty = true
      stopFrameListener = next.onFrame(onFrame)
    },
    dispose() {
      lifetime.abort()
      stopChapters()
      stopFrameListener?.()
      for (const entry of entries.values()) window.clearTimeout(entry.pulseTimer)
      root.classList.remove(POINTING_CLASS)
    },
  }
}
