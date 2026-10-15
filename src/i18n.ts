const LANGUAGE_KEY = 'vito-language'
const RETURN_KEY = 'vito-return-section'
const RESTORE_DELAY_MS = 400

type Language = 'en' | 'de'

const PATHS: Record<Language, string> = { en: '/', de: '/de/' }

function currentLanguage(): Language {
  return document.documentElement.lang === 'de' ? 'de' : 'en'
}

function readStorage(storage: Storage | null, key: string): string | null {
  try {
    return storage ? storage.getItem(key) : null
  } catch {
    return null
  }
}

function writeStorage(storage: Storage | null, key: string, value: string | null): void {
  try {
    if (!storage) return
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, value)
  } catch {
    return
  }
}

function safeLocal(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function safeSession(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function visibleSectionId(): string | null {
  const staged = document.documentElement.dataset.scene
  if (staged && document.getElementById(staged)) return staged
  const panels = Array.from(document.querySelectorAll<HTMLElement>('main .panel[id]'))
  const centreX = window.innerWidth / 2
  const centreY = window.innerHeight / 2
  let best: { id: string; distance: number } | null = null
  for (const panel of panels) {
    const rect = panel.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue
    const dx = centreX < rect.left ? rect.left - centreX : centreX > rect.right ? centreX - rect.right : 0
    const dy = centreY < rect.top ? rect.top - centreY : centreY > rect.bottom ? centreY - rect.bottom : 0
    const distance = dx + dy
    if (!best || distance < best.distance) best = { id: panel.id, distance }
  }
  return best ? best.id : null
}

function restoreSection(): void {
  const id = readStorage(safeSession(), RETURN_KEY)
  if (!id) return
  writeStorage(safeSession(), RETURN_KEY, null)
  if (id === 'hero') return
  const jump = (): void => {
    const target = document.getElementById(id)
    if (!target) return
    const probe = document.createElement('a')
    probe.href = `#${id}`
    probe.hidden = true
    document.body.append(probe)
    const handled = !probe.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    probe.remove()
    if (!handled) target.scrollIntoView({ behavior: 'auto', block: 'start' })
  }
  const start = (): void => {
    window.setTimeout(jump, RESTORE_DELAY_MS)
  }
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}

function bindSwitch(): void {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = (event.target as Element | null)?.closest?.('.lang-switch a')
    if (!(link instanceof HTMLAnchorElement)) return
    const target: Language = link.hreflang === 'de' ? 'de' : 'en'
    writeStorage(safeLocal(), LANGUAGE_KEY, target)
    if (target === currentLanguage()) {
      event.preventDefault()
      return
    }
    const id = visibleSectionId()
    if (id) writeStorage(safeSession(), RETURN_KEY, id)
  })
}

function applyStoredLanguage(): void {
  const stored = readStorage(safeLocal(), LANGUAGE_KEY)
  if (stored !== 'de' || currentLanguage() !== 'en') return
  if (window.location.pathname !== PATHS.en || window.location.hash) return
  window.location.replace(PATHS.de)
}

export function initI18n(): void {
  applyStoredLanguage()
  bindSwitch()
  restoreSection()
}
