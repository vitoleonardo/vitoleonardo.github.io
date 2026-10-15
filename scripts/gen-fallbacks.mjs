import { readFileSync, writeFileSync } from 'node:fs'
import {
  AGENT_LOOP,
  buildShape,
  DATA_BRAID,
  SUN_REST,
  TEACHING_SPIRAL,
  toStageY,
} from '../src/figures/shapes.ts'

const file = new URL('../index.html', import.meta.url)
const SAMPLE_STEP = 4
const STRAND_SPREAD = 40
const STRAND_BRAID = 11
const LEADER_X = 1168
const LABEL_Y = [150, 215, 280, 345]

const round = (value) => Math.round(value * 10) / 10

function pathData(points, from = 0, to = points.length / 3 - 1, step = SAMPLE_STEP) {
  const parts = []
  for (let i = from; i <= to; i += step) parts.push(`${round(points[i * 3])} ${round(points[i * 3 + 1])}`)
  const last = `${round(points[to * 3])} ${round(points[to * 3 + 1])}`
  if (parts[parts.length - 1] !== last) parts.push(last)
  return `M ${parts.join(' L ')}`
}

const tube = (d, extra = '') => `<path class="tube${extra}" d="${d}"/>`

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function heroFigure() {
  const line = buildShape('hero').points
  const cx = SUN_REST.x
  const cy = toStageY(SUN_REST.y)
  const r = SUN_REST.radius
  return [
    '<defs><radialGradient id="sun-gradient" cx="36%" cy="30%" r="78%" fx="34%" fy="28%"><stop offset="0" stop-color="#7f97ff"/><stop offset="0.35" stop-color="#2f58ff"/><stop offset="0.7" stop-color="#1f4bff"/><stop offset="0.92" stop-color="#1236c8"/><stop offset="1" stop-color="#0c2796"/></radialGradient></defs>',
    `<ellipse class="sun-shadow" cx="${cx}" cy="${cy + r + 22}" rx="${r * 0.8}" ry="${r * 0.16}"/>`,
    `<g class="sun"><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#sun-gradient)"/></g>`,
    tube(pathData(line, 0, line.length / 3 - 1, 40), ' hero-line-path'),
  ].join('')
}

function dataFigure() {
  const { points, radius } = buildShape('data')
  const count = points.length / 3
  const strands = []
  let merge = 0
  for (let i = 0; i < count; i++) if (points[i * 3] <= DATA_BRAID.mergeX) merge = i
  for (let k = 0; k < 4; k++) {
    const parts = []
    for (let i = 0; i <= merge; i += 2) {
      const before = Math.max(0, i - 1)
      const after = Math.min(count - 1, i + 1)
      const tx = points[after * 3] - points[before * 3]
      const ty = points[after * 3 + 1] - points[before * 3 + 1]
      const length = Math.hypot(tx, ty) || 1
      const x = points[i * 3]
      const envelope = 1 - smoothstep(380, 900, x)
      const fade = 1 - smoothstep(620, 900, x)
      const offset = (k - 1.5) * STRAND_SPREAD * envelope + STRAND_BRAID * Math.sin(x / 55 + k * 1.7) * fade
      parts.push(`${round(x - (ty / length) * offset)} ${round(points[i * 3 + 1] + (tx / length) * offset)}`)
    }
    strands.push(`<path class="strand strand-${k + 1}" d="M ${parts.join(' L ')}"/>`)
  }
  const pieces = []
  const bands = 18
  let start = 0
  for (let band = 1; band <= bands; band++) {
    const edge = band === bands ? count - 1 : Math.round((band / bands) * (count - 1))
    const width = 34 * radius[Math.round((start + edge) / 2)]
    pieces.push(`<path class="tube" style="stroke-width:${round(width)}" d="${pathData(points, start, edge, 3)}"/>`)
    start = edge
  }
  return strands.join('') + pieces.join('')
}

