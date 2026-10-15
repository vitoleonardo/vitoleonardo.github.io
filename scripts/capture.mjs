import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(projectRoot, 'public', 'work')
const bundleDir = process.env.CAPTURE_BUNDLES ?? join(projectRoot, '..', 'portfolio-html')
const viewport = { width: 1440, height: 900 }
const webpQuality = 0.8
const settleMs = 2500
const pageTimeoutMs = 60_000

const targets = [
  {
    fileName: 'hih.webp',
    label: 'Hand in Hand mit Gambia e. V.',
    remoteUrl: 'https://hih-gambia-preview.pages.dev/',
    bundleName: 'hih-gambia-handgemacht.html',
  },
  {
    fileName: 'baysal.webp',
    label: 'Praxis Baysal',
    remoteUrl: 'https://praxis-baysal-preview.pages.dev/',
    bundleName: 'pelin.html',
  },
  {
    fileName: 'fakhari.webp',
    label: 'Frauenarztpraxis Dr. Fakhari',
    remoteUrl: 'https://drfakhari-preview.pages.dev/',
    bundleName: 'drfakhari.html',
  },
]

const user = process.env.CAPTURE_USER
const pass = process.env.CAPTURE_PASS
const useRemote = Boolean(user && pass)

const isLocalScheme = (url) => url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:')

const placeholderHtml = (fileName, label) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
html,body{margin:0;width:${viewport.width}px;height:${viewport.height}px;background:#E7E1D8;font-family:system-ui,sans-serif;color:#4A4037}
main{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
p{margin:0;font-size:28px}
small{font-size:18px;letter-spacing:0.14em;text-transform:uppercase;color:#6B5E52}
</style></head><body><main>
<p>${fileName}</p>
<small>Placeholder, ${label}</small>
</main></body></html>`

const toWebpBuffer = async (browser, pngBuffer) => {
  const context = await browser.newContext({ viewport: { width: 16, height: 16 } })
  const page = await context.newPage()
  try {
    const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`
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
      { source: dataUrl, quality: webpQuality },
    )
    const encoded = webpDataUrl.slice(webpDataUrl.indexOf(',') + 1)
    if (!webpDataUrl.startsWith('data:image/webp')) {
      throw new Error('Browser could not encode WebP')
    }
    return Buffer.from(encoded, 'base64')
  } finally {
    await context.close()
  }
}

const screenshotPage = async (page) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(settleMs)
  return page.screenshot({ type: 'png', fullPage: false })
}

const captureRemote = async (context, url) => {
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'load', timeout: pageTimeoutMs })
    return await screenshotPage(page)
  } finally {
    await page.close()
  }
}

const captureBundle = async (context, bundlePath) => {
  const page = await context.newPage()
  try {
    await page.goto(pathToFileURL(bundlePath).href, { waitUntil: 'load', timeout: pageTimeoutMs })
    return await screenshotPage(page)
  } finally {
    await page.close()
  }
}

const renderPlaceholder = async (browser, target) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  try {
    await page.setContent(placeholderHtml(target.fileName, target.label), { waitUntil: 'load' })
    return await page.screenshot({ type: 'png' })
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch()
const contextOptions = {
  viewport,
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
}

const captureContext = await browser.newContext(
  useRemote ? { ...contextOptions, httpCredentials: { username: user, password: pass } } : contextOptions,
)

if (!useRemote) {
  await captureContext.route('**/*', (route) =>
    isLocalScheme(route.request().url()) ? route.continue() : route.abort(),
  )
}

const summary = []

for (const target of targets) {
  const bundlePath = join(bundleDir, target.bundleName)
  const outputPath = join(outputDir, target.fileName)
  let source = useRemote ? 'remote' : 'bundle'
  try {
    let png
    if (useRemote) {
      png = await captureRemote(captureContext, target.remoteUrl)
    } else {
      if (!existsSync(bundlePath)) {
        throw new Error(`Bundle missing: ${target.bundleName}`)
      }
      png = await captureBundle(captureContext, bundlePath)
    }
    await mkdir(outputDir, { recursive: true })
    await writeFile(outputPath, await toWebpBuffer(browser, png))
  } catch (error) {
    source = 'placeholder'
    const png = await renderPlaceholder(browser, target)
    await mkdir(outputDir, { recursive: true })
    await writeFile(outputPath, await toWebpBuffer(browser, png))
    console.error(`Capture failed for ${target.fileName}: ${error.message}`)
  }
  summary.push(`${target.fileName}: ${source}`)
}

await captureContext.close()
await browser.close()

console.log(summary.join('\n'))
