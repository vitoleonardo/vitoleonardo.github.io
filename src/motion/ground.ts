import { clamp01 } from '../math'
import { tokens } from '../tokens'
import { SCENES } from './score'

const LAYER_CLASS = 'ground-layer'

export interface GroundLayers {
  set(position: number): void
  destroy(): void
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
    destroy() {
      layers.forEach((layer) => layer.remove())
    },
  }
}
