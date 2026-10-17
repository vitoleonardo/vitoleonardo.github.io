import { indexFloorTargetChapter } from '../world/interaction-state'
import { copyEmailFrom } from './copy-email'
import { createServiceReadout } from './service-readout'

export interface HotspotActions {
  open(id: string, button: HTMLElement | null): void
  close(id: string, button: HTMLElement | null): void
  trigger(id: string, button: HTMLElement | null): void
  dispose(): void
}

export interface HotspotActionOptions {
  scrollToChapter(index: number): void
}

function describeButton(button: HTMLElement): string {
  const description = button.querySelector('.sr-only')?.textContent?.trim()
  return description || button.textContent?.trim() || ''
}

function captionOf(button: HTMLElement): HTMLElement | null {
  return button.closest('.chapter-copy')?.querySelector<HTMLElement>('.work-caption') ?? null
}

export function createHotspotActions(options: HotspotActionOptions): HotspotActions {
  const serviceReadout = createServiceReadout()

  return {
    open(id, button) {
      if (!button) return
      if (id.startsWith('frontend-')) {
        const caption = captionOf(button)
        if (caption) caption.textContent = describeButton(button)
      } else if (id.startsWith('lounge-service-')) {
        serviceReadout.pin(button)
      }
    },
    close(id, button) {
      if (!button) return
      if (id.startsWith('frontend-')) {
        const caption = captionOf(button)
        if (caption) caption.textContent = ''
      } else if (id.startsWith('lounge-service-')) {
        serviceReadout.unpin(button)
      }
    },
    trigger(id, button) {
      const targetChapter = indexFloorTargetChapter(id)
      if (targetChapter !== null) {
        options.scrollToChapter(targetChapter)
        return
      }
      if (id === 'say-hi-beacon' && button) {
        const scope = button.closest('.chapter-copy')
        if (scope) void copyEmailFrom(scope)
      }
    },
    dispose() {
      serviceReadout.dispose()
    },
  }
}
