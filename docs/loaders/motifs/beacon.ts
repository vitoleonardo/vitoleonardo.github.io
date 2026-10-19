import type { HandoffTarget, LoaderMotif, LoaderStage } from '../../../src/dom/loader-motif'
import { applyLevel, el, retrigger, wait } from './shared'

const STATUS_BY_STAGE: Readonly<Record<LoaderStage, string>> = {
  script: 'Script',
  textures: 'Textures',
  compiled: 'Shaders',
  ready: 'Ready',
}
const GLYPHS = '▮▯/\\|_-=+<>:·ABCDEFGHKLMNPRSTUVXYZ0123456789'
const SCRAMBLE_MS = 420
const PULSE_MS = 900
const HANDOFF_MS = 850

export function createBeaconMotif(): LoaderMotif {
  let root: HTMLElement | null = null
  let disposed = false
  let scrambleFrame = 0
  let pulseTimer = 0

  const horizon = el('div', 'bc-horizon')
  const beacon = el('div', 'bc-beacon')
  const glow = el('div', 'bc-glow')
  const status = el('p', 'bc-status', 'Street')

  function scrambleInto(text: string): void {
    const start = performance.now()
    const tick = (now: number): void => {
      if (disposed) return
      const progress = Math.min(1, (now - start) / SCRAMBLE_MS)
      let output = ''
      for (const [index, character] of Array.from(text).entries()) {
        const settleAt = ((index + 1) / text.length) * 0.85
        output += progress >= settleAt ? character : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
      }
      status.textContent = output
      if (progress < 1) scrambleFrame = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(scrambleFrame)
    scrambleFrame = requestAnimationFrame(tick)
  }

  function pulse(): void {
    retrigger(glow, 'is-pulse')
    clearTimeout(pulseTimer)
    pulseTimer = window.setTimeout(() => glow.classList.remove('is-pulse'), PULSE_MS)
  }

  return {
    mount(target) {
      root = target
      root.classList.add('m-beacon')
      beacon.append(glow)
      root.append(horizon, beacon, status)
    },
    setStage(stage) {
      if (!root) return
      applyLevel(root, stage)
      pulse()
      scrambleInto(STATUS_BY_STAGE[stage])
    },
    async handoff(_target: HandoffTarget) {
      if (!root) return
      root.classList.add('is-handoff')
      await wait(HANDOFF_MS)
    },
    destroy() {
      disposed = true
      cancelAnimationFrame(scrambleFrame)
      clearTimeout(pulseTimer)
      horizon.remove()
      beacon.remove()
      status.remove()
      root?.classList.remove('m-beacon', 'is-handoff', 'is-s1', 'is-s2', 'is-s3', 'is-s4')
    },
  }
}
