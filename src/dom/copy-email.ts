const STATUS_CLEAR_MS = 5000

export function addressFromMailto(href: string): string {
  const withoutScheme = href.replace(/^mailto:/i, '')
  const address = withoutScheme.split('?')[0]
  try {
    return decodeURIComponent(address)
  } catch {
    return address
  }
}

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

export function announce(status: HTMLElement, message: string): void {
  window.clearTimeout(clearTimer)
  status.textContent = ''
  requestAnimationFrame(() => {
    status.textContent = message
    clearTimer = window.setTimeout(() => {
      status.textContent = ''
    }, STATUS_CLEAR_MS)
  })
}

export async function copyEmailFrom(scope: ParentNode): Promise<boolean> {
  const link = scope.querySelector<HTMLAnchorElement>('a[href^="mailto:"]')
  const status = scope.querySelector<HTMLElement>('.copy-status')
  if (!link || !status) return false
  const address = addressFromMailto(link.getAttribute('href') ?? '')
  const copied = await copyText(address)
  const confirmation = scope.querySelector<HTMLElement>('.copy-done')?.textContent?.trim() ?? address
  announce(status, copied ? confirmation : address)
  return copied
}
