import type { RefBBox } from './types'

const INK_THRESHOLD = 128

export function findInkBounds(data: Uint8Array, width: number, height: number, padPx = 0): RefBBox | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[y * width + x] ?? 255) >= INK_THRESHOLD) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX || maxY < minY) return null
  const x0 = Math.max(0, minX - padPx)
  const y0 = Math.max(0, minY - padPx)
  const x1 = Math.min(width - 1, maxX + padPx)
  const y1 = Math.min(height - 1, maxY + padPx)
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}
