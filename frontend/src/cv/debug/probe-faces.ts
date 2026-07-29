import {
  resolvePixelClassification,
  type RoomClassificationGroupBy,
  type RoomRasterClass,
} from '@/cv/walls/rooms/room-ink-classify'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import type { ProbePoint, ProbeRegion } from './probe-at-point'

export type ProbeFaceSource = {
  width: number
  height: number
  labelsData: Int32Array
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  classificationGroupBy?: RoomClassificationGroupBy
}

export type ProbeFaceHit = {
  faceId: number
  rawLabel: number
  className: RoomRasterClass
  pixelCount: number
  /** AABB van de geraakte pixels binnen het sample (punt = 1×1). */
  bbox: { x: number; y: number; width: number; height: number }
}

const DEFAULT_MAX_FACES = 12

function clampRegion(region: ProbeRegion, width: number, height: number): ProbeRegion | null {
  const x0 = Math.max(0, Math.floor(region.x))
  const y0 = Math.max(0, Math.floor(region.y))
  const x1 = Math.min(width, Math.ceil(region.x + region.width))
  const y1 = Math.min(height, Math.ceil(region.y + region.height))
  if (x1 <= x0 || y1 <= y0) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

function resolveHit(
  source: ProbeFaceSource,
  rawLabel: number,
): { faceId: number; className: RoomRasterClass } | null {
  if (rawLabel <= 0) return null
  const faceId = resolveMergedLabel(rawLabel, source.parentMap)
  const className = resolvePixelClassification(
    rawLabel,
    source.parentMap,
    source.classificationByLabel,
    source.classificationGroupBy ?? 'merged',
  )
  return { faceId, className }
}

/**
 * Face onder één plan-pixel (merged root + class uit roomClassifyState).
 */
export function probeFaceAtPoint(source: ProbeFaceSource, point: ProbePoint): ProbeFaceHit | null {
  const x = Math.round(point.x)
  const y = Math.round(point.y)
  if (x < 0 || y < 0 || x >= source.width || y >= source.height) return null
  const rawLabel = source.labelsData[y * source.width + x] ?? 0
  const resolved = resolveHit(source, rawLabel)
  if (!resolved) return null
  return {
    faceId: resolved.faceId,
    rawLabel,
    className: resolved.className,
    pixelCount: 1,
    bbox: { x, y, width: 1, height: 1 },
  }
}

type Acc = {
  faceId: number
  rawLabel: number
  className: RoomRasterClass
  pixelCount: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Unieke faces in een gebied, gesorteerd op pixelCount (hoog→laag).
 * `bbox` = AABB van geraakte pixels *binnen het gebied* (niet per se volle face).
 */
export function probeFacesInRegion(
  source: ProbeFaceSource,
  region: ProbeRegion,
  options?: { maxFaces?: number },
): ProbeFaceHit[] {
  const clipped = clampRegion(region, source.width, source.height)
  if (!clipped) return []
  const maxFaces = options?.maxFaces ?? DEFAULT_MAX_FACES
  const byRoot = new Map<number, Acc>()

  for (let y = clipped.y; y < clipped.y + clipped.height; y += 1) {
    const row = y * source.width
    for (let x = clipped.x; x < clipped.x + clipped.width; x += 1) {
      const rawLabel = source.labelsData[row + x] ?? 0
      const resolved = resolveHit(source, rawLabel)
      if (!resolved) continue
      const existing = byRoot.get(resolved.faceId)
      if (!existing) {
        byRoot.set(resolved.faceId, {
          faceId: resolved.faceId,
          rawLabel,
          className: resolved.className,
          pixelCount: 1,
          minX: x,
          minY: y,
          maxX: x,
          maxY: y,
        })
        continue
      }
      existing.pixelCount += 1
      if (x < existing.minX) existing.minX = x
      if (y < existing.minY) existing.minY = y
      if (x > existing.maxX) existing.maxX = x
      if (y > existing.maxY) existing.maxY = y
    }
  }

  return [...byRoot.values()]
    .sort((a, b) => b.pixelCount - a.pixelCount || a.faceId - b.faceId)
    .slice(0, maxFaces)
    .map((row) => ({
      faceId: row.faceId,
      rawLabel: row.rawLabel,
      className: row.className,
      pixelCount: row.pixelCount,
      bbox: {
        x: row.minX,
        y: row.minY,
        width: row.maxX - row.minX + 1,
        height: row.maxY - row.minY + 1,
      },
    }))
}
