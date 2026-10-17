import {
  CanvasTexture,
  Color,
  DataTexture,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type ColorRepresentation,
  type ColorSpace,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { createRandom } from './geometry'
import type { SharedTextures } from './types'

const concreteResolution = 1024
const blueprintResolution = 1024
const asphaltResolution = 512
const slabResolution = 1024
const concreteBase = [112, 116, 124] as const
const slabBase = [108, 108, 110] as const
const placeholderPixel = [10, 14, 23, 255] as const

const imagePaths = {
  hih: 'work/hih.webp',
  baysal: 'work/baysal.webp',
  fakhari: 'work/fakhari.webp',
  portrait: 'me/portrait.webp',
} as const

type Random = () => number

interface PixelCanvas {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  image: ImageData
}

function createPixelCanvas(size: number): PixelCanvas {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas is unavailable')
  return { canvas, context, image: context.createImageData(size, size) }
}

function canvasTexture(canvas: HTMLCanvasElement, colorSpace: ColorSpace): CanvasTexture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = colorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.needsUpdate = true
  return texture
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size
}

function tileableNoise(size: number, cells: number, random: Random): Float32Array {
  const lattice = Float32Array.from({ length: cells * cells }, random)
  const field = new Float32Array(size * size)
  const scale = cells / size
  for (let y = 0; y < size; y += 1) {
    const gridY = y * scale
    const rowStart = Math.floor(gridY)
    const blendY = gridY - rowStart
    const easeY = blendY * blendY * (3 - 2 * blendY)
    const row0 = wrap(rowStart, cells) * cells
    const row1 = wrap(rowStart + 1, cells) * cells
    for (let x = 0; x < size; x += 1) {
      const gridX = x * scale
      const columnStart = Math.floor(gridX)
      const blendX = gridX - columnStart
      const easeX = blendX * blendX * (3 - 2 * blendX)
      const column0 = wrap(columnStart, cells)
      const column1 = wrap(columnStart + 1, cells)
      const top = lattice[row0 + column0] + (lattice[row0 + column1] - lattice[row0 + column0]) * easeX
      const bottom = lattice[row1 + column0] + (lattice[row1 + column1] - lattice[row1 + column0]) * easeX
      field[y * size + x] = top + (bottom - top) * easeY
    }
  }
  return field
}

function fractalNoise(size: number, octaves: readonly (readonly [number, number])[], random: Random): Float32Array {
  const field = new Float32Array(size * size)
  const totalWeight = octaves.reduce((sum, [, weight]) => sum + weight, 0)
  for (const [cells, weight] of octaves) {
    const layer = tileableNoise(size, cells, random)
    for (let index = 0; index < field.length; index += 1) field[index] += (layer[index] * weight) / totalWeight
  }
  return field
}

function stampDisc(
  size: number,
  centerX: number,
  centerY: number,
  radius: number,
  visit: (index: number, coverage: number) => void,
): void {
  const reach = Math.ceil(radius + 1)
  for (let offsetY = -reach; offsetY <= reach; offsetY += 1) {
    for (let offsetX = -reach; offsetX <= reach; offsetX += 1) {
      const distance = Math.hypot(offsetX, offsetY)
      if (distance > radius + 1) continue
      const coverage = Math.min(1, radius + 1 - distance)
      visit(wrap(Math.round(centerY) + offsetY, size) * size + wrap(Math.round(centerX) + offsetX, size), coverage)
    }
  }
}

function smoothRamp(edgeStart: number, edgeEnd: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edgeStart) / (edgeEnd - edgeStart)))
  return t * t * (3 - 2 * t)
}

function writeNormals(height: Float32Array, size: number, strength: number, target: ImageData): void {
  for (let y = 0; y < size; y += 1) {
    const up = wrap(y - 1, size) * size
    const down = wrap(y + 1, size) * size
    const row = y * size
    for (let x = 0; x < size; x += 1) {
      const left = wrap(x - 1, size)
      const right = wrap(x + 1, size)
      const normalX = (height[row + left] - height[row + right]) * strength
      const normalY = (height[down + x] - height[up + x]) * strength
      const length = Math.hypot(normalX, normalY, 1)
      const offset = (row + x) * 4
      target.data[offset] = ((normalX / length) * 0.5 + 0.5) * 255
      target.data[offset + 1] = ((normalY / length) * 0.5 + 0.5) * 255
      target.data[offset + 2] = ((1 / length) * 0.5 + 0.5) * 255
      target.data[offset + 3] = 255
    }
  }
}

