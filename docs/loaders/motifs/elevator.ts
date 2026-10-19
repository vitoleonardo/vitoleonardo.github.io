import type { HandoffTarget, LoaderMotif, LoaderStage } from '../../../src/dom/loader-motif'
import { animateNumber, el, flipTransform, nextFrame, retrigger, wait } from './shared'

interface Floor {
  label: string
  name: string
  metres: number
}

const FLOORS: readonly Floor[] = [
  { label: 'ST', name: 'Street', metres: 0 },
  { label: 'G', name: 'Frontend', metres: 0 },
  { label: '1', name: 'Backend', metres: 4 },
  { label: '2', name: 'Cloud', metres: 8 },
  { label: '3', name: 'Data', metres: 12 },
  { label: '4', name: 'AI products', metres: 16 },
  { label: '5', name: 'AI coding', metres: 20 },
  { label: '6', name: 'People', metres: 24 },
  { label: 'R', name: 'About', metres: 28 },
  { label: 'A', name: 'Say hi', metres: 40 },
]

const LIT_BY_STAGE: Readonly<Record<LoaderStage, number>> = { script: 2, textures: 5, compiled: 8, ready: 10 }
const TICK_STEP_MS = 90
const COUNTDOWN_MS = 500
const HANDOFF_MS = 950

export function createElevatorMotif(): LoaderMotif {
  let root: HTMLElement | null = null
  let disposed = false
  let lit = 0
  let queue: Promise<void> = Promise.resolve()

  const centre = el('div', 'ev-centre')
  const readout = el('div', 'ev-readout')
  const value = el('span', 'ev-value', '0')
  const unit = el('span', 'ev-unit', 'm')
  const line = el('span', 'ev-line')
  const floor = el('p', 'ev-floor', 'ST · Street')
  const ticks = el('ol', 'ev-ticks')
  const tickNodes = FLOORS.map((entry) => {
    const tick = el('li', 'ev-tick', entry.label)
    ticks.append(tick)
    return tick
  })

  function lightUpTo(count: number): void {
    queue = queue.then(async () => {
      while (lit < count && !disposed) {
        const entry = FLOORS[lit]
        for (const [index, tick] of tickNodes.entries()) tick.classList.toggle('is-current', index === lit)
        tickNodes[lit].classList.add('is-lit')
        value.textContent = String(entry.metres)
        floor.textContent = `${entry.label} · ${entry.name}`
        retrigger(line, 'is-pulse')
        lit++
        await wait(TICK_STEP_MS)
      }
    })
  }

  return {
    mount(target) {
      root = target
      root.classList.add('m-elevator')
      readout.append(value, unit, line)
      centre.append(readout, floor)
      root.append(centre, ticks)
    },
    setStage(stage) {
      lightUpTo(LIT_BY_STAGE[stage])
    },
    async handoff({ altimeter, rail, altitude }: HandoffTarget) {
      await queue
      if (!root || disposed) return
      root.classList.add('is-handoff')
      animateNumber(value, Number(value.textContent), Number(altitude) || 0, COUNTDOWN_MS, () => !disposed)
      await nextFrame()
      readout.style.transform = flipTransform(readout.getBoundingClientRect(), altimeter)
      ticks.style.transform = `translate(${rail.right - ticks.getBoundingClientRect().right}px, -50%)`
      await wait(HANDOFF_MS)
    },
    destroy() {
      disposed = true
      centre.remove()
      ticks.remove()
      root?.classList.remove('m-elevator', 'is-handoff')
    },
  }
}
