import '@fontsource-variable/schibsted-grotesk/wght.css'
import '@fontsource-variable/schibsted-grotesk/wght-italic.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/sections.css'
import { env } from './env'
import { resolvePath } from './path-bridge'
import { initI18n } from './i18n'

initI18n()

const LARGEST_PAINT_SETTLE_MS = 300
const LARGEST_PAINT_LIMIT_MS = 1500

function afterLargestPaint(callback: () => void): void {
  let started = false
  const begin = (): void => {
    if (started) return
    started = true
    callback()
  }
  try {
    const observer = new PerformanceObserver(() => {
      observer.disconnect()
      window.setTimeout(begin, LARGEST_PAINT_SETTLE_MS)
    })
    observer.observe({ type: 'largest-contentful-paint', buffered: true })
  } catch {
    begin()
    return
  }
  window.setTimeout(begin, LARGEST_PAINT_LIMIT_MS)
}

const startMotion = (): void => {
  void import('./motion').then((module) => module.initMotion())
}

if (env.mobile) afterLargestPaint(startMotion)
else startMotion()

function startPath(): void {
  const canvas = document.getElementById('path-canvas')
  if (!(canvas instanceof HTMLCanvasElement)) {
    resolvePath(null)
    return
  }
  import('./three')
    .then((module) => module.initPath(canvas))
    .then((api) => resolvePath(api))
    .catch(() => {
      document.documentElement.classList.add('no-webgl')
      resolvePath(null)
    })
}

const MOBILE_PATH_IDLE_TIMEOUT_MS = 2500

function afterLoadAndIdle(callback: () => void): void {
  const whenIdle = (): void => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => callback(), { timeout: MOBILE_PATH_IDLE_TIMEOUT_MS })
    else requestAnimationFrame(() => callback())
  }
  if (document.readyState === 'complete') whenIdle()
  else window.addEventListener('load', whenIdle, { once: true })
}

if (env.webgl && !env.reducedMotion) {
  if (env.mobile) afterLargestPaint(() => afterLoadAndIdle(startPath))
  else startPath()
} else {
  resolvePath(null)
}
