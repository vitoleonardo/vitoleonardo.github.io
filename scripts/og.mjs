import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const cardDir = join(projectRoot, 'node_modules', '.cache', 'og-card')
const outputPath = join(projectRoot, 'public', 'og.png')
const fontDir = (family) => join(projectRoot, 'node_modules', '@fontsource-variable', family, 'files')
const displayFont = join(fontDir('schibsted-grotesk'), 'schibsted-grotesk-latin-wght-normal.woff2')
const monoFont = join(fontDir('jetbrains-mono'), 'jetbrains-mono-latin-wght-normal.woff2')

const colours = {
  paper: '#ECEBE6',
  ink: '#111111',
  blue: '#1F4BFF',
  blueLight: '#6F8BFF',
  blueDeep: '#1236C8',
  blueMist: '#A9BBFF',
}

const cardHtml = (fontUrls) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: 'Schibsted Grotesk Variable';
  src: url('${fontUrls.display}') format('woff2');
  font-weight: 400 900;
  font-display: block;
}
@font-face {
  font-family: 'JetBrains Mono Variable';
  src: url('${fontUrls.mono}') format('woff2');
  font-weight: 100 800;
  font-display: block;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  width: 1200px;
  height: 630px;
  overflow: hidden;
  background: ${colours.paper};
  color: ${colours.ink};
  font-family: 'Schibsted Grotesk Variable', system-ui, sans-serif;
}
.card { position: relative; width: 1200px; height: 630px; }
.rule { position: absolute; left: 56px; right: 56px; top: 92px; height: 2px; background: ${colours.ink}; }
.name {
  position: absolute;
  left: 52px;
  top: 150px;
  margin: 0;
  font-size: 132px;
  font-weight: 800;
  line-height: 0.9;
  letter-spacing: -0.045em;
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
}
.site {
  position: absolute;
  left: 56px;
  top: 40px;
  font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
  font-size: 20px;
  letter-spacing: 0.04em;
}
.sun {
  position: absolute;
  left: 872px;
  top: 128px;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  background: radial-gradient(circle at 36% 30%, ${colours.blueLight} 0%, ${colours.blue} 58%, ${colours.blueDeep} 100%);
  box-shadow: 0 0 120px 40px rgba(31, 75, 255, 0.18);
}
.path {
  position: absolute;
  left: 989px;
  top: 388px;
  width: 22px;
  height: 260px;
  background: linear-gradient(to bottom, ${colours.blueMist}, rgba(169, 187, 255, 0.35));
}
</style>
</head>
<body>
<div class="card">
  <p class="site">vitoleonardo.github.io</p>
  <div class="rule"></div>
  <div class="sun" aria-hidden="true"></div>
  <div class="path" aria-hidden="true"></div>
  <h1 class="name"><span>Vito</span><span>Krawutschke</span></h1>
  <p class="role">Full-stack and AI engineer, Cologne</p>
</div>
</body>
</html>
`

await mkdir(cardDir, { recursive: true })
const cardPath = join(cardDir, 'index.html')
const fontUrls = {
  display: relative(cardDir, displayFont).split('\\').join('/'),
  mono: relative(cardDir, monoFont).split('\\').join('/'),
}
await writeFile(cardPath, cardHtml(fontUrls))

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
