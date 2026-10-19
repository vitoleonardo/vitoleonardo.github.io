import '@fontsource-variable/schibsted-grotesk/wght.css'
import '@fontsource-variable/schibsted-grotesk/wght-italic.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/chapters.css'
import './styles/cursor.css'
import './styles/scramble.css'
import './styles/loader.css'
import { conductorSource, createChapterFeed, viewportSource } from './dom/chapter-source'
import { initCursor } from './dom/cursor'
import { initEmailButton } from './dom/email-button'
import { initRail } from './dom/rail'
import { initReveal } from './dom/reveal'
import { initScramble } from './dom/scramble'
import { env } from './env'
import { initI18n } from './i18n'
import { initLoader } from './dom/loader'
import { createBlueprintMotif } from './dom/loader-blueprint'
import type { WorldApi } from './world'
import { initInteractions } from './world/interactions'

initI18n()

const root = document.documentElement
const sections = Array.from(document.querySelectorAll<HTMLElement>('main .chapter'))
const feed = createChapterFeed()
const loader = initLoader({ motif: createBlueprintMotif(), reducedMotion: () => env.reducedMotion, webgl: env.webgl })

initReveal({ sections, chapters: feed, splitWords: env.webgl && !env.reducedMotion })
const rail = initRail(
  feed,
  sections.map((section) => section.id),
)
initCursor()
initScramble()
initEmailButton()
const interactions = initInteractions({ sections, chapters: feed, reducedMotion: () => env.reducedMotion })
feed.connect(viewportSource(sections))
root.classList.add('dom-ready')

async function loadWorld(canvas: HTMLCanvasElement): Promise<WorldApi> {
  const { initWorld } = await import('./world')
  loader.setStage('script')
  return initWorld(canvas, { onStage: (stage) => loader.setStage(stage) })
}

async function startWorld(): Promise<void> {
  const canvas = document.getElementById('world-canvas')
  if (!(canvas instanceof HTMLCanvasElement)) return
  let world: WorldApi
  try {
    world = await loadWorld(canvas)
  } catch {
    root.classList.add('no-webgl')
    loader.fail()
    return
  }
  const { createPicker } = await import('./world/picker')
  feed.connect(conductorSource(world.conductor))
  rail.followCamera({ camera: world.camera, onFrame: (listener) => world.onFrame(listener) })
  interactions.attachWorld({
    proxies: world.proxies,
    cameraMatrix: world.camera.matrixWorld,
    onFrame: (listener) => world.onFrame(listener),
    pick: createPicker(world.camera, canvas),
    scrollToChapter: (index) => world.conductor.scrollToChapter(index),
  })
  void loader.finish()
}

if (env.webgl) void startWorld()
