import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(projectRoot, 'public', 'posters')
const baseUrl = process.env.POSTER_URL ?? 'http://localhost:4173/'
const viewport = { width: 1440, height: 900 }
const webpQuality = 0.72
const settleMs = 1500
const readyTimeoutMs = 60_000
const sizeBudgetBytes = 120 * 1024

const chapterIds = [
  'hero',
  'index',
  'stop-frontend',
  'stop-backend',
  'stop-cloud',
  'stop-data',
  'stop-ai-products',
  'stop-ai-coding',
  'stop-teaching',
  'about',
  'say-hi',
]

const hideInterfaceStyle = 'body > :not(canvas) { visibility: hidden !important; }'

const centreChapter = (chapterId) => {
  const section = document.getElementById(chapterId)
  const sectionTop = section.getBoundingClientRect().top + window.scrollY
  window.scrollTo(0, sectionTop + section.offsetHeight / 2 - window.innerHeight / 2)
}

const encodeWebp = async (browser, pngBuffer) => {
  const context = await browser.newContext({ viewport: { width: 16, height: 16 } })
  const page = await context.newPage()
  try {
    const source = `data:image/png;base64,${pngBuffer.toString('base64')}`
    const webpDataUrl = await page.evaluate(
      async ({ source, quality }) => {
        const image = new Image()
        image.src = source
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        canvas.getContext('2d').drawImage(image, 0, 0)
        return canvas.toDataURL('image/webp', quality)
      },
      { source, quality: webpQuality },
    )
    if (!webpDataUrl.startsWith('data:image/webp')) {
      throw new Error('Browser could not encode WebP')
    }
    return Buffer.from(webpDataUrl.slice(webpDataUrl.indexOf(',') + 1), 'base64')
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
})

const summary = []

try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'load', timeout: readyTimeoutMs })
  await page.waitForFunction(() => document.documentElement.classList.contains('world-ready'), null, {
    timeout: readyTimeoutMs,
  })
  await page.addStyleTag({ content: hideInterfaceStyle })

  await mkdir(outputDir, { recursive: true })

  for (const chapterId of chapterIds) {
    await page.evaluate(centreChapter, chapterId)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(settleMs)
    const png = await page.screenshot({ type: 'png', fullPage: false })
    const webp = await encodeWebp(browser, png)
    const outputPath = join(outputDir, `${chapterId}.webp`)
    await writeFile(outputPath, webp)
    const sizeKb = (webp.length / 1024).toFixed(1)
    const budgetNote = webp.length > sizeBudgetBytes ? ' (over 120 KB budget)' : ''
    summary.push(`${chapterId}.webp ${sizeKb} KB${budgetNote}`)
  }

  await context.close()
} finally {
  await browser.close()
}

console.log(summary.join('\n'))
console.log(`Wrote ${chapterIds.length} posters to ${relative(projectRoot, outputDir)}`)
