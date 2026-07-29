import type { SemanticWallSegment } from '@/core/extraction/types'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import type { DoorOpeningAxis } from './types'
import { DOOR_WALL_SNAP_TUNING, type BBoxBounds, type DoorSide } from './door-wall-snap-tuning'

const T = DOOR_WALL_SNAP_TUNING

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function clampBounds(
  bbox: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
): BBoxBounds | null {
  const x0 = clamp(Math.floor(bbox.x), 0, width - 1)
  const y0 = clamp(Math.floor(bbox.y), 0, height - 1)
  const x1 = clamp(Math.ceil(bbox.x + bbox.width), 0, width)
  const y1 = clamp(Math.ceil(bbox.y + bbox.height), 0, height)
  if (x1 <= x0 || y1 <= y0) return null
  return { x0, y0, x1, y1 }
}

export function resolveSideMeta(side: DoorSide): {
  axis: DoorOpeningAxis
  outwardSign: -1 | 1
  normalX: -1 | 0 | 1
  normalY: -1 | 0 | 1
} {
  if (side === 'left') return { axis: 'v', outwardSign: -1, normalX: -1, normalY: 0 }
  if (side === 'right') return { axis: 'v', outwardSign: 1, normalX: 1, normalY: 0 }
  if (side === 'top') return { axis: 'h', outwardSign: -1, normalX: 0, normalY: -1 }
  return { axis: 'h', outwardSign: 1, normalX: 0, normalY: 1 }
}

export function resolveCandidateSides(bounds: BBoxBounds): DoorSide[] {
  const width = Math.max(1, bounds.x1 - bounds.x0)
  const height = Math.max(1, bounds.y1 - bounds.y0)
  const aspect = Math.max(width, height) / Math.max(1, Math.min(width, height))
  if (aspect >= T.thinBBoxRatio) {
    return width >= height ? ['top', 'bottom'] : ['left', 'right']
  }
  return ['left', 'right', 'top', 'bottom']
}

export function pointOnSegment(
  seg: SemanticWallSegment,
  tRaw: number,
): { t: number; x: number; y: number } {
  const t = clamp(tRaw, 0, 1)
  const x = seg.a.x + (seg.b.x - seg.a.x) * t
  const y = seg.a.y + (seg.b.y - seg.a.y) * t
  return { t, x, y }
}

export function closestPointOnSegment(
  point: { x: number; y: number },
  seg: SemanticWallSegment,
): { t: number; x: number; y: number } {
  const dx = seg.b.x - seg.a.x
  const dy = seg.b.y - seg.a.y
  const len2 = dx * dx + dy * dy
  if (len2 <= 1e-6) return { t: 0, x: seg.a.x, y: seg.a.y }
  const t = ((point.x - seg.a.x) * dx + (point.y - seg.a.y) * dy) / len2
  return pointOnSegment(seg, t)
}

export function segmentAxis(segment: SemanticWallSegment): DoorOpeningAxis {
  return Math.abs(segment.b.x - segment.a.x) >= Math.abs(segment.b.y - segment.a.y) ? 'h' : 'v'
}

export function sideSpan(
  bounds: BBoxBounds,
  axis: DoorOpeningAxis,
): { min: number; max: number; length: number } {
  if (axis === 'v') {
    const min = bounds.y0
    const max = bounds.y1 - 1
    return { min, max, length: Math.max(1, max - min + 1) }
  }
  const min = bounds.x0
  const max = bounds.x1 - 1
  return { min, max, length: Math.max(1, max - min + 1) }
}

export function segmentSpan(
  segment: SemanticWallSegment,
  axis: DoorOpeningAxis,
): { min: number; max: number } {
  if (axis === 'v') {
    return {
      min: Math.min(segment.a.y, segment.b.y),
      max: Math.max(segment.a.y, segment.b.y),
    }
  }
  return {
    min: Math.min(segment.a.x, segment.b.x),
    max: Math.max(segment.a.x, segment.b.x),
  }
}

export function overlapLength(aMin: number, aMax: number, bMin: number, bMax: number): number {
  return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin))
}

export function resolveMaxSnapPx(params: {
  referenceWallThicknessPx?: number
  segmentThicknessPxMax: number
  doorDepthPx: number
  sideProximityPx?: number
}): number {
  const ref = params.referenceWallThicknessPx ?? 0
  const thickness = Math.max(1, params.segmentThicknessPxMax, ref)
  const proximity = Number.isFinite(params.sideProximityPx ?? Number.POSITIVE_INFINITY)
    ? Math.max(0, params.sideProximityPx ?? 0)
    : 0
  return Math.max(
    T.maxSnapFloorPx,
    Math.round(
      thickness * T.maxSnapThicknessFactor +
        Math.max(0, params.doorDepthPx) * T.maxSnapDoorDepthFactor +
        proximity * T.maxSnapProximityFactor,
    ),
  )
}

export function isMaskInk(mask: Uint8Array, width: number, x: number, y: number): boolean {
  return (mask[y * width + x] ?? 0) >= T.maskInkThreshold
}

export function distanceToWallInNormal(params: {
  wallMask: Uint8Array
  width: number
  height: number
  startX: number
  startY: number
  normalX: -1 | 0 | 1
  normalY: -1 | 0 | 1
  maxSteps: number
}): number {
  for (let step = 1; step <= params.maxSteps; step += 1) {
    const x = params.startX + params.normalX * step
    const y = params.startY + params.normalY * step
    if (x < 0 || x >= params.width || y < 0 || y >= params.height) break
    if (isMaskInk(params.wallMask, params.width, x, y)) return step
  }
  return Number.POSITIVE_INFINITY
}

export function bboxContainsDoorFacePixel(params: {
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  faceSet: Set<number>
  bounds: BBoxBounds
}): boolean {
  for (let y = params.bounds.y0; y < params.bounds.y1; y += 1) {
    for (let x = params.bounds.x0; x < params.bounds.x1; x += 1) {
      const label = params.labelsData[y * params.width + x] ?? 0
      if (label <= 0) continue
      // Deur-faceIds komen uit Stage-2 ná enclosed-detach (ruwe CC-labels).
      // Snap krijgt vaak de ORIGINELE parentMap (micro-merge): label 198 → root 14.
      // Match daarom én raw label én merged root — anders unbound ondanks L10-segment.
      if (params.faceSet.has(label)) return true
      const root = resolveMergedLabel(label, params.parentMap)
      if (params.faceSet.has(root)) return true
    }
  }
  return false
}

export function expandBounds(
  bounds: BBoxBounds,
  marginPx: number,
  width: number,
  height: number,
): BBoxBounds {
  const margin = Math.max(0, Math.round(marginPx))
  return {
    x0: clamp(bounds.x0 - margin, 0, width - 1),
    y0: clamp(bounds.y0 - margin, 0, height - 1),
    x1: clamp(bounds.x1 + margin, 0, width),
    y1: clamp(bounds.y1 + margin, 0, height),
  }
}