function writeGray(values: Float32Array, target: ImageData): void {
  for (let index = 0; index < values.length; index += 1) {
    const level = Math.min(255, Math.max(0, values[index] * 255))
    const offset = index * 4
    target.data[offset] = level
    target.data[offset + 1] = level
    target.data[offset + 2] = level
    target.data[offset + 3] = 255
  }
}

function createConcreteSet(size: number): SharedTextures['concrete'] {
  const random = createRandom(2026)
  const cloud = fractalNoise(size, [[4, 0.45], [9, 0.3], [24, 0.17], [96, 0.08]], random)
  const height = new Float32Array(size * size)
  const tone = new Float32Array(size * size)
  const roughness = new Float32Array(size * size)
  const panelWidth = size / 2
  const panelTone = [random() * 0.08 - 0.04, random() * 0.08 - 0.04]
  const jointWidth = 1.6

  for (let y = 0; y < size; y += 1) {
    const jointDistanceY = Math.min(y, size - y)
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x
      const grain = random() - 0.5
      const jointDistanceX = Math.min(x % panelWidth, panelWidth - (x % panelWidth))
      const jointDepth = Math.max(0, 1 - Math.min(jointDistanceX, jointDistanceY) / jointWidth)
      const panel = Math.floor(x / panelWidth)
      height[index] = cloud[index] * 0.35 + grain * 0.04 - jointDepth * 0.7
      tone[index] = 1 + (cloud[index] - 0.5) * 0.4 + grain * 0.06 + panelTone[panel] - jointDepth * 0.28
      roughness[index] = 0.84 + (cloud[index] - 0.5) * 0.14 + jointDepth * 0.08
    }
  }

  const tieColumns = [0.22, 0.78]
  const tieRows = [1 / 6, 1 / 2, 5 / 6]
  const holeRadius = 5.5
  const streakLength = 140
  for (let panel = 0; panel < 2; panel += 1) {
    for (const column of tieColumns) {
      for (const row of tieRows) {
        const holeX = panel * panelWidth + column * panelWidth
        const holeY = row * size
        stampDisc(size, holeX, holeY, holeRadius, (index, coverage) => {
          height[index] -= 0.9 * coverage
          tone[index] -= 0.45 * coverage
          roughness[index] += 0.08 * coverage
        })
        for (let offsetY = 2; offsetY < streakLength; offsetY += 1) {
          const fade = 1 - offsetY / streakLength
          for (let offsetX = -4; offsetX <= 4; offsetX += 1) {
            const index = wrap(Math.round(holeY) + offsetY, size) * size + wrap(Math.round(holeX) + offsetX, size)
            const falloff = fade * (1 - Math.abs(offsetX) / 5)
            tone[index] -= 0.07 * falloff
            roughness[index] -= 0.1 * falloff
          }
        }
      }
    }
  }

  for (let pore = 0; pore < 700; pore += 1) {
    stampDisc(size, random() * size, random() * size, 0.6 + random() * 1.6, (index, coverage) => {
      height[index] -= 0.35 * coverage
      tone[index] -= 0.22 * coverage
    })
  }

  const color = createPixelCanvas(size)
  for (let index = 0; index < tone.length; index += 1) {
    const offset = index * 4
    color.image.data[offset] = concreteBase[0] * tone[index]
    color.image.data[offset + 1] = concreteBase[1] * tone[index]
    color.image.data[offset + 2] = concreteBase[2] * tone[index]
    color.image.data[offset + 3] = 255
  }
  color.context.putImageData(color.image, 0, 0)

  const normal = createPixelCanvas(size)
  writeNormals(height, size, 2.4, normal.image)
  normal.context.putImageData(normal.image, 0, 0)

  const rough = createPixelCanvas(size)
  writeGray(roughness, rough.image)
  rough.context.putImageData(rough.image, 0, 0)

  return {
    map: canvasTexture(color.canvas, SRGBColorSpace),
    normalMap: canvasTexture(normal.canvas, NoColorSpace),
    roughnessMap: canvasTexture(rough.canvas, NoColorSpace),
  }
}

