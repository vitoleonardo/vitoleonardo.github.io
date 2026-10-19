import type { HandoffTarget, LoaderMotif } from '../../../src/dom/loader-motif'
import { applyLevel, el, nextFrame, wait } from './shared'

const LAYERS = [
  { speed: '1.1s', length: '140px', gap: '46px', alpha: '18%', offset: '0px' },
  { speed: '1.6s', length: '180px', gap: '71px', alpha: '12%', offset: '23px' },
  { speed: '2.3s', length: '220px', gap: '97px', alpha: '9%', offset: '41px' },
] as const

const HANDOFF_MS = 900

function rainLayers(): HTMLElement[] {
  return LAYERS.map((layer) => {
    const node = el('div', 'rn-layer')
    node.style.setProperty('--speed', layer.speed)
    node.style.setProperty('--len', layer.length)
    node.style.setProperty('--gap', layer.gap)
    node.style.setProperty('--alpha', layer.alpha)
    node.style.setProperty('--offset', layer.offset)
    return node
  })
}

export function createRainMotif(): LoaderMotif {
  let root: HTMLElement | null = null
  const parts = {
    sky: el('div', 'rn-sky'),
    street: el('div', 'rn-street'),
    horizon: el('div', 'rn-horizon'),
    tower: el('div', 'rn-tower'),
    windowOne: el('div', 'rn-window rn-window-1'),
    windowTwo: el('div', 'rn-window rn-window-2'),
    door: el('div', 'rn-door'),
    doorGlow: el('div', 'rn-door-glow'),
    tag: el('p', 'rn-tag', 'ST · Street'),
  }

  return {
    mount(target) {
      root = target
      root.classList.add('m-rain')
      parts.sky.append(...rainLayers())
      parts.street.append(...rainLayers())
      root.append(...Object.values(parts))
    },
    setStage(stage) {
      if (root) applyLevel(root, stage)
    },
    async handoff({ rail }: HandoffTarget) {
      if (!root) return
      root.classList.add('is-handoff')
      await nextFrame()
      const from = parts.tag.getBoundingClientRect()
      parts.tag.style.transform = `translate(${rail.left - from.left}px, ${rail.bottom - from.height - from.top}px)`
      await wait(HANDOFF_MS)
    },
    destroy() {
      for (const part of Object.values(parts)) part.remove()
      root?.classList.remove('m-rain', 'is-handoff', 'is-s1', 'is-s2', 'is-s3', 'is-s4')
    },
  }
}
