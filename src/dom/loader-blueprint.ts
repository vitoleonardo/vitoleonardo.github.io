import type { HandoffTarget, LoaderMotif, LoaderStage } from './loader-motif'

type Group = 'ground' | 'low' | 'high' | 'mast'

const GROUP_BY_STAGE: Readonly<Partial<Record<LoaderStage, Group>>> = {
  script: 'low',
  textures: 'high',
  compiled: 'mast',
}

const SHEET_WIDTH = 320
const SHEET_HEIGHT = 420
const GROUND_Y = 372
const PLATE_STEP = 40
const PLATE_COUNT = 7
const TOWER_LEFT = 120
const TOWER_RIGHT = 240
const CORE_RIGHT = 272
const CROWN_TOP = 64
const MAST_X = 190
const BEACON_Y = 18

function plateY(index: number): number {
  return GROUND_Y - PLATE_STEP * index
}

function stairs(fromY: number, toY: number): string {
  const steps: string[] = [`M${TOWER_RIGHT} ${fromY}`]
  let y = fromY
  let left = false
  while (y > toY) {
    y = Math.max(toY, y - PLATE_STEP / 2)
    steps.push(`L${left ? TOWER_RIGHT : CORE_RIGHT} ${y}`)
    left = !left
  }
  return steps.join('')
}

const STROKES: ReadonlyArray<{ group: Group; d: string }> = [
  { group: 'ground', d: `M${TOWER_LEFT - 16} ${GROUND_Y + 8}H308` },
  { group: 'ground', d: `M${TOWER_LEFT - 4} ${GROUND_Y + 8}V${GROUND_Y}H${CORE_RIGHT + 4}V${GROUND_Y + 8}` },
  { group: 'ground', d: `M${TOWER_LEFT} ${GROUND_Y}V${plateY(1)}` },
  { group: 'ground', d: `M${TOWER_RIGHT} ${GROUND_Y}V${plateY(1)}` },
  { group: 'low', d: `M${TOWER_LEFT} ${plateY(1)}V${plateY(4)}` },
  { group: 'low', d: `M${TOWER_RIGHT} ${plateY(1)}V${plateY(4)}` },
  { group: 'low', d: `M${CORE_RIGHT} ${GROUND_Y}V${plateY(4)}` },
  ...[1, 2, 3, 4].map((index) => ({ group: 'low' as const, d: `M${TOWER_LEFT} ${plateY(index)}H${CORE_RIGHT}` })),
  { group: 'low', d: stairs(GROUND_Y, plateY(4)) },
  { group: 'high', d: `M${TOWER_LEFT} ${plateY(4)}V${CROWN_TOP}` },
  { group: 'high', d: `M${TOWER_RIGHT} ${plateY(4)}V${CROWN_TOP}` },
  { group: 'high', d: `M${CORE_RIGHT} ${plateY(4)}V${plateY(7) - 10}` },
  ...[5, 6, 7].map((index) => ({ group: 'high' as const, d: `M${TOWER_LEFT} ${plateY(index)}H${CORE_RIGHT}` })),
  { group: 'high', d: stairs(plateY(4), plateY(7)) },
  { group: 'high', d: `M${TOWER_LEFT} ${plateY(7)}L${TOWER_RIGHT} ${CROWN_TOP}` },
  { group: 'high', d: `M${TOWER_LEFT} ${CROWN_TOP}L${TOWER_RIGHT} ${plateY(7)}` },
  { group: 'high', d: `M${TOWER_LEFT - 8} ${CROWN_TOP}H${TOWER_RIGHT + 8}` },
  { group: 'mast', d: `M${MAST_X} ${CROWN_TOP}V${BEACON_Y + 4}` },
  { group: 'mast', d: `M${MAST_X - 12} 46H${MAST_X + 12}` },
  { group: 'mast', d: `M${MAST_X - 8} 36H${MAST_X + 8}` },
]

const LABELS: ReadonlyArray<{ group: Group; text: string; y: number }> = [
  { group: 'ground', text: 'ST · 0 m', y: GROUND_Y + 8 },
  { group: 'low', text: '3 · 12 m', y: plateY(3) },
  { group: 'high', text: 'R · 28 m', y: plateY(7) },
  { group: 'mast', text: 'Mast', y: 40 },
]

const STROKE_MS = 450
const STROKE_STAGGER_MS = 70
const WINDOW_STAGGER_MS = 60
const PEN_LOOP_MS = 2400
const HANDOFF_MS = 1100
const DISSOLVE_AFTER_MS = 500

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value))
  return node
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

