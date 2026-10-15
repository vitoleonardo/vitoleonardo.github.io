const root = document.documentElement

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const mobileQuery = window.matchMedia('(max-width: 899.98px)')

function detectWebgl(): boolean {
  try {
    const probe = document.createElement('canvas')
    return Boolean(
      window.WebGL2RenderingContext && (probe.getContext('webgl2') || probe.getContext('webgl')),
    )
  } catch {
    return false
  }
}

export const env = {
  reducedMotion: reducedMotionQuery.matches,
  webgl: detectWebgl(),
  touch: window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0,
  get mobile(): boolean {
    return mobileQuery.matches
  },
}

root.classList.add('js')
root.classList.toggle('rm', env.reducedMotion)
root.classList.toggle('touch', env.touch)
root.classList.toggle('no-webgl', !env.webgl)

reducedMotionQuery.addEventListener('change', (event) => {
  env.reducedMotion = event.matches
  root.classList.toggle('rm', event.matches)
})