function nodes() {
  return [-Math.PI / 2, Math.PI, 0, Math.PI / 2]
    .map((angle) => `<circle class="node" cx="${round(AGENT_LOOP.x + AGENT_LOOP.radius * Math.cos(angle))}" cy="${round(toStageY(AGENT_LOOP.y + AGENT_LOOP.radius * Math.sin(angle)))}" r="9"/>`)
    .join('')
}

function rocketFigure() {
  const { points } = buildShape('ai-coding')
  const last = points.length / 3 - 1
  const x = points[last * 3]
  const y = points[last * 3 + 1]
  const fin = [[8, 213], [56, 291], [12, 271]].map(([dx, dy]) => `${round(x + dx)} ${round(y + dy)}`).join(' L ')
  return [
    `<path class="fin" d="M ${fin} Z"/>`,
    tube(pathData(points)),
    `<path class="nose" d="M ${x - 19} ${y + 3} C ${x - 19} ${y - 40} ${x - 6} ${y - 70} ${x} ${y - 77} C ${x + 6} ${y - 70} ${x + 19} ${y - 40} ${x + 19} ${y + 3} Z"/>`,
    `<circle class="window-rim" cx="${x}" cy="${y + 93}" r="11"/>`,
    `<circle class="window" cx="${x}" cy="${y + 93}" r="8"/>`,
  ].join('')
}

function sayHiFigure() {
  return tube(pathData(buildShape('say-hi').points))
}

const FIGURES = {
  hero: heroFigure,
  index: () => tube(pathData(buildShape('index').points, 0, 519, 40)),
  frontend: () => tube(pathData(buildShape('frontend').points)),
  backend: () => tube(pathData(buildShape('backend').points)),
  cloud: () => tube(pathData(buildShape('cloud').points)),
  data: dataFigure,
  'ai-products': () => nodes() + tube(pathData(buildShape('ai-products').points)),
  'ai-coding': rocketFigure,
  teaching: () => tube(pathData(buildShape('teaching').points, 0, 519, 2)),
  about: () => tube(pathData(buildShape('about').points)),
  'say-hi': sayHiFigure,
}

function ringLeaders() {
  const centreX = TEACHING_SPIRAL.x
  const centreY = toStageY(TEACHING_SPIRAL.y)
  const turns = TEACHING_SPIRAL.turns
  const anchors = [0, 1, 2].map((k) => {
    const t = (k + 0.425) / turns
    const angle = Math.PI + Math.PI * 2 * turns * t
    const r = TEACHING_SPIRAL.outer + (TEACHING_SPIRAL.inner - TEACHING_SPIRAL.outer) * t
    return [centreX + r * Math.cos(angle), centreY + r * Math.sin(angle)]
  })
  const endAngle = Math.PI + Math.PI * 2 * turns
  anchors.push([centreX + TEACHING_SPIRAL.inner * Math.cos(endAngle), centreY + TEACHING_SPIRAL.inner * Math.sin(endAngle)])
  return anchors
    .map(([x, y], index) => `<line x1="${round(x)}" y1="${round(y)}" x2="${LEADER_X}" y2="${LABEL_Y[index]}"/><circle cx="${round(x)}" cy="${round(y)}" r="4"/>`)
    .join('')
}

let html = readFileSync(file, 'utf8')
let replaced = 0
html = html.replace(
  /(data-path-stage="([^"]+)">\s*(?:<div[^>]*><\/div>\s*)?<svg class="path-fallback" viewBox="0 0 1280 880" aria-hidden="true" focusable="false">)([\s\S]*?)(<\/svg>)/g,
  (match, open, id, _content, close) => {
    const build = FIGURES[id]
    if (!build) return match
    replaced++
    return `${open}${build()}${close}`
  },
)
html = html.replace(
  /(<svg class="ring-leaders" viewBox="0 0 1280 880" aria-hidden="true" focusable="false">)([\s\S]*?)(<\/svg>)/,
  (match, open, _content, close) => `${open}${ringLeaders()}${close}`,
)
writeFileSync(file, html)
console.log(`fallback figures regenerated: ${replaced}`)