function createBlueprintTexture(size: number): CanvasTexture {
  const { canvas, context } = createPixelCanvas(size)
  const random = createRandom(1987)
  const minor = size / 32
  const major = size / 4
  context.fillStyle = '#0B1120'
  context.fillRect(0, 0, size, size)
  context.strokeStyle = 'rgba(47, 88, 255, 0.22)'
  context.lineWidth = 1
  for (let line = 0; line <= size; line += minor) {
    context.beginPath()
    context.moveTo(line + 0.5, 0)
    context.lineTo(line + 0.5, size)
    context.moveTo(0, line + 0.5)
    context.lineTo(size, line + 0.5)
    context.stroke()
  }
  context.strokeStyle = 'rgba(80, 120, 255, 0.6)'
  context.lineWidth = 2.5
  for (let line = 0; line <= size; line += major) {
    context.beginPath()
    context.moveTo(line, 0)
    context.lineTo(line, size)
    context.moveTo(0, line)
    context.lineTo(size, line)
    context.stroke()
  }
  context.strokeStyle = 'rgba(140, 170, 255, 0.55)'
  context.lineWidth = 1.5
  for (let module = 0; module < 6; module += 1) {
    const x = Math.floor(random() * 28 + 2) * minor
    const y = Math.floor(random() * 28 + 2) * minor
    const width = Math.floor(random() * 5 + 2) * minor
    const height = Math.floor(random() * 4 + 2) * minor
    context.strokeRect(x, y, width, height)
    context.beginPath()
    context.moveTo(x, y + height + minor * 0.5)
    context.lineTo(x + width, y + height + minor * 0.5)
    context.stroke()
  }
  context.fillStyle = 'rgba(160, 185, 255, 0.8)'
  for (let x = 0; x < size; x += major) {
    for (let y = 0; y < size; y += major) {
      context.fillRect(x - 6, y - 1, 12, 2)
      context.fillRect(x - 1, y - 6, 2, 12)
    }
  }
  return canvasTexture(canvas, SRGBColorSpace)
}

export function createSlabTextures(): { map: CanvasTexture; roughnessMap: CanvasTexture } {
  const size = slabResolution
  const random = createRandom(4242)
  const cloud = fractalNoise(size, [[3, 0.4], [8, 0.3], [20, 0.2], [64, 0.1]], random)
  const trowel = fractalNoise(size, [[5, 0.6], [13, 0.4]], random)
  const tone = new Float32Array(size * size)
  const roughness = new Float32Array(size * size)
  const sawCutWidth = 1.4
  for (let y = 0; y < size; y += 1) {
    const cutDistanceY = Math.min(y, size - y)
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x
      const grain = random() - 0.5
      const cut = Math.max(0, 1 - Math.min(x, size - x, cutDistanceY) / sawCutWidth)
      const sweep = Math.pow(Math.abs(Math.sin(trowel[index] * 30)), 6)
      tone[index] = 1 + (cloud[index] - 0.5) * 0.32 + grain * 0.05 - cut * 0.5
      roughness[index] = 0.66 + (cloud[index] - 0.5) * 0.18 - sweep * 0.05 + cut * 0.14
    }
  }
  for (let speck = 0; speck < 2600; speck += 1) {
    const shade = random() < 0.5 ? -0.16 : 0.12
    stampDisc(size, random() * size, random() * size, 0.4 + random() * 1.2, (index, coverage) => {
      tone[index] += shade * coverage
    })
  }
  const color = createPixelCanvas(size)
  for (let index = 0; index < tone.length; index += 1) {
    const offset = index * 4
    color.image.data[offset] = slabBase[0] * tone[index]
    color.image.data[offset + 1] = slabBase[1] * tone[index]
    color.image.data[offset + 2] = slabBase[2] * tone[index]
    color.image.data[offset + 3] = 255
  }
  color.context.putImageData(color.image, 0, 0)
  const rough = createPixelCanvas(size)
  writeGray(roughness, rough.image)
  rough.context.putImageData(rough.image, 0, 0)
  return { map: canvasTexture(color.canvas, SRGBColorSpace), roughnessMap: canvasTexture(rough.canvas, NoColorSpace) }
}

