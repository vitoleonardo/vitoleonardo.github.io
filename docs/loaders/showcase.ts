import '@fontsource-variable/schibsted-grotesk/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import '../../src/styles/tokens.css'
import '../../src/styles/base.css'
import '../../src/styles/loader.css'
import './showcase.css'
import { LOADER_STAGES, type LoaderMotif, type LoaderStage } from '../../src/dom/loader-motif'
import { createBeaconMotif } from './motifs/beacon'
import { createBlueprintMotif } from '../../src/dom/loader-blueprint'
import { createElevatorMotif } from './motifs/elevator'
import { createRainMotif } from './motifs/rain'
import { el, wait } from './motifs/shared'

type Mode = 'replay' | 'skip'
type ReleasePlan = 'instant' | 'fade' | 'handoff'

const FACTORIES: Readonly<Record<string, () => LoaderMotif>> = {
  elevator: createElevatorMotif,
  rain: createRainMotif,
  blueprint: createBlueprintMotif,
  beacon: createBeaconMotif,
}

const STAGE_AT_MS: Readonly<Record<LoaderStage, number>> = { script: 300, textures: 900, compiled: 1600, ready: 2100 }
const FINISH_AT_MS = 2200
const SKIP_FINISH_AT_MS = 100
const SKIP_THRESHOLD_MS = 250
const SLOW_FACTOR = 2.5
const BACKDROP_FADE_MS = 600
const HERO_ALTITUDE = '2'

interface Run {
  cancel(): void
}

const runs = new WeakMap<HTMLElement, Run>()
const html = document.documentElement

function query<T extends Element>(scope: ParentNode, selector: string): T {
  const node = scope.querySelector<T>(selector)
  if (!node) throw new Error(`showcase: missing ${selector}`)
  return node
}

function releasePlan(elapsedMs: number, reducedMotion: boolean, threshold: number): ReleasePlan {
  if (reducedMotion) return 'instant'
  if (elapsedMs < threshold) return 'fade'
  return 'handoff'
}

function runPanel(panel: HTMLElement, mode: Mode): void {
  runs.get(panel)?.cancel()
  const stage = query<HTMLElement>(panel, '.stage')
  const stageList = Array.from(panel.querySelectorAll<HTMLElement>('.panel-stages li'))
  const planOut = query<HTMLElement>(panel, '.panel-plan')
  const factor = query<HTMLInputElement>(panel, '[data-action="slow"]').checked ? SLOW_FACTOR : 1
  const factory = FACTORIES[panel.dataset.motif ?? '']
  stage.querySelector('.loader')?.remove()
  for (const item of stageList) item.classList.remove('is-done')
  planOut.textContent = '…'

  const loader = el('div', 'loader')
  const backdrop = el('div', 'loader-backdrop')
  const motifRoot = el('div', 'loader-stage')
  loader.append(backdrop, motifRoot)
  stage.append(loader)

  const motif = factory()
  const timers: number[] = []
  let cancelled = false
  const shownAt = performance.now()
  const at = (ms: number, task: () => void): void => {
    timers.push(window.setTimeout(task, ms * factor))
  }

  motif.mount(motifRoot)

  async function finish(): Promise<void> {
    const plan = releasePlan(performance.now() - shownAt, html.classList.contains('rm'), SKIP_THRESHOLD_MS * factor)
    planOut.textContent = plan
    if (plan === 'instant') {
      loader.remove()
      motif.destroy()
      return
    }
    loader.classList.add(plan === 'handoff' ? 'is-leaving' : 'is-fading')
    if (plan === 'handoff') {
      await motif.handoff({
        altimeter: query<HTMLElement>(stage, '.altimeter').getBoundingClientRect(),
        rail: query<HTMLElement>(stage, '.floor-rail').getBoundingClientRect(),
        altitude: HERO_ALTITUDE,
      })
    } else {
      await wait(BACKDROP_FADE_MS)
    }
    if (cancelled) return
    loader.remove()
    motif.destroy()
  }

  if (mode === 'replay') {
    for (const name of LOADER_STAGES) {
      at(STAGE_AT_MS[name], () => {
        motif.setStage(name)
        stageList.find((item) => item.dataset.stage === name)?.classList.add('is-done')
      })
    }
  }
  at(mode === 'skip' ? SKIP_FINISH_AT_MS : FINISH_AT_MS, () => void finish())

  runs.set(panel, {
    cancel() {
      cancelled = true
      for (const timer of timers) clearTimeout(timer)
      loader.remove()
      motif.destroy()
    },
  })
}

function wirePanel(panel: HTMLElement): void {
  panel.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')
    if (!button) return
    const action = button.dataset.action
    if (action === 'replay' || action === 'skip') runPanel(panel, action)
    if (action === 'full') {
      panel.classList.toggle('is-full')
      button.setAttribute('aria-pressed', String(panel.classList.contains('is-full')))
    }
  })
}

const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel'))
for (const panel of panels) wirePanel(panel)

query<HTMLInputElement>(document, '[data-action="rm"]').addEventListener('change', (event) => {
  html.classList.toggle('rm', (event.target as HTMLInputElement).checked)
})

query<HTMLButtonElement>(document, '[data-action="replay-all"]').addEventListener('click', () => {
  for (const panel of panels) runPanel(panel, 'replay')
})

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  for (const panel of panels) {
    panel.classList.remove('is-full')
    panel.querySelector('[data-action="full"]')?.setAttribute('aria-pressed', 'false')
  }
})

for (const panel of panels) runPanel(panel, 'replay')
