import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { WindowAxelOrientation, WindowAxelRefBand } from './types'

export type RootFace = {
  root: number
  areaPx: number
  bbox: { x: number; y: number; width: number; height: number }
  className: RoomRasterClass
}

export type RectLike = { x: number; y: number; width: number; height: number }
type AxisInterval = { start: number; end: number }
type StripSample = { actualStripCount: number; stripHeightsPx: number[] }

const CENTER_STRIP_BAND_WIDTH_PX = 5
const STRIP_MERGE_GAP_PX = 0

export function resolveTargetStripHeightRatio(ref: WindowAxelRefBand): number {
  if (typeof ref.targetStripHeightRatio === 'number' && ref.targetStripHeightRatio > 0) {
    return ref.targetStripHeightRatio
  }
  return ref.targetStripHeightPx / Math.max(1, ref.axisBandHeightPx)
}

export function denormalizeTargetStripHeightPx(
  ref: WindowAxelRefBand,
  axisBandHeightPx: number,
): number {
  return Math.max(1, resolveTargetStripHeightRatio(ref) * Math.max(1, axisBandHeightPx))
}

/**
 * Per-strip dikteplafond Stage 1 (= score-tolerance upper bound).
 * Geen as-band×1.8 — die is totale stack/kozijn, niet stripdikte.
 */
export function resolveMaxStage1StripHeightPx(targetStripHeightPx: number): number {
  const target = Math.max(1, targetStripHeightPx)
  const tolerance = Math.max(2, target * 0.7)
  return target + tolerance
}

export function resolveAxisBandFromTargetStripHeightPx(
  ref: WindowAxelRefBand,
  targetStripHeightPx: number,
): number {
  const ratio = Math.max(1e-6, resolveTargetStripHeightRatio(ref))
  return Math.max(1, targetStripHeightPx / ratio)
}

export function pickBestStripSample(params: {
  expectedStripCount: number
  samples: StripSample[]
}): StripSample {
  const usable = params.samples.filter((sample) => sample.actualStripCount > 0)
  if (usable.length <= 0) return { actualStripCount: 0, stripHeightsPx: [] }
  const exact = usable.filter((sample) => sample.actualStripCount === params.expectedStripCount)
  if (exact.length > 0) {
    // Kies exact match met smalste hoogte-spread.
    return exact.reduce((best, current) => {
      const bestSpread =
        (best.stripHeightsPx[best.stripHeightsPx.length - 1] ?? 0) - (best.stripHeightsPx[0] ?? 0)
      const currentSpread =
        (current.stripHeightsPx[current.stripHeightsPx.length - 1] ?? 0) -
        (current.stripHeightsPx[0] ?? 0)
      if (currentSpread < bestSpread) return current
      return best
    })
  }
  return usable.reduce((best, current) => {
    const bestDiff = Math.abs(best.actualStripCount - params.expectedStripCount)
    const currentDiff = Math.abs(current.actualStripCount - params.expectedStripCount)
    if (currentDiff < bestDiff) return current
    if (currentDiff > bestDiff) return best
    const bestSpread =
      (best.stripHeightsPx[best.stripHeightsPx.length - 1] ?? 0) - (best.stripHeightsPx[0] ?? 0)
    const currentSpread =
      (current.stripHeightsPx[current.stripHeightsPx.length - 1] ?? 0) -
      (current.stripHeightsPx[0] ?? 0)
    if (currentSpread < bestSpread) return current
    return best
  })
}

export function axisSpan(bbox: RootFace['bbox'], orientation: WindowAxelOrientation): number {
  return orientation === 'horizontal' ? bbox.width : bbox.height
}

/**
 * Effectieve stripdikte in px:
 * area / as-lengte. Dit is stabieler dan bbox-hoogte bij schuine strips.
 */
export function stripThickness(face: RootFace, orientation: WindowAxelOrientation): number {
  const span = Math.max(1, axisSpan(face.bbox, orientation))
  return face.areaPx / span
}

function axisStart(bbox: RootFace['bbox'], orientation: WindowAxelOrientation): number {
  return orientation === 'horizontal' ? bbox.x : bbox.y
}

function axisEnd(bbox: RootFace['bbox'], orientation: WindowAxelOrientation): number {
  return axisStart(bbox, orientation) + axisSpan(bbox, orientation)
}

