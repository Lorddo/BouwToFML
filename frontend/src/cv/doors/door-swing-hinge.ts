import type { OpenCV } from '@/cv/loadOpenCV'
import { approxContoursFromMask } from '@/cv/refs/ref-face-contour'
import {
  hasArcLikeContour,
  resolveSwingHingeFromPolygon,
  type SwingHingeAxis,
  type SwingHingeOptions,
} from '@/cv/refs/ref-swing-hinge'
import type { RefBBox, RefPoint } from '@/cv/refs/types'
import { clampRefBBoxToImage } from './door-geometry-utils'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'

export interface DoorSwingHingeResult {
  hingePx: RefPoint
  axes: [SwingHingeAxis, SwingHingeAxis]
  swingAngleDeg: number
  /** Maatvoering uit draaiboog-vlak (max face-AABB), niet uit scharnier-assen. */
  swingSpanPx: number
  sectorPolygon: RefPoint[]
  supportScore: number
}

/**
 * Deurmaat uit het sector-vlak: strakke AABB van witte mask-pixels → max(w,h).
 * Scharnier-assen variëren te veel voor maatvoering; het vlak is stabieler.
 */
function measureSwingSpanPxFromFaceMask(params: {
  maskData: Uint8Array
  width: number
  height: number
}): number {
  let minX = params.width
  let minY = params.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < params.height; y += 1) {
    for (let x = 0; x < params.width; x += 1) {
      if ((params.maskData[y * params.width + x] ?? 0) < 128) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX || maxY < minY) return 0
  return Math.max(maxX - minX + 1, maxY - minY + 1)
}

/** Zelfde meetmethode als mask: max zijde van de face-/unie-bbox. */
export function measureSwingSpanPxFromFaceBBox(bbox: {
  width: number
  height: number
}): number {
  return Math.max(1, bbox.width, bbox.height)
}

export function computeDoorHingeFromMask(params: {
  cv: OpenCV
  maskData: Uint8Array
  width: number
  height: number
  offsetX?: number
  offsetY?: number
  options?: SwingHingeOptions
}): DoorSwingHingeResult | null {
  if (params.width <= 0 || params.height <= 0) return null
  if (params.maskData.length < params.width * params.height) return null
  const offsetX = params.offsetX ?? 0
  const offsetY = params.offsetY ?? 0
  // Maatvoering uit het vlak — één keer, onafhankelijk van welk scharnier wint.
  const swingSpanPx = measureSwingSpanPxFromFaceMask({
    maskData: params.maskData,
    width: params.width,
    height: params.height,
  })
  if (!(swingSpanPx > 0)) return null
  const polygons = approxContoursFromMask({
    cv: params.cv,
    maskData: params.maskData,
    width: params.width,
    height: params.height,
    epsilonFactor: 0.0025,
  })
  let best: DoorSwingHingeResult | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const polygon of polygons) {
    if (polygon.length < 3) continue
    const globalPolygon = polygon.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY }))
    if (!hasArcLikeContour(globalPolygon)) continue
    const resolved = resolveSwingHingeFromPolygon({
      polygon: globalPolygon,
      options: params.options,
    })
    if (!resolved) continue
    // Gebalanceerde radii prefereren (zelfde idee als pickBestAxes).
    const balance = Math.min(resolved.axes[0].supportLength, resolved.axes[1].supportLength)
    const supportScore = balance * 2 + resolved.axes[0].supportLength + resolved.axes[1].supportLength
    if (supportScore < bestScore) continue
    bestScore = supportScore
    best = {
      hingePx: resolved.hinge,
      axes: resolved.axes,
      swingAngleDeg: resolved.angleDeg,
      swingSpanPx,
      sectorPolygon: resolved.sectorPolygon,
      supportScore,
    }
  }
  return best
}

export function computeDoorHingeFromFaces(params: {
  cv: OpenCV
  labelsData: Int32Array
  parentMap: Map<number, number>
  width: number
  height: number
  faceIds: number[]
  bbox: RefBBox
  options?: SwingHingeOptions
}): DoorSwingHingeResult | null {
  const bounds = clampRefBBoxToImage(params.bbox, params.width, params.height)
  if (!bounds) return null
  const faceSet = new Set(params.faceIds.filter((id) => id > 0))
  if (faceSet.size <= 0) return null
  const cropWidth = bounds.x1 - bounds.x0
  const cropHeight = bounds.y1 - bounds.y0
  const maskData = new Uint8Array(cropWidth * cropHeight)
  let filled = 0
  for (let y = bounds.y0; y < bounds.y1; y += 1) {
    for (let x = bounds.x0; x < bounds.x1; x += 1) {
      const label = params.labelsData[y * params.width + x] ?? 0
      if (label <= 0) continue
      const root = resolveMergedLabel(label, params.parentMap)
      if (!faceSet.has(root)) continue
      maskData[(y - bounds.y0) * cropWidth + (x - bounds.x0)] = 255
      filled += 1
    }
  }
  if (filled <= 0) return null
  return computeDoorHingeFromMask({
    cv: params.cv,
    maskData,
    width: cropWidth,
    height: cropHeight,
    offsetX: bounds.x0,
    offsetY: bounds.y0,
    options: params.options,
  })
}
