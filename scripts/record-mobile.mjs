import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:4173'
const LABEL = process.env.LABEL || 'mobile'
const MOTION_LOG = Boolean(process.env.MOTION_LOG)
const WIDTH = 393
const HEIGHT = 852
const SETTLE_MS = 2500
const outDir = new URL('../docs/motion/raw/', import.meta.url).pathname
const framesDir = `${outDir}${LABEL}-frames/`
const outFile = `${outDir}${LABEL}.mp4`

rmSync(framesDir, { recursive: true, force: true })
mkdirSync(framesDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args:
    process.platform === 'darwin'
      ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
})
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await page.goto(`${BASE}/de/${MOTION_LOG ? '?debug=motion' : ''}`, { waitUntil: 'load' })
await page.waitForFunction(() => document.documentElement.classList.contains('three-ready'), null, { timeout: 30000 })
if (MOTION_LOG) await page.addStyleTag({ content: '[data-motion-log] { display: none !important; }' })
await page.waitForTimeout(SETTLE_MS)
if (MOTION_LOG) await page.evaluate(() => window.__motionLog?.clear())

const frames = []
cdp.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
  frames.push({ time: metadata.timestamp, data: Buffer.from(data, 'base64') })
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 748, maxHeight: 1626, everyNthFrame: 1 })
await page.waitForTimeout(500)

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const roundTrips = []
const touch = async (type, y) => {
  const sent = performance.now()
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: WIDTH / 2, y }] })
  roundTrips.push(performance.now() - sent)
}
const drag = async (distance, ms) => {
  const from = distance > 0 ? HEIGHT * 0.8 : HEIGHT * 0.2
  const start = performance.now()
  await touch('touchStart', from)
  for (let done = 0; done < 1; ) {
    await pause(8)
    done = Math.min(1, (performance.now() - start) / ms)
    await touch('touchMove', from - distance * done)
  }
  await touch('touchEnd')
  await pause(120)
}
const slowTo = async (target, pxPerSecond) => {
  for (let guard = 0; guard < 12; guard++) {
    const left = target - (await page.evaluate(() => window.scrollY))
    if (Math.abs(left) < 40) return
    const distance = Math.sign(left) * Math.min(Math.abs(left), 0.5 * HEIGHT)
    await drag(distance, (Math.abs(distance) / pxPerSecond) * 1000)
    await pause(250)
  }
}
const sectionTop = (id) => page.evaluate((target) => document.getElementById(target).getBoundingClientRect().top + window.scrollY, id)

for (let step = 0; step < 3; step++) await drag(0.45 * HEIGHT, 900)
await drag(0.55 * HEIGHT, 90)
await pause(1500)
await slowTo(await sectionTop('stop-frontend'), 900)
for (const distance of [260, -260, 260, -260, 260]) await drag(distance, 290)
await slowTo(await sectionTop('stop-cloud'), 650)
await slowTo(await sectionTop('stop-data'), 650)
await drag(-0.55 * HEIGHT, 90)
await pause(1500)

await cdp.send('Page.stopScreencast')
if (MOTION_LOG) writeFileSync(`${outDir}${LABEL}-log.json`, JSON.stringify(await page.evaluate(() => window.__motionLog?.dump())))
await browser.close()

const lines = ['ffconcat version 1.0']
frames.forEach((frame, index) => {
  const name = `frame_${String(index).padStart(5, '0')}.jpg`
  writeFileSync(`${framesDir}${name}`, frame.data)
  const next = frames[index + 1]
  lines.push(`file ${name}`, `duration ${(next ? next.time - frame.time : 1 / 60).toFixed(6)}`)
})
lines.push(`file frame_${String(frames.length - 1).padStart(5, '0')}.jpg`)
writeFileSync(`${framesDir}list.txt`, `${lines.join('\n')}\n`)
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${framesDir}list.txt`, '-fps_mode', 'vfr', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', outFile])
rmSync(framesDir, { recursive: true, force: true })

const seconds = frames.length > 1 ? frames[frames.length - 1].time - frames[0].time : 0
const sorted = roundTrips.slice().sort((a, b) => a - b)
const percentile = (share) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))].toFixed(1)
console.log(`${outFile}: ${frames.length} frames over ${seconds.toFixed(2)} s (${(frames.length / Math.max(seconds, 1e-3)).toFixed(1)} fps)`)
console.log(`touch event round trip: p50 ${percentile(0.5)} ms, p95 ${percentile(0.95)} ms over ${sorted.length} events`)
console.log(`next: python3 scripts/motion-timing/sync_check.py ${outFile}`)
