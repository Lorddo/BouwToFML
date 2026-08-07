export type PolygonToolMode = 'crop-include' | 'erase' | null

export interface PolygonPoint {
  x: number
  y: number
}

/** @deprecated Alleen nog voor type-compat; crop wordt in eraser-mask gebakken. */
export interface PolygonCropRegion {
  points: PolygonPoint[]
  mode: 'include' | 'exclude'
}

export function polygonToKonvaPoints(polygon: PolygonPoint[]): number[] {
  const flat: number[] = []
  for (const p of polygon) {
    flat.push(p.x, p.y)
  }
  return flat
}

function distPoints(a: PolygonPoint, b: PolygonPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function isNearPoint(a: PolygonPoint, b: PolygonPoint, thresholdPx: number): boolean {
  return distPoints(a, b) <= thresholdPx
}

/**
 * Snelle polygon-raster via Canvas 2D (veel sneller dan per-pixel raycast in JS).
 * outside: wit buiten polygon (crop include) · inside: wit binnen polygon (gum).
 */
export function rasterizePolygonMask(params: {
  width: number
  height: number
  polygon: PolygonPoint[]
  fill: 'inside' | 'outside'
}): Uint8Array {
  const { width, height, polygon, fill } = params
  const mask = new Uint8Array(width * height)
  if (polygon.length < 3) return mask

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return mask

  ctx.fillStyle = fill === 'outside' ? '#ffffff' : '#000000'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = fill === 'outside' ? '#000000' : '#ffffff'
  ctx.beginPath()
  ctx.moveTo(polygon[0].x, polygon[0].y)
  for (let i = 1; i < polygon.length; i += 1) {
    ctx.lineTo(polygon[i].x, polygon[i].y)
  }
  ctx.closePath()
  ctx.fill()

  const data = ctx.getImageData(0, 0, width, height).data
  for (let i = 0, p = 0; i < mask.length; i += 1, p += 4) {
    if (data[p] > 127) mask[i] = 255
  }
  return mask
}

export function mergeMaskOr(dst: Uint8Array, src: Uint8Array): void {
  const n = Math.min(dst.length, src.length)
  for (let i = 0; i < n; i += 1) {
    if (src[i] > 0) dst[i] = 255
  }
}

export function maskHasInk(mask: Uint8Array): boolean {
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] > 0) return true
  }
  return false
}

export function scaleMaskToSize(
  mask: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Uint8Array {
  if (srcWidth === dstWidth && srcHeight === dstHeight) return mask
  const out = new Uint8Array(dstWidth * dstHeight)
  for (let y = 0; y < dstHeight; y += 1) {
    for (let x = 0; x < dstWidth; x += 1) {
      const sx = Math.min(srcWidth - 1, Math.round((x * srcWidth) / dstWidth))
      const sy = Math.min(srcHeight - 1, Math.round((y * srcHeight) / dstHeight))
      out[y * dstWidth + x] = mask[sy * srcWidth + sx]
    }
  }
  return out
}

/** Crop AABB from mask, then nearest-neighbour scale to destination size. */
export function cropAndScaleMask(
  mask: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  bounds: { left: number; top: number; width: number; height: number },
  dstWidth: number,
  dstHeight: number,
): Uint8Array {
  const left = Math.max(0, Math.min(srcWidth - 1, Math.floor(bounds.left)))
  const top = Math.max(0, Math.min(srcHeight - 1, Math.floor(bounds.top)))
  const width = Math.max(1, Math.min(srcWidth - left, Math.round(bounds.width)))
  const height = Math.max(1, Math.min(srcHeight - top, Math.round(bounds.height)))
  const cropped = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const srcRow = (top + y) * srcWidth + left
    cropped.set(mask.subarray(srcRow, srcRow + width), y * width)
  }
  return scaleMaskToSize(cropped, width, height, dstWidth, dstHeight)
}
