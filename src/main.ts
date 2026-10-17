import '@fontsource-variable/schibsted-grotesk/wght.css'
import '@fontsource-variable/schibsted-grotesk/wght-italic.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/chapters.css'
import { env } from './env'
import { initI18n } from './i18n'

initI18n()

function startWorld(): void {
  const canvas = document.getElementById('world-canvas')
  if (!(canvas instanceof HTMLCanvasElement)) return
  import('./world')
    .then((module) => module.initWorld(canvas))
    .catch(() => {
      document.documentElement.classList.add('no-webgl')
    })
}

if (env.webgl) startWorld()
