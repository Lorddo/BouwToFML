import type { PolygonPoint } from './polygon'
import { mergeMaskOr, rasterizePolygonMask } from './polygon'

export interface EraserStrokePoint {
  x: number
  y: number
}

export function createEraserMask(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height)
}

export function applyBrushStroke(params: {
  mask: Uint8Array
  width: number
  height: number
  points: EraserStrokePoint[]
  radius: number
}): void {
  const { mask, width, height, points, radius } = params
  if (points.length === 0) return
  const r = Math.max(1, Math.round(radius))
  const rr = r * r
  // Stap ≤ radius/2 zodat snelle muisbewegingen geen losse stippen laten.
  const step = Math.max(1, r * 0.5)

  function stamp(cx: number, cy: number): void {
    const minY = Math.max(0, cy - r)
    const maxY = Math.min(height - 1, cy + r)
    const minX = Math.max(0, cx - r)
    const maxX = Math.min(width - 1, cx + r)
    for (let y = minY; y <= maxY; y += 1) {
      const row = y * width
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy <= rr) {
          mask[row + x] = 255
        }
      }
    }
  }

  let prev = points[0]!
  stamp(Math.round(prev.x), Math.round(prev.y))
  for (let i = 1; i < points.length; i += 1) {
    const next = points[i]!
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const dist = Math.hypot(dx, dy)
    if (dist < 1e-6) {
      prev = next
      continue
    }
    const samples = Math.max(1, Math.ceil(dist / step))
    for (let s = 1; s <= samples; s += 1) {
      const t = s / samples
      stamp(Math.round(prev.x + dx * t), Math.round(prev.y + dy * t))
    }
    prev = next
  }
}

/** Crop include: buiten polygon wit in mask. */
export function applyIncludeCropToMask(params: {
  mask: Uint8Array
  width: number
  height: number
  polygon: PolygonPoint[]
}): void {
  const patch = rasterizePolygonMask({
    width: params.width,
    height: params.height,
    polygon: params.polygon,
    fill: 'outside',
  })
  mergeMaskOr(params.mask, patch)
}

/** OCR/tekstvakken wit in mask (zelfde conventie als gum). */
export function applyRectRegionsToMask(params: {
  mask: Uint8Array
  width: number
  height: number
  regions: Array<{ x: number; y: number; width: number; height: number }>
  padding?: number
}): void {
  const pad = params.padding ?? 2
  const { mask, width, height } = params
  for (const region of params.regions) {
    const x0 = Math.max(0, Math.floor(region.x - pad))
    const y0 = Math.max(0, Math.floor(region.y - pad))
    const x1 = Math.min(width - 1, Math.ceil(region.x + region.width + pad))
    const y1 = Math.min(height - 1, Math.ceil(region.y + region.height + pad))
    for (let y = y0; y <= y1; y += 1) {
      const row = y * width
      for (let x = x0; x <= x1; x += 1) {
        mask[row + x] = 255
      }
    }
  }
}

/** Gum polygon: binnen polygon wit in mask. */
export function applyPolygonErase(params: {
  mask: Uint8Array
  width: number
  height: number
  polygon: PolygonPoint[]
}): void {
  const patch = rasterizePolygonMask({
    width: params.width,
    height: params.height,
    polygon: params.polygon,
    fill: 'inside',
  })
  mergeMaskOr(params.mask, patch)
}
