/**
 * Slicer: soft-snap van P↔M-offset op voorkeursafstand + offsets van andere slices.
 * Ook P-as-align met andere P-punten (zelfde place-lijn).
 */
import type { BtfSlice } from './btf-slices'
import type { Point2D } from './types'

/** Soft zone rond een offset-target (cm). */
export const SLICE_OFFSET_SOFT_SNAP_CM = 15

export const DEFAULT_SLICER_OFFSET_SNAP_CM = 50

function uniqueSorted(values: number[], mergeCm = 0.5): number[] {
  const sorted = [...values].filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return []
  const out: number[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - out[out.length - 1] > mergeCm) out.push(sorted[i])
  }
  return out
}

/** Voorkeur + |P−M| van andere slices. */
export function collectSliceOffsetTargetsCm(
  slices: ReadonlyArray<BtfSlice>,
  preferredCm: number,
  excludeIndex = -1,
): number[] {
  const targets: number[] = []
  if (Number.isFinite(preferredCm) && preferredCm > 0) targets.push(preferredCm)
  for (let i = 0; i < slices.length; i += 1) {
    if (i === excludeIndex) continue
    const s = slices[i]
    const d = Math.hypot(s.p.x - s.m.x, s.p.y - s.m.y)
    if (d >= 1) targets.push(d)
  }
  return uniqueSorted(targets)
}

function nearestTarget(dist: number, targets: number[], softCm: number): number | null {
  let best: number | null = null
  let bestDelta = softCm
  for (const t of targets) {
    const d = Math.abs(dist - t)
    if (d < bestDelta) {
      bestDelta = d
      best = t
    }
  }
  return best
}

/**
 * Schaal `point` t.o.v. `anchor` zodat |point−anchor| op een target landt (binnen softCm).
 */
export function snapPointToOffsetDistance(
  anchor: Point2D,
  point: Point2D,
  targets: number[],
  softCm = SLICE_OFFSET_SOFT_SNAP_CM,
): Point2D {
  const dx = point.x - anchor.x
  const dy = point.y - anchor.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1e-6 || targets.length === 0) return point
  const hit = nearestTarget(dist, targets, softCm)
  if (hit == null) return point
  const s = hit / dist
  return { x: anchor.x + dx * s, y: anchor.y + dy * s }
}

/**
 * Soft-align X/Y van `point` met andere P-punten (zelfde place-offset-lijn).
 * Orthogonaal: X en Y onafhankelijk.
 */
export function snapPointToOtherPCoords(
  point: Point2D,
  otherPs: ReadonlyArray<Point2D>,
  softCm = SLICE_OFFSET_SOFT_SNAP_CM,
): Point2D {
  if (otherPs.length === 0 || softCm <= 0) return point
  let bestX = point.x
  let bestY = point.y
  let bestDx = softCm
  let bestDy = softCm
  for (const p of otherPs) {
    const dx = Math.abs(point.x - p.x)
    if (dx < bestDx) {
      bestDx = dx
      bestX = p.x
    }
    const dy = Math.abs(point.y - p.y)
    if (dy < bestDy) {
      bestDy = dy
      bestY = p.y
    }
  }
  return {
    x: bestDx < softCm ? bestX : point.x,
    y: bestDy < softCm ? bestY : point.y,
  }
}

/**
 * Volledige offset-snap voor een te verplaatsen punt t.o.v. de andere handle.
 * Volgorde: afstand → P-coord align (alleen als `snapPCoords`).
 */
export function snapSlicerOffsetPoint(args: {
  anchor: Point2D
  point: Point2D
  slices: ReadonlyArray<BtfSlice>
  preferredCm: number
  excludeIndex?: number
  softCm?: number
  /** Align met andere P's (bij slepen van P of tekenen vanaf P). */
  snapPCoords?: boolean
}): Point2D {
  const soft = args.softCm ?? SLICE_OFFSET_SOFT_SNAP_CM
  const exclude = args.excludeIndex ?? -1
  const targets = collectSliceOffsetTargetsCm(args.slices, args.preferredCm, exclude)
  let point = snapPointToOffsetDistance(args.anchor, args.point, targets, soft)
  if (args.snapPCoords) {
    const otherPs = args.slices.filter((_, i) => i !== exclude).map((s) => s.p)
    point = snapPointToOtherPCoords(point, otherPs, soft)
    // Na P-align opnieuw afstand (kan iets verschuiven)
    point = snapPointToOffsetDistance(args.anchor, point, targets, soft)
  }
  return point
}