export function createBlueprintMotif(): LoaderMotif {
  let root: HTMLElement | null = null
  let disposed = false
  let penFrame = 0
  let penPath: SVGPathElement | null = null
  let lightsOn: Promise<void> = Promise.resolve()

  const sheet = el('div', 'bp-sheet')
  const drawing = svg('svg', { class: 'bp-svg', viewBox: `0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}` })
  const windows = Array.from({ length: PLATE_COUNT }, (_, index) => {
    const top = plateY(index + 1)
    const bottom = index === 0 ? GROUND_Y : plateY(index)
    return svg('rect', { class: 'bp-window', x: TOWER_LEFT + 6, y: top + 5, width: TOWER_RIGHT - TOWER_LEFT - 12, height: bottom - top - 10 })
  })
  const strokes = STROKES.map((stroke) => {
    const path = svg('path', { class: 'bp-stroke', d: stroke.d, 'data-group': stroke.group })
    return { group: stroke.group, path }
  })
  const beacon = svg('circle', { class: 'bp-beacon', cx: MAST_X, cy: BEACON_Y, r: 3 })
  const pen = svg('circle', { class: 'bp-pen', cx: MAST_X, cy: GROUND_Y, r: 2.2 })
  const labels = LABELS.map((label) => {
    const node = el('span', 'bp-label', label.text)
    node.style.top = `${(label.y / SHEET_HEIGHT) * 100}%`
    node.dataset.group = label.group
    return node
  })

  function prepareStrokes(): void {
    for (const { path } of strokes) {
      const length = path.getTotalLength()
      path.style.strokeDasharray = String(length)
      path.style.strokeDashoffset = String(length)
    }
  }

  function followPen(path: SVGPathElement): void {
    penPath = path
    pen.classList.add('is-active')
    const length = path.getTotalLength()
    const tick = (now: number): void => {
      if (disposed || penPath !== path) return
      const point = path.getPointAtLength(((now % PEN_LOOP_MS) / PEN_LOOP_MS) * length)
      pen.setAttribute('cx', String(point.x))
      pen.setAttribute('cy', String(point.y))
      penFrame = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(penFrame)
    penFrame = requestAnimationFrame(tick)
  }

  function draw(group: Group): void {
    const paths = strokes.filter((stroke) => stroke.group === group).map((stroke) => stroke.path)
    for (const [index, path] of paths.entries()) {
      path.style.transition = `stroke-dashoffset ${STROKE_MS}ms var(--ease-out) ${index * STROKE_STAGGER_MS}ms`
      path.style.strokeDashoffset = '0'
    }
    for (const label of labels) if (label.dataset.group === group) label.classList.add('is-shown')
    const last = paths.at(-1)
    if (last) followPen(last)
  }

  async function lightWindows(): Promise<void> {
    await wait(STROKE_MS)
    beacon.classList.add('is-lit')
    pen.classList.remove('is-active')
    penPath = null
    for (const pane of windows) {
      if (disposed) return
      pane.classList.add('is-lit')
      await wait(WINDOW_STAGGER_MS)
    }
  }

  return {
    mount(target) {
      root = target
      root.classList.add('m-blueprint')
      drawing.append(...windows, ...strokes.map((stroke) => stroke.path), beacon, pen)
      sheet.append(drawing, ...labels)
      root.append(sheet)
      prepareStrokes()
      void drawing.getBoundingClientRect()
      draw('ground')
    },
    setStage(stage) {
      const group = GROUP_BY_STAGE[stage]
      if (group) draw(group)
      if (stage === 'ready') lightsOn = lightWindows()
    },
    async handoff({ rail }: HandoffTarget) {
      await lightsOn
      if (!root || disposed) return
      root.classList.add('is-handoff')
      await nextFrame()
      for (const label of labels) {
        const from = label.getBoundingClientRect()
        label.style.transform = `translate(${rail.left - from.left}px, -50%)`
      }
      await wait(DISSOLVE_AFTER_MS)
      root.classList.add('is-dissolve')
      await wait(HANDOFF_MS - DISSOLVE_AFTER_MS)
    },
    destroy() {
      disposed = true
      cancelAnimationFrame(penFrame)
      sheet.remove()
      root?.classList.remove('m-blueprint', 'is-handoff', 'is-dissolve')
    },
  }
}
