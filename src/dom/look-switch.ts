import { type Look, readLook, writeLook } from '../world/look'

export interface LookSwitch {
  look(): Look
  onChange(listener: (look: Look) => void): void
}

export function initLookSwitch(): LookSwitch {
  const root = document.documentElement
  const button = document.querySelector<HTMLButtonElement>('.look-switch')
  const listeners = new Set<(look: Look) => void>()
  let current = readLook()

  function apply(look: Look): void {
    current = look
    root.dataset.look = look
    button?.setAttribute('aria-pressed', String(look === 'vice'))
  }

  apply(current)
  button?.addEventListener('click', () => {
    const next: Look = current === 'vice' ? 'classic' : 'vice'
    apply(next)
    writeLook(next)
    for (const listener of listeners) listener(next)
  })

  return {
    look: () => current,
    onChange(listener) {
      listeners.add(listener)
    },
  }
}