export function createWetAsphaltTextures(): { map: CanvasTexture; roughnessMap: CanvasTexture } {
  const size = asphaltResolution
  const random = createRandom(1104)
  const puddles = fractalNoise(size, [[3, 0.5], [7, 0.3], [19, 0.2]], random)
  const grit = fractalNoise(size, [[64, 0.6], [160, 0.4]], random)
  const ripples = fractalNoise(size, [[40, 0.7], [90, 0.3]], random)
  const color = createPixelCanvas(size)
  const roughness = new Float32Array(size * size)
  for (let index = 0; index < puddles.length; index += 1) {
    const standing = smoothRamp(0.5, 0.56, puddles[index])
    const damp = smoothRamp(0.4, 0.5, puddles[index])
    const speck = grit[index] - 0.5
    const level = 0.86 + speck * 0.35 - damp * 0.14 - standing * 0.16
    const offset = index * 4
    color.image.data[offset] = 22 * level
    color.image.data[offset + 1] = 25 * level
    color.image.data[offset + 2] = 31 * level
    color.image.data[offset + 3] = 255
    const dry = 0.62 + speck * 0.3
    const dampSheen = 0.3 + speck * 0.12
    const standingWater = 0.035 + (ripples[index] - 0.5) * 0.09
    roughness[index] = dry + (dampSheen - dry) * damp + (standingWater - dampSheen) * standing
  }
  color.context.putImageData(color.image, 0, 0)
  const rough = createPixelCanvas(size)
  writeGray(roughness, rough.image)
  rough.context.putImageData(rough.image, 0, 0)
  return { map: canvasTexture(color.canvas, SRGBColorSpace), roughnessMap: canvasTexture(rough.canvas, NoColorSpace) }
}

export function createGlowTexture(): CanvasTexture {
  const size = 128
  const { canvas, context } = createPixelCanvas(size)
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.45)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

export function averageTextureColor(texture: Texture, fallback: ColorRepresentation): Color {
  const image: unknown = texture.image
  const drawable = image instanceof HTMLImageElement || image instanceof HTMLCanvasElement || image instanceof ImageBitmap
  if (!drawable) return new Color(fallback)
  const sampleSize = 8
  const { context } = createPixelCanvas(sampleSize)
  context.drawImage(image, 0, 0, sampleSize, sampleSize)
  const { data } = context.getImageData(0, 0, sampleSize, sampleSize)
  const sum = [0, 0, 0]
  for (let offset = 0; offset < data.length; offset += 4) {
    sum[0] += data[offset]
    sum[1] += data[offset + 1]
    sum[2] += data[offset + 2]
  }
  const samples = sampleSize * sampleSize * 255
  return new Color().setRGB(sum[0] / samples, sum[1] / samples, sum[2] / samples, SRGBColorSpace)
}

function createPlaceholder(): DataTexture {
  const texture = new DataTexture(new Uint8Array(placeholderPixel), 1, 1)
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

async function loadColorTexture(loader: TextureLoader, path: string): Promise<Texture> {
  try {
    const texture = await loader.loadAsync(`${import.meta.env.BASE_URL}${path}`)
    texture.colorSpace = SRGBColorSpace
    return texture
  } catch {
    return createPlaceholder()
  }
}

export async function createSharedTextures(renderer: WebGLRenderer): Promise<SharedTextures> {
  const loader = new TextureLoader()
  const concrete = createConcreteSet(concreteResolution)
  const blueprint = createBlueprintTexture(blueprintResolution)
  const [hih, baysal, fakhari, portrait] = await Promise.all([
    loadColorTexture(loader, imagePaths.hih),
    loadColorTexture(loader, imagePaths.baysal),
    loadColorTexture(loader, imagePaths.fakhari),
    loadColorTexture(loader, imagePaths.portrait),
  ])
  const textures: SharedTextures = { concrete, blueprint, work: { hih, baysal, fakhari }, portrait }
  for (const texture of [concrete.map, concrete.normalMap, concrete.roughnessMap, blueprint, hih, baysal, fakhari, portrait]) {
    renderer.initTexture(texture)
  }
  return textures
}
