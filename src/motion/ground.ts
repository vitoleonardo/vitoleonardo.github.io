import { clamp01 } from '../math'
import { tokens } from '../tokens'
import { SCENES } from './score'

const LAYER_CLASS = 'ground-layer'

export interface GroundLayers {
  set(position: number): void
  follow(sections: ReadonlyArray<HTMLElement | null>): void
  destroy(): void
}

export function sceneSections(): Array<HTMLElement | null> {
  return SCENES.map((scene) => document.getElementById(scene.id))
}

export function createGroundLayers(): GroundLayers | null {
  const host = document.getElementById('ground')
  if (!host) return null
  const layers = SCENES.map((scene, index) => {
    const layer = document.createElement('div')
    layer.className = LAYER_CLASS
    layer.dataset.ground = scene.figure
    Object.assign(layer.style, {
      position: 'absolute',
      inset: '0',
      background: tokens.ground[scene.figure],
      opacity: index === 0 ? '1' : '0',
      willChange: index === 0 ? 'auto' : 'opacity',
    })
    host.appendChild(layer)
    return layer
  })
  const applied: number[] = layers.map((_, index) => (index === 0 ? 1 : 0))
  const covered = layers.map(() => false)

  return {
    set(position) {
      const topOpaque = Math.floor(position)
      for (let index = 0; index < layers.length; index++) {
        const hidden = index < topOpaque
        if (covered[index] !== hidden) {
          covered[index] = hidden
          layers[index].style.visibility = hidden ? 'hidden' : 'visible'
        }
        if (index === 0) continue
        const opacity = clamp01(position - index + 1)
        if (Math.abs(applied[index] - opacity) < 0.002) continue
        applied[index] = opacity
        layers[index].style.opacity = opacity.toFixed(3)
      }
    },
    follow(sections) {
      const viewportHeight = window.innerHeight
      layers.forEach((layer, index) => {
        const section = sections[index]
        const rect = section?.getBoundingClientRect()
        const visible = Boolean(rect && rect.bottom > 0 && rect.top < viewportHeight && rect.height > 0)
        if (covered[index] !== !visible) {
          covered[index] = !visible
          layer.style.visibility = visible ? 'visible' : 'hidden'
        }
        if (!visible || !rect) return
        if (applied[index] !== 1) {
          applied[index] = 1
          layer.style.opacity = '1'
        }
        const top = Math.max(0, Math.round(rect.top))
        const bottom = Math.max(0, Math.round(viewportHeight - rect.bottom))
        layer.style.clipPath = `inset(${top}px 0 ${bottom}px 0)`
      })
    },
    destroy() {
      layers.forEach((layer) => layer.remove())
    },
  }
}
