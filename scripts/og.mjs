import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const cardDir = join(projectRoot, 'node_modules', '.cache', 'og-card')
const outputPath = join(projectRoot, 'public', 'og.png')
const heroStillPath = join(projectRoot, 'public', 'posters', 'hero.webp')
const fontDir = (family) => join(projectRoot, 'node_modules', '@fontsource-variable', family, 'files')
const displayFont = join(fontDir('schibsted-grotesk'), 'schibsted-grotesk-latin-wght-normal.woff2')
const monoFont = join(fontDir('jetbrains-mono'), 'jetbrains-mono-latin-wght-normal.woff2')

const colours = {
  night: '#0A0E17',
  readable: '#E9E5DB',
  practical: '#FFB25E',
  dawn: '#F4C9A0',
}

const cardHtml = (assetUrls) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: 'Schibsted Grotesk Variable';
  src: url('${assetUrls.display}') format('woff2');
  font-weight: 400 900;
  font-display: block;
}
@font-face {
  font-family: 'JetBrains Mono Variable';
  src: url('${assetUrls.mono}') format('woff2');
  font-weight: 100 800;
  font-display: block;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  width: 1200px;
  height: 630px;
  overflow: hidden;
  background: ${colours.night};
  color: ${colours.readable};
  font-family: 'Schibsted Grotesk Variable', system-ui, sans-serif;
}
.card { position: relative; width: 1200px; height: 630px; overflow: hidden; }
.still {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 62%;
}
.shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(10, 14, 23, 0.94) 0%,
    rgba(10, 14, 23, 0.7) 44%,
    rgba(10, 14, 23, 0.12) 100%
  );
}
.site {
  position: absolute;
  left: 56px;
  top: 44px;
  margin: 0;
  font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
  font-size: 20px;
  letter-spacing: 0.04em;
  color: ${colours.dawn};
}
.rule {
  position: absolute;
  left: 56px;
  top: 92px;
  width: 120px;
  height: 2px;
  background: ${colours.practical};
}
.name {
  position: absolute;
  left: 52px;
  top: 166px;
  margin: 0;
  font-size: 132px;
  font-weight: 800;
  line-height: 0.9;
  letter-spacing: -0.045em;
  color: ${colours.readable};
}
.name span { display: block; }
.role {
  position: absolute;
  left: 56px;
  bottom: 84px;
  margin: 0;
  font-size: 40px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: ${colours.practical};
}
</style>
</head>
<body>
<div class="card">
  <img class="still" src="${assetUrls.heroStill}" alt="">
  <div class="shade" aria-hidden="true"></div>
  <p class="site">vitoleonardo.github.io</p>
  <div class="rule" aria-hidden="true"></div>
  <h1 class="name"><span>Vito</span><span>Krawutschke</span></h1>
  <p class="role">Full-stack and AI engineer, Cologne</p>
</div>
</body>
</html>
`

await mkdir(cardDir, { recursive: true })
const cardPath = join(cardDir, 'index.html')
const assetUrls = {
  display: relative(cardDir, displayFont).split('\\').join('/'),
  mono: relative(cardDir, monoFont).split('\\').join('/'),
  heroStill: relative(cardDir, heroStillPath).split('\\').join('/'),
}
await writeFile(cardPath, cardHtml(assetUrls))

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await context.route('**/*', (route) =>
    route.request().url().startsWith('file:') ? route.continue() : route.abort(),
  )
  const page = await context.newPage()
  await page.goto(pathToFileURL(cardPath).href, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } })
  await context.close()
} finally {
  await browser.close()
}

console.log(`Wrote ${relative(projectRoot, outputPath)}`)
