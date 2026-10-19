import { env } from '../env'
import {
  buildRamp,
  dropRadius,
  glyphIndex,
  hash,
  parseHexColor,
  rgbString,
  smoothstep,
  stepUnderdamped,
  strokeRadius,
  type Rgb,
} from './glyph-stream-math'
import { hasFinePointer } from './pointer-capability'

const CELL_SIZE = 14
const CELL_GAP = 2
const CELL_PITCH = CELL_SIZE + CELL_GAP
const CELL_RADIUS = 2
const GLYPH_SCALE = 0.56
const GLYPH_ALPHA = 0.82
const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const THICKNESS = 0.7
const TRAIL_SECONDS = 0.85
const MOMENTUM = 0.7
const VISCOSITY = 0.15
const BREAKUP = 0.9
const EDGE_SOFTNESS = 0.5
const SCRAMBLE_PER_SECOND = 8
const SPLASH_SIZE = 1.2
const SPLASH_DROPS = 18
const NOZZLE_OMEGA = 34
const NOZZLE_DAMPING = 0.72
const EMIT_SPACING = 5
const EMIT_MIN_SPEED = 30
const MAX_DROPS = 900
const RAMP_STEPS = 24
const PHYSICS_STEP = 1 / 240
const MAX_FRAME_SECONDS = 0.05

interface Drop {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  radius: number
  seed: number
}

interface Palette {
  ramp: Rgb[]
  glyph: Rgb
  font: string
}

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string) => style.getPropertyValue(name).trim()
  return {
    ramp: buildRamp(parseHexColor(token('--warm')), parseHexColor(token('--signal')), RAMP_STEPS),
    glyph: parseHexColor(token('--readable')),
    font: `600 ${Math.round(CELL_SIZE * GLYPH_SCALE * 10) / 10}px ${token('--font-mono')}`,
  }
}

