const STATUS_CLEAR_MS = 5000

function copyWithSelection(text: string): boolean {
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.setAttribute('aria-hidden', 'true')
  field.style.position = 'fixed'
  field.style.top = '0'
  field.style.opacity = '0'
  document.body.append(field)
  field.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
  }
}

export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return copyWithSelection(text)
    }
  }
  return copyWithSelection(text)
}

let clearTimer = 0

export function announceStatus(status: HTMLElement, message: string): void {
  window.clearTimeout(clearTimer)
  status.textContent = ''
  requestAnimationFrame(() => {
    status.textContent = message
    clearTimer = window.setTimeout(() => {
      status.textContent = ''
    }, STATUS_CLEAR_MS)
  })
}