export function centerPerp(bbox: RootFace['bbox'], orientation: WindowAxelOrientation): number {
  if (orientation === 'horizontal') return bbox.y + bbox.height / 2
  return bbox.x + bbox.width / 2
}

function collectCenterBandIntervals(params: {
  cluster: RootFace[]
  orientation: WindowAxelOrientation
}): AxisInterval[] {
  if (params.cluster.length <= 0) return []
  const bbox = unionBbox(params.cluster)
  const axisCenter =
    params.orientation === 'horizontal' ? bbox.x + bbox.width / 2 : bbox.y + bbox.height / 2
  const half = Math.floor((CENTER_STRIP_BAND_WIDTH_PX - 1) / 2)
  const bandCenter = Math.round(axisCenter)
  const bandMin = bandCenter - half
  const bandMax = bandMin + CENTER_STRIP_BAND_WIDTH_PX - 1
  const intervals: AxisInterval[] = []
  for (const face of params.cluster) {
    if (params.orientation === 'horizontal') {
      const faceXMin = face.bbox.x
      const faceXMax = face.bbox.x + face.bbox.width - 1
      if (faceXMax < bandMin || faceXMin > bandMax) continue
      intervals.push({
        start: face.bbox.y,
        end: face.bbox.y + face.bbox.height - 1,
      })
      continue
    }
    const faceYMin = face.bbox.y
    const faceYMax = face.bbox.y + face.bbox.height - 1
    if (faceYMax < bandMin || faceYMin > bandMax) continue
    intervals.push({
      start: face.bbox.x,
      end: face.bbox.x + face.bbox.width - 1,
    })
  }
  return intervals
}

function mergeIntervals(intervals: AxisInterval[]): AxisInterval[] {
  if (intervals.length <= 0) return []
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: AxisInterval[] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (!last || interval.start > last.end + STRIP_MERGE_GAP_PX + 1) {
      merged.push({ ...interval })
      continue
    }
    if (interval.end > last.end) last.end = interval.end
  }
  return merged
}

export function resolveStripSample(params: {
  cluster: RootFace[]
  orientation: WindowAxelOrientation
}): StripSample {
  const intervals = collectCenterBandIntervals(params)
  const merged = mergeIntervals(intervals)
  const stripHeightsPx = merged
    .map((interval) => interval.end - interval.start + 1)
    .filter((heightPx) => heightPx > 0)
    .sort((a, b) => a - b)
  return {
    actualStripCount: stripHeightsPx.length,
    stripHeightsPx,
  }
}

/**
 * Fallback op basis van cluster-geometrie:
 * groepeer faces op hun centroid langs de dwarsas. Dit blijft stabiel als
 * een center-band per ongeluk alles aan elkaar "plakt".
 */
export function resolveCentroidStripSample(params: {
  cluster: RootFace[]
  orientation: WindowAxelOrientation
  targetStripHeightPx: number
}): StripSample {
  if (params.cluster.length <= 0) {
    return { actualStripCount: 0, stripHeightsPx: [] }
  }
  const groupGapPx = 0
  const entries = params.cluster
    .map((face) => ({
      center: centerPerp(face.bbox, params.orientation),
      height: stripThickness(face, params.orientation),
    }))
    .filter((entry) => entry.height > 0)
    .sort((a, b) => a.center - b.center)
  if (entries.length <= 0) {
    return { actualStripCount: 0, stripHeightsPx: [] }
  }
  const groups: Array<{ meanCenter: number; count: number; heights: number[] }> = []
  for (const entry of entries) {
    const last = groups[groups.length - 1]
    if (!last || Math.abs(entry.center - last.meanCenter) > groupGapPx) {
      groups.push({
        meanCenter: entry.center,
        count: 1,
        heights: [entry.height],
      })
      continue
    }
    last.heights.push(entry.height)
    last.meanCenter = (last.meanCenter * last.count + entry.center) / (last.count + 1)
    last.count += 1
  }
  const stripHeightsPx = groups
    .map((group) => median(group.heights))
    .filter((heightPx) => heightPx > 0)
    .sort((a, b) => a - b)
  return {
    actualStripCount: stripHeightsPx.length,
    stripHeightsPx,
  }
}

