import type { RefBBox } from '@/cv/refs/types'

export type BBoxBounds = { x0: number; y0: number; x1: number; y1: number }

export function clampRefBBoxToImage(bbox: RefBBox, width: number, height: number): BBoxBounds | null {
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  if (x1 <= x0 || y1 <= y0) return null
  return { x0, y0, x1, y1 }
}

export function normalizeVector(dx: number, dy: number): { x: number; y: number } | null {
  const len = Math.hypot(dx, dy)
  if (len <= 1e-6) return null
  return { x: dx / len, y: dy / len }
}
