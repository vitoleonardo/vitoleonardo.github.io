import { inflateSync } from 'node:zlib'
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:4173'
const FLIPS = Number(process.env.FLIPS || 8)
const WIDTH = 393
const HEIGHTS = [659, 739]
const FLIP_MS = 450
const TUBE_SHOWN = 10000
const TUBE_GONE = 1500

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

function decodePng(buffer) {
  let offset = 8
  let width = 0
  let height = 0
  let channels = 4
  const chunks = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      channels = data[9] === 6 ? 4 : 3
    }
    if (type === 'IDAT') chunks.push(data)
    offset += 12 + length
  }
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const corner = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0
      const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, corner)][filter]
      pixels[y * stride + x] = (line[x] + predictor) & 255
    }
  }
  return { width, height, channels, pixels }
}

function tubePixels(png) {
  const { width, height, channels, pixels } = decodePng(png)
  let count = 0
  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * channels]
    const g = pixels[i * channels + 1]
    const b = pixels[i * channels + 2]
    if (b > 150 && b - r > 60 && b - g > 40) count++
  }
  return count
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args:
    process.platform === 'darwin'
      ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHTS[0] }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await page.goto(`${BASE}/de/#stop-backend`, { waitUntil: 'load' })
await page.waitForFunction(() => document.documentElement.classList.contains('three-ready'), null, { timeout: 30000 })
await page.waitForTimeout(2500)

const frames = []
cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
  frames.push(Buffer.from(data, 'base64'))
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
await page.waitForTimeout(600)
for (let flip = 1; flip <= FLIPS; flip++) {
  await page.setViewportSize({ width: WIDTH, height: HEIGHTS[flip % 2] })
  await page.waitForTimeout(FLIP_MS)
}
await cdp.send('Page.stopScreencast')
await browser.close()

const counts = frames.map(tubePixels)
const blanks = counts.filter((count, index) => index > 0 && count < TUBE_GONE && counts[index - 1] > TUBE_SHOWN).length
console.log(`${blanks} blank frames over ${FLIPS} viewport height flips (${frames.length} frames captured)`)
if (!counts.some((count) => count > TUBE_SHOWN)) {
  console.log('The tube never appeared, so nothing was checked.')
  process.exitCode = 2
} else if (blanks > 0) {
  process.exitCode = 1
}
