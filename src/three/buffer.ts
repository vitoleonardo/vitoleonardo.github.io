export interface BufferSize {
  width: number
  height: number
  pixelRatio: number
}

export const NO_BUFFER: BufferSize = { width: 0, height: 0, pixelRatio: 0 }

export function resizedBuffer(current: BufferSize, width: number, height: number, devicePixelRatio: number, maxPixelRatio: number): BufferSize | null {
  const pixelRatio = Math.min(devicePixelRatio || 1, maxPixelRatio)
  if (width === current.width && height === current.height && pixelRatio === current.pixelRatio) return null
  return { width, height, pixelRatio }
}
