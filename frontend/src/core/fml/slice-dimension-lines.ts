/**
 * Slicer-maten: meet langs lijn door M (loodrecht op P−M), plaats op P-lijn.
 * Ticks = snijpunten met muurfaces (niet hartlijn / area-poly).
 */
import { wallOuterAabb } from './auto-dimension-lines'
import { type BtfSlice, pointOnAxis, projectOnAxis, sliceMeasureAxis } from './btf-slices'
import type { DimensionMode } from './fml-dimension-settings'
import { wallFaces } from './fml-wall-geom'
import type { FloorDimension, Point2D, Wall } from './types'

export type SliceDimensionLine = { a: Point2D; b: Point2D }

/** Merge ticks dichterbij dan dit (cm). */
export const SLICE_TICK_MERGE_CM = 1
/** Min segmentlengte (cm). */
export const SLICE_MIN_SEGMENT_CM = 2
/** Extra dashed-lengte buiten outer AABB (cm). */
export const SLICE_DASH_PAD_CM = 40

type FaceHit = {
  t: number
  wallId: string
}

function segmentIntersectParam(
  origin: Point2D,
  axis: Point2D,
  segA: Point2D,
  segB: Point2D,
): number | null {
  const rx = axis.x
  const ry = axis.y
  const sx = segB.x - segA.x
  const sy = segB.y - segA.y
  const denom = rx * sy - ry * sx
  if (Math.abs(denom) < 1e-9) return null
  const qx = segA.x - origin.x
  const qy = segA.y - origin.y
  const u = (qx * ry - qy * rx) / denom
  if (u < -1e-6 || u > 1 + 1e-6) return null
  const t = (qx * sy - qy * sx) / denom
  return t
}

function uniqueSortedHits(hits: FaceHit[], mergeCm: number): FaceHit[] {
  const sorted = [...hits].sort((a, b) => a.t - b.t)
  if (sorted.length === 0) return []
  const out: FaceHit[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = out[out.length - 1]
    if (sorted[i].t - prev.t > mergeCm) out.push(sorted[i])
    // dichterbij: behoud eerste (zelfde wall of niet — merge is genoeg)
  }
  return out
}

function collectFaceHits(walls: Wall[], origin: Point2D, axis: Point2D): FaceHit[] {
  const hits: FaceHit[] = []
  for (const wall of walls) {
    if (!Number.isFinite(wall.thickness) || wall.thickness <= 0) continue
    const { left, right } = wallFaces(wall)
    for (const face of [left, right]) {
      const t = segmentIntersectParam(origin, axis, face.a, face.b)
      if (t == null || !Number.isFinite(t)) continue
      hits.push({ t, wallId: wall.id })
    }
  }
  return uniqueSortedHits(hits, SLICE_TICK_MERGE_CM)
}

/**
 * Interior: skip gaps tussen twee faces van dezelfde muur (muurdikte).
 * Exterior: alle gaps behouden.
 */
function segmentsFromHits(
  hits: FaceHit[],
  mode: DimensionMode,
  minSegCm: number,
): Array<{ lo: number; hi: number }> {
  const out: Array<{ lo: number; hi: number }> = []
  for (let i = 0; i < hits.length - 1; i += 1) {
    const a = hits[i]
    const b = hits[i + 1]
    const span = b.t - a.t
    if (span < minSegCm) continue
    if (mode === 'interior' && a.wallId === b.wallId) continue
    out.push({ lo: a.t, hi: b.t })
  }
  return out
}

/** Eindige dashed-span langs meetas t.o.v. outer AABB + pad. */
export function sliceDashSpan(
  walls: Wall[],
  origin: Point2D,
  axis: Point2D,
): { lo: number; hi: number } | null {
  const aabb = wallOuterAabb(walls)
  if (!aabb) return null
  const corners: Point2D[] = [
    { x: aabb.minX, y: aabb.minY },
    { x: aabb.maxX, y: aabb.minY },
    { x: aabb.maxX, y: aabb.maxY },
    { x: aabb.minX, y: aabb.maxY },
  ]
  let lo = Infinity
  let hi = -Infinity
  for (const c of corners) {
    const t = projectOnAxis(c, origin, axis)
    if (t < lo) lo = t
    if (t > hi) hi = t
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null
  return { lo: lo - SLICE_DASH_PAD_CM, hi: hi + SLICE_DASH_PAD_CM }
}

export type SliceGuide = {
  measureA: Point2D
  measureB: Point2D
  placeA: Point2D
  placeB: Point2D
  m: Point2D
  p: Point2D
}

/** Constructie-lijnen (dashed) + handles voor één slice. */
export function buildSliceGuide(slice: BtfSlice, walls: Wall[]): SliceGuide | null {
  const axis = sliceMeasureAxis(slice)
  if (!axis) return null
  const span = sliceDashSpan(walls, slice.m, axis)
  if (!span) return null
  return {
    measureA: pointOnAxis(slice.m, axis, span.lo),
    measureB: pointOnAxis(slice.m, axis, span.hi),
    placeA: pointOnAxis(slice.p, axis, span.lo),
    placeB: pointOnAxis(slice.p, axis, span.hi),
    m: { ...slice.m },
    p: { ...slice.p },
  }
}

/** Maatlijnen op de P-lijn voor één slice. */
export function buildSliceDimensionLines(
  slice: BtfSlice,
  walls: Wall[],
  mode: DimensionMode,
): SliceDimensionLine[] {
  const axis = sliceMeasureAxis(slice)
  if (!axis) return []
  const hits = collectFaceHits(walls, slice.m, axis)
  if (hits.length < 2) return []
  const segs = segmentsFromHits(
    hits,
    mode === 'exterior' ? 'exterior' : 'interior',
    SLICE_MIN_SEGMENT_CM,
  )
  return segs.map((seg) => ({
    a: pointOnAxis(slice.p, axis, seg.lo),
    b: pointOnAxis(slice.p, axis, seg.hi),
  }))
}

export function buildAllSliceDimensionLines(
  slices: BtfSlice[],
  walls: Wall[],
  mode: DimensionMode,
): SliceDimensionLine[] {
  const out: SliceDimensionLine[] = []
  for (const slice of slices) {
    out.push(...buildSliceDimensionLines(slice, walls, mode))
  }
  return out
}

/** FloorDimension[] voor export/bake (verse ids). */
export function bakeSliceDimensions(
  slices: BtfSlice[],
  walls: Wall[],
  mode: DimensionMode,
  idPrefix = 'slice-dim',
): FloorDimension[] {
  return buildAllSliceDimensionLines(slices, walls, mode).map((line, index) => ({
    id: `${idPrefix}-${index}`,
    type: 'custom_dimension' as const,
    a: line.a,
    b: line.b,
  }))
}
