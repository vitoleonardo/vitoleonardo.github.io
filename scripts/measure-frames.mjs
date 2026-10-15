import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:4173'
const WIDTH = Number(process.env.WIDTH || 1440)
const HEIGHT = Number(process.env.HEIGHT || 900)
const DPR = Number(process.env.DPR || 2)
const PX_PER_SECOND = 1250
const STEP_MS = 16

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: DPR })
await page.goto(BASE)
await page.waitForFunction(() => document.documentElement.classList.contains('three-ready'), null, { timeout: 20000 })
await page.waitForTimeout(2500)
await page.mouse.move(WIDTH / 2, HEIGHT / 2)

const stackStart = Math.round(3.0 * HEIGHT)
const stackEnd = Math.round(10.1 * HEIGHT)
await page.evaluate((y) => window.scrollTo(0, y), stackStart)
await page.waitForTimeout(1500)

await page.evaluate(() => {
  const state = { frames: [], longTasks: 0, last: performance.now(), running: true }
  window.__frames = state
  const loop = (now) => {
    state.frames.push(now - state.last)
    state.last = now
    if (state.running) requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
  new PerformanceObserver((list) => {
    state.longTasks += list.getEntries().length
  }).observe({ type: 'longtask', buffered: false })
})

let last = Date.now()
while ((await page.evaluate(() => scrollY)) < stackEnd) {
  const now = Date.now()
  await page.mouse.wheel(0, Math.max(1, Math.round(((now - last) / 1000) * PX_PER_SECOND)))
  last = now
  await page.waitForTimeout(STEP_MS)
}
await page.waitForTimeout(800)

const result = await page.evaluate(() => {
  const state = window.__frames
  state.running = false
  const frames = state.frames.slice(2).sort((a, b) => a - b)
  const at = (q) => frames[Math.min(frames.length - 1, Math.floor(q * frames.length))]
  const mean = frames.reduce((sum, value) => sum + value, 0) / frames.length
  return {
    frames: frames.length,
    meanMs: +mean.toFixed(2),
    medianMs: +at(0.5).toFixed(2),
    p95Ms: +at(0.95).toFixed(2),
    p99Ms: +at(0.99).toFixed(2),
    over20ms: frames.filter((value) => value > 20).length,
    fps: +(1000 / mean).toFixed(1),
    longTasks: state.longTasks,
  }
})
console.log(JSON.stringify({ viewport: `${WIDTH}x${HEIGHT}@${DPR}x`, ...result }))
await browser.close()