export function overlapRatioAlongAxis(
  a: RootFace,
  b: RootFace,
  orientation: WindowAxelOrientation,
): number {
  const start = Math.max(axisStart(a.bbox, orientation), axisStart(b.bbox, orientation))
  const end = Math.min(axisEnd(a.bbox, orientation), axisEnd(b.bbox, orientation))
  const overlap = Math.max(0, end - start)
  const base = Math.min(axisSpan(a.bbox, orientation), axisSpan(b.bbox, orientation))
  if (!(base > 0)) return 0
  return overlap / base
}

export function unionBbox(faces: RootFace[]): {
  x: number
  y: number
  width: number
  height: number
} {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const face of faces) {
    minX = Math.min(minX, face.bbox.x)
    minY = Math.min(minY, face.bbox.y)
    maxX = Math.max(maxX, face.bbox.x + face.bbox.width)
    maxY = Math.max(maxY, face.bbox.y + face.bbox.height)
  }
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  }
}

/** Stage-1 kandidaten: class-gate (wall mag wél — ink-meting zit in opening-wit geometrie). */
export function allowedClassForWindow(className: RoomRasterClass): boolean {
  return (
    className === 'unknown' ||
    className === 'surface' ||
    className === 'outside' ||
    className === 'wall' ||
    className === 'window' ||
    className === 'doorframe'
  )
}

function rectsOverlap(a: RectLike, b: RectLike): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}

export function median(values: number[]): number {
  if (values.length <= 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

/**
 * Kalibreer target striphoogte op echte px in dezelfde ruimte als room-faces,
 * op basis van roots die het referentievak snijden.
 */
export function resolveReferenceTargetStripHeightPx(params: {
  roots: RootFace[]
  ref: WindowAxelRefBand
  refRect: RectLike | null
  minSpanPx: number
  maxHeightPx: number
}): number {
  const referenceTargetPx = denormalizeTargetStripHeightPx(params.ref, params.ref.axisBandHeightPx)
  // Voor single-strip refs blijft de referentie leidend:
  // anders krijg je precies het De Roemer-probleem (13px -> ~8.9px drift).
  if (params.ref.stripCount <= 1) return referenceTargetPx
  if (!params.refRect) return referenceTargetPx
  const refSpan = axisSpan(params.refRect, params.ref.orientation)
  const local = params.roots
    .map((face) => {
      const sample = resolveStripSample({
        cluster: [face],
        orientation: params.ref.orientation,
      })
      const sampledHeight = sample.stripHeightsPx[0] ?? 0
      return { face, sampledHeight }
    })
    .filter((entry) => {
      const face = entry.face
      if (!rectsOverlap(face.bbox, params.refRect!)) return false
      const span = axisSpan(face.bbox, params.ref.orientation)
      const height = entry.sampledHeight
      if (!(span >= params.minSpanPx)) return false
      if (!(height > 0) || height > params.maxHeightPx) return false
      return true
    })
    .sort((a, b) => {
      const as = Math.abs(axisSpan(a.face.bbox, params.ref.orientation) - refSpan)
      const bs = Math.abs(axisSpan(b.face.bbox, params.ref.orientation) - refSpan)
      return as - bs
    })
  if (local.length < params.ref.stripCount) return referenceTargetPx
  const sampled = local
    .slice(0, Math.max(params.ref.stripCount * 2, params.ref.stripCount + 2))
    .map((entry) => entry.sampledHeight)
    .filter((heightPx) => heightPx > 0)
  if (sampled.length < params.ref.stripCount) return referenceTargetPx
  const nearestToRef = [...sampled]
    .sort((a, b) => Math.abs(a - referenceTargetPx) - Math.abs(b - referenceTargetPx))
    .slice(0, Math.max(params.ref.stripCount, 2))
  const calibrated = median(nearestToRef)
  if (!(calibrated > 0)) return referenceTargetPx
  const target = Math.max(1, referenceTargetPx)
  const minBound = target * 0.7
  const maxBound = target * 3.0
  // Gebonden herschalen ([0.7×, 3×] target): micro-strip refs (2px) mogen
  // meeschalen naar echte wit-faces (~6px) i.p.v. hard terug naar ref-target.
  return Math.max(minBound, Math.min(maxBound, calibrated))
}
