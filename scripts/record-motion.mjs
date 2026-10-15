import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:4173'
const WIDTH = Number(process.env.WIDTH || 1920)
const HEIGHT = Number(process.env.HEIGHT || 1080)
const PX_PER_SECOND = Number(process.env.SPEED || 1250)
const STEP_MS = 16
const INTRO_MS = 2600
const HOLD_MS = 2000
const outDir = new URL('../docs/motion/', import.meta.url).pathname
const rawDir = `${outDir}raw/`

rmSync(rawDir, { recursive: true, force: true })
mkdirSync(rawDir, { recursive: true })

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  recordVideo: { dir: rawDir, size: { width: WIDTH, height: HEIGHT } },
})
const page = await context.newPage()
const started = Date.now()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

await page.goto(BASE)
await page.waitForFunction(() => document.documentElement.classList.contains('three-ready'), null, { timeout: 20000 })
await page.waitForTimeout(INTRO_MS)
await page.mouse.move(WIDTH / 2, HEIGHT / 2)

const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
const timeline = []
let sent = 0
let last = Date.now()
while (sent < maxScroll + 200) {
  const now = Date.now()
  const delta = Math.max(1, Math.round(((now - last) / 1000) * PX_PER_SECOND))
  last = now
  await page.mouse.wheel(0, delta)
  sent += delta
  const state = await page.evaluate(() => [Math.round(scrollY), document.documentElement.dataset.scene ?? ''])
  timeline.push({ t: Date.now() - started, scroll: state[0], scene: state[1] })
  await page.waitForTimeout(STEP_MS)
}
await page.waitForTimeout(HOLD_MS)
timeline.push({ t: Date.now() - started, scroll: await page.evaluate(() => Math.round(scrollY)), scene: 'end' })

const video = page.video()
await context.close()
await browser.close()
const file = `${outDir}recording.webm`
renameSync(await video.path(), file)
rmSync(rawDir, { recursive: true, force: true })
writeFileSync(`${outDir}recording-timeline.json`, JSON.stringify({ width: WIDTH, height: HEIGHT, pxPerSecond: PX_PER_SECOND, maxScroll, errors, timeline }, null, 0))
console.log(`recorded ${file}, ${timeline.length} steps, errors: ${errors.length}`)
