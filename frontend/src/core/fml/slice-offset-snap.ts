/**
 * Slicer: P↔P via canvas-brede/hoge verboden stroken.
 * Place-lijn verticaal (offset in X) → strook over hele hoogte op P.x.
 * Place-lijn horizontaal (offset in Y) → strook over hele breedte op P.y.
 * P↔M van één slice blijft vrij.
 */
import type { BtfSlice } from './btf-slices'
import type { Point2D } from './types'

/** Soft zone rond de strookrand (cm). */
export const SLICE_OFFSET_SOFT_SNAP_CM = 15

export const DEFAULT_SLICER_OFFSET_SNAP_CM = 50

/** 'x' = verticale place-lijn (strook canvas-hoog); 'y' = horizontale place-lijn. */
export type SlicePlaceStripAxis = 'x' | 'y'

/** Offset-as P−M bepaalt place-strook. */
export function slicePlaceStripAxis(slice: Pick<BtfSlice, 'm' | 'p'>): SlicePlaceStripAxis | null {
  const dx = Math.abs(slice.p.x - slice.m.x)
  const dy = Math.abs(slice.p.y - slice.m.y)
  if (dx < 1e-6 && dy < 1e-6) return null
  return dx >= dy ? 'x' : 'y'
}

/**
 * Houd `value` buiten verboden stroken rond `centers` (breedte 2×preferred),
 * soft-snap naar ±preferred vanaf elk centrum.
 */
export function snapCoordAwayFromStrips(
  value: number,
  centers: ReadonlyArray<number>,
  preferredCm: number,
  softCm = SLICE_OFFSET_SOFT_SNAP_CM,
): number {
  if (centers.length === 0 || !(preferredCm > 0)) return value
  let v = value
  // Meerdere passes: overlapping stroken
  for (let pass = 0; pass < centers.length + 2; pass += 1) {
    let changed = false
    for (const c of centers) {
      const d = v - c
      const abs = Math.abs(d)
      if (abs < preferredCm) {
        // Binnen verboden strook (hele canvas-as) → naar rand
        const sign = abs < 1e-9 ? 1 : Math.sign(d)
        v = c + sign * preferredCm
        changed = true
      } else if (Math.abs(abs - preferredCm) < softCm) {
        const sign = Math.sign(d)
        v = c + sign * preferredCm
        changed = true
      }
    }
    if (!changed) break
  }
  return v
}

function collectStripCenters(
  slices: ReadonlyArray<BtfSlice>,
  excludeIndex: number,
  forceAxis: SlicePlaceStripAxis | null | undefined,
): { x: number[]; y: number[] } {
  const x: number[] = []
  const y: number[] = []
  for (let i = 0; i < slices.length; i += 1) {
    if (i === excludeIndex) continue
    const axis = slicePlaceStripAxis(slices[i])
    if (forceAxis) {
      // Alleen stroken die bij onze place-richting horen
      if (axis != null && axis !== forceAxis) continue
      if (forceAxis === 'x') x.push(slices[i].p.x)
      else y.push(slices[i].p.y)
      continue
    }
    if (axis === 'x') x.push(slices[i].p.x)
    else if (axis === 'y') y.push(slices[i].p.y)
    else {
      x.push(slices[i].p.x)
      y.push(slices[i].p.y)
    }
  }
  return { x, y }
}

/**
 * Soft-snap P t.o.v. andere linialen als oneindige stroken.
 * @param forceAxis eigen place-as (edit); null = per andere slice.
 */
export function snapPToOtherPOffsets(
  point: Point2D,
  slices: ReadonlyArray<BtfSlice>,
  preferredCm: number,
  opts?: {
    excludeIndex?: number
    softCm?: number
    forceAxis?: SlicePlaceStripAxis | null
  },
): Point2D {
  if (!(preferredCm > 0) || slices.length === 0) return point
  const soft = opts?.softCm ?? SLICE_OFFSET_SOFT_SNAP_CM
  const exclude = opts?.excludeIndex ?? -1
  const { x, y } = collectStripCenters(slices, exclude, opts?.forceAxis)
  return {
    x: snapCoordAwayFromStrips(point.x, x, preferredCm, soft),
    y: snapCoordAwayFromStrips(point.y, y, preferredCm, soft),
  }
}

/** Snap een P-punt t.o.v. P-stroken van andere slices. */
export function snapSlicerPPoint(args: {
  point: Point2D
  slices: ReadonlyArray<BtfSlice>
  preferredCm: number
  excludeIndex?: number
  softCm?: number
  forceAxis?: SlicePlaceStripAxis | null
}): Point2D {
  return snapPToOtherPOffsets(args.point, args.slices, args.preferredCm, {
    excludeIndex: args.excludeIndex,
    softCm: args.softCm,
    forceAxis: args.forceAxis,
  })
}