export function initGlyphStream(): () => void {
  const lifetime = new AbortController()
  const { signal } = lifetime

  let canvas: HTMLCanvasElement | null = null
  let context: CanvasRenderingContext2D | null = null
  let palette: Palette | null = null
  let columns = 0
  let rows = 0
  let coverage = new Float32Array(0)
  let freshest = new Float32Array(0)
  let touched = new Int32Array(0)
  let touchedCount = 0

  const drops: Drop[] = []
  let seedCounter = 1
  let pointer = { x: 0, y: 0 }
  let nozzleX = { position: 0, velocity: 0 }
  let nozzleY = { position: 0, velocity: 0 }
  let emitCarry = 0
  let pouring = false
  let frame = 0
  let lastTime = 0

  function eligible(): boolean {
    return hasFinePointer() && !env.reducedMotion
  }

  function resize(): void {
    if (!canvas || !context || !palette) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const width = window.innerWidth
    const height = window.innerHeight
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.font = palette.font
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    columns = Math.ceil(width / CELL_PITCH)
    rows = Math.ceil(height / CELL_PITCH)
    coverage = new Float32Array(columns * rows)
    freshest = new Float32Array(columns * rows).fill(1)
    touched = new Int32Array(columns * rows)
    touchedCount = 0
  }

  function ensureCanvas(): boolean {
    if (canvas) return context !== null
    canvas = document.createElement('canvas')
    canvas.className = 'glyph-stream'
    canvas.setAttribute('aria-hidden', 'true')
    context = canvas.getContext('2d')
    palette = readPalette()
    document.body.append(canvas)
    resize()
    return context !== null
  }

  function addDrop(x: number, y: number, vx: number, vy: number, radius: number, born: number): void {
    if (drops.length >= MAX_DROPS) drops.shift()
    drops.push({ x, y, vx, vy, born, radius, seed: seedCounter++ })
  }

  function stepNozzle(seconds: number, now: number): void {
    let remaining = seconds
    while (remaining > 0) {
      const step = Math.min(PHYSICS_STEP, remaining)
      remaining -= step
      const fromX = nozzleX.position
      const fromY = nozzleY.position
      nozzleX = stepUnderdamped(nozzleX, pointer.x, NOZZLE_OMEGA, NOZZLE_DAMPING, step)
      nozzleY = stepUnderdamped(nozzleY, pointer.y, NOZZLE_OMEGA, NOZZLE_DAMPING, step)
      if (!pouring) continue
      const speed = Math.hypot(nozzleX.velocity, nozzleY.velocity)
      if (speed < EMIT_MIN_SPEED) {
        emitCarry = 0
        continue
      }
      const distance = Math.hypot(nozzleX.position - fromX, nozzleY.position - fromY)
      const radius = strokeRadius(speed, CELL_SIZE, THICKNESS)
      emitCarry += distance
      while (emitCarry >= EMIT_SPACING) {
        emitCarry -= EMIT_SPACING
        const along = distance === 0 ? 1 : 1 - emitCarry / distance
        addDrop(
          fromX + (nozzleX.position - fromX) * along,
          fromY + (nozzleY.position - fromY) * along,
          nozzleX.velocity * MOMENTUM * 0.35,
          nozzleY.velocity * MOMENTUM * 0.35,
          radius,
          now - remaining,
        )
      }
    }
  }

  function stepDrops(seconds: number, now: number): void {
    const drag = Math.exp(-(3 + VISCOSITY * 12) * seconds)
    let kept = 0
    for (const drop of drops) {
      if (now - drop.born >= TRAIL_SECONDS) continue
      drop.vx *= drag
      drop.vy *= drag
      drop.x += drop.vx * seconds
      drop.y += drop.vy * seconds
      drops[kept++] = drop
    }
    drops.length = kept
  }

  function rasterize(now: number): void {
    const softness = Math.max(1, EDGE_SOFTNESS * CELL_PITCH)
    for (const drop of drops) {
      const age = (now - drop.born) / TRAIL_SECONDS
      const radius = dropRadius(drop.radius, age, BREAKUP, drop.seed)
      if (radius < 0.5) continue
      const fade = 1 - smoothstep(0.7, 1, age)
      const reach = radius + softness
      const firstColumn = Math.max(0, Math.floor((drop.x - reach) / CELL_PITCH))
      const lastColumn = Math.min(columns - 1, Math.floor((drop.x + reach) / CELL_PITCH))
      const firstRow = Math.max(0, Math.floor((drop.y - reach) / CELL_PITCH))
      const lastRow = Math.min(rows - 1, Math.floor((drop.y + reach) / CELL_PITCH))
      for (let row = firstRow; row <= lastRow; row += 1) {
        const centerY = row * CELL_PITCH + CELL_PITCH / 2
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const centerX = column * CELL_PITCH + CELL_PITCH / 2
          const distance = Math.hypot(centerX - drop.x, centerY - drop.y)
          const amount = (1 - smoothstep(radius - softness / 2, radius + softness / 2, distance)) * fade
          if (amount <= 0) continue
          const index = row * columns + column
          if (coverage[index] === 0) touched[touchedCount++] = index
          if (amount > coverage[index]) coverage[index] = amount
          if (amount > 0.2 && age < freshest[index]) freshest[index] = age
        }
      }
    }
  }

  function draw(now: number): void {
    if (!context || !palette) return
    context.clearRect(0, 0, window.innerWidth, window.innerHeight)
    rasterize(now)
    for (let slot = 0; slot < touchedCount; slot += 1) {
      const index = touched[slot]
      const amount = Math.min(1, coverage[index])
      const age = freshest[index]
      coverage[index] = 0
      freshest[index] = 1
      if (amount < 0.04) continue
      const x = (index % columns) * CELL_PITCH + CELL_GAP / 2
      const y = Math.floor(index / columns) * CELL_PITCH + CELL_GAP / 2
      const tone = palette.ramp[Math.round(age * (RAMP_STEPS - 1))]
      context.fillStyle = rgbString(tone, amount)
      context.beginPath()
      context.roundRect(x, y, CELL_SIZE, CELL_SIZE, CELL_RADIUS)
      context.fill()
      if (amount < 0.35) continue
      const character = CHARACTERS[glyphIndex(index, age, now, SCRAMBLE_PER_SECOND, CHARACTERS.length)]
      context.fillStyle = rgbString(palette.glyph, GLYPH_ALPHA * amount)
      context.fillText(character, x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 0.5)
    }
    touchedCount = 0
  }

  function nozzleSettled(): boolean {
    return (
      Math.abs(nozzleX.position - pointer.x) < 0.1 &&
      Math.abs(nozzleY.position - pointer.y) < 0.1 &&
      Math.hypot(nozzleX.velocity, nozzleY.velocity) < 1
    )
  }

  function tick(time: number): void {
    frame = 0
    const now = time / 1000
    const seconds = lastTime === 0 ? 0 : Math.min(now - lastTime, MAX_FRAME_SECONDS)
    lastTime = now
    stepNozzle(seconds, now)
    stepDrops(seconds, now)
    draw(now)
    if (drops.length > 0 || (pouring && !nozzleSettled())) request()
    else lastTime = 0
  }

  function request(): void {
    if (frame === 0) frame = requestAnimationFrame(tick)
  }

  function stopPouring(): void {
    pouring = false
    emitCarry = 0
  }

  document.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch' || !eligible()) {
        stopPouring()
        return
      }
      if (!ensureCanvas()) return
      pointer = { x: event.clientX, y: event.clientY }
      if (!pouring) {
        pouring = true
        nozzleX = { position: pointer.x, velocity: 0 }
        nozzleY = { position: pointer.y, velocity: 0 }
      }
      request()
    },
    { passive: true, signal },
  )

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!pouring || event.pointerType === 'touch') return
      const now = performance.now() / 1000
      for (let drop = 0; drop < SPLASH_DROPS; drop += 1) {
        const seed = seedCounter + drop * 31
        const angle = (drop / SPLASH_DROPS) * Math.PI * 2 + (hash(seed) - 0.5) * 0.6
        const speed = (260 + hash(seed + 1) * 340) * SPLASH_SIZE
        const radius = CELL_SIZE * 0.55 * (0.6 + hash(seed + 2) * 0.6) * SPLASH_SIZE
        addDrop(event.clientX, event.clientY, Math.cos(angle) * speed, Math.sin(angle) * speed, radius, now)
      }
      request()
    },
    { passive: true, signal },
  )

  document.documentElement.addEventListener('pointerleave', stopPouring, { passive: true, signal })
  window.addEventListener('blur', stopPouring, { signal })
  window.addEventListener('resize', resize, { passive: true, signal })

  return () => {
    lifetime.abort()
    if (frame !== 0) cancelAnimationFrame(frame)
    canvas?.remove()
  }
}
