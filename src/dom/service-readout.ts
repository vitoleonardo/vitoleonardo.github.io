const SERVICE_BUTTON_SELECTOR = '.homelab .hotspot'
const READOUT_SELECTOR = '.homelab-readout'
const NOTE_SELECTOR = '.service-note'

export interface ReadoutSources<T> {
  hovered: T | null
  focused: T | null
  pinned: T | null
}

export interface ServiceReadout {
  pin(button: HTMLElement | null): void
  unpin(button: HTMLElement | null): void
  dispose(): void
}

export function leadingSource<T>(sources: ReadoutSources<T>): T | null {
  return sources.hovered ?? sources.focused ?? sources.pinned
}

export function readoutText(note: string | null, summary: string): string {
  return note?.trim() || summary
}

function serviceButtonOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(SERVICE_BUTTON_SELECTOR) : null
}

function noteOf(button: HTMLElement | null): string | null {
  return button?.closest('li')?.querySelector(NOTE_SELECTOR)?.textContent ?? null
}

export function createServiceReadout(root: Document = document): ServiceReadout {
  const readout = root.querySelector<HTMLElement>(READOUT_SELECTOR)
  if (!readout) return { pin() {}, unpin() {}, dispose() {} }

  const summary = readout.textContent?.trim() ?? ''
  const lifetime = new AbortController()
  const sources: ReadoutSources<HTMLElement> = { hovered: null, focused: null, pinned: null }

  function render(): void {
    const text = readoutText(noteOf(leadingSource(sources)), summary)
    if (readout && readout.textContent !== text) readout.textContent = text
  }

  function track(type: string, update: (event: Event, button: HTMLElement) => void): void {
    root.addEventListener(
      type,
      (event) => {
        const button = serviceButtonOf(event.target)
        if (!button) return
        update(event, button)
        render()
      },
      { signal: lifetime.signal },
    )
  }

  track('pointerover', (event, button) => {
    if ((event as PointerEvent).pointerType !== 'touch') sources.hovered = button
  })
  track('pointerout', (event, button) => {
    const destination = (event as PointerEvent).relatedTarget
    if (sources.hovered === button && !(destination instanceof Node && button.contains(destination))) {
      sources.hovered = null
    }
  })
  track('focusin', (_, button) => {
    if (button.matches(':focus-visible')) sources.focused = button
  })
  track('focusout', (_, button) => {
    if (sources.focused === button) sources.focused = null
  })

  return {
    pin(button) {
      sources.pinned = button
      render()
    },
    unpin(button) {
      if (sources.pinned === button) sources.pinned = null
      render()
    },
    dispose() {
      lifetime.abort()
    },
  }
}
