import type { SemanticWallJunction, SemanticWallSegment } from '@/core/extraction/types'
import { CONCEPT_WINDOW_REFID } from '@/core/fml/types'
import type {
  BoundWindow,
  ResolvedWindowCandidate,
  WindowAxelOrientation,
  WindowAxelRefBand,
  WindowBindRejectReason,
  WindowOpeningAxis,
  WindowWallBindResult,
} from './types'

type Point2D = { x: number; y: number }
type BBox = { x: number; y: number; width: number; height: number }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function orientationToAxis(orientation: WindowAxelOrientation): WindowOpeningAxis {
  return orientation === 'horizontal' ? 'h' : 'v'
}

function segmentAxis(segment: SemanticWallSegment): WindowOpeningAxis {
  return Math.abs(segment.b.x - segment.a.x) >= Math.abs(segment.b.y - segment.a.y) ? 'h' : 'v'
}

function pointOnSegment(seg: SemanticWallSegment, tRaw: number): Point2D & { t: number } {
  const t = clamp(tRaw, 0, 1)
  return {
    t,
    x: seg.a.x + (seg.b.x - seg.a.x) * t,
    y: seg.a.y + (seg.b.y - seg.a.y) * t,
  }
}

function projectPointToSegment(point: Point2D, seg: SemanticWallSegment): Point2D & { t: number } {
  const dx = seg.b.x - seg.a.x
  const dy = seg.b.y - seg.a.y
  const len2 = dx * dx + dy * dy
  if (len2 <= 1e-6) return { t: 0, x: seg.a.x, y: seg.a.y }
  const t = ((point.x - seg.a.x) * dx + (point.y - seg.a.y) * dy) / len2
  return pointOnSegment(seg, t)
}

function perpendicularDistance(point: Point2D, seg: SemanticWallSegment): number {
  const projected = projectPointToSegment(point, seg)
  return Math.hypot(point.x - projected.x, point.y - projected.y)
}

function bboxCorners(bbox: BBox): Point2D[] {
  const x1 = bbox.x + bbox.width
  const y1 = bbox.y + bbox.height
  return [
    { x: bbox.x, y: bbox.y },
    { x: x1, y: bbox.y },
    { x: x1, y: y1 },
    { x: bbox.x, y: y1 },
  ]
}

/** Projecteer bbox-uiteinden langs de segment-as → opening start/end + mid-t. */
function resolveOpeningSpan(params: { bbox: BBox; segment: SemanticWallSegment }): {
  start: Point2D
  end: Point2D
  t: number
  widthPx: number
} {
  const projections = bboxCorners(params.bbox).map((corner) =>
    projectPointToSegment(corner, params.segment),
  )
  let minT = projections[0]
  let maxT = projections[0]
  for (const projection of projections) {
    if (projection.t < minT.t) minT = projection
    if (projection.t > maxT.t) maxT = projection
  }
  const widthPx = Math.hypot(maxT.x - minT.x, maxT.y - minT.y)
  return {
    start: { x: minT.x, y: minT.y },
    end: { x: maxT.x, y: maxT.y },
    t: (minT.t + maxT.t) / 2,
    widthPx,
  }
}

function projectedSpanOverlapRatio(params: { bbox: BBox; segment: SemanticWallSegment }): number {
  const projections = bboxCorners(params.bbox).map((corner) =>
    projectPointToSegment(corner, params.segment),
  )
  let minT = 1
  let maxT = 0
  for (const projection of projections) {
    minT = Math.min(minT, projection.t)
    maxT = Math.max(maxT, projection.t)
  }
  const clampedMin = clamp(minT, 0, 1)
  const clampedMax = clamp(maxT, 0, 1)
  const overlap = Math.max(0, clampedMax - clampedMin)
  const span = Math.max(1e-6, maxT - minT)
  return overlap / span
}

function pointInBBox(point: Point2D, bbox: BBox): boolean {
  return (
    point.x >= bbox.x &&
    point.x <= bbox.x + bbox.width &&
    point.y >= bbox.y &&
    point.y <= bbox.y + bbox.height
  )
}

function junctionInsideWindow(params: {
  bbox: BBox
  segment: SemanticWallSegment
  junctionsById: Map<string, SemanticWallJunction>
}): boolean {
  const ids = [params.segment.junctionAId, params.segment.junctionBId].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )
  for (const id of ids) {
    const junction = params.junctionsById.get(id)
    if (!junction) continue
    if (pointInBBox({ x: junction.x, y: junction.y }, params.bbox)) return true
  }
  return false
}

function pickBestSegment(params: {
  candidate: ResolvedWindowCandidate
  axis: WindowOpeningAxis
  segments: SemanticWallSegment[]
}): { segmentIndex: number; distance: number } | null {
  let best: { segmentIndex: number; distance: number; score: number } | null = null
  for (let i = 0; i < params.segments.length; i += 1) {
    const segment = params.segments[i]
    if (segmentAxis(segment) !== params.axis) continue
    const distance = perpendicularDistance(params.candidate.centroidPx, segment)
    const maxDist = Math.max(segment.thicknessPxMax / 2, 10)
    if (distance > maxDist) continue
    const overlap = projectedSpanOverlapRatio({
      bbox: params.candidate.bbox,
      segment,
    })
    // Lager = beter: afstand domineert; overlap beloont overlap binnen segment.
    const score = distance - overlap * 4
    if (!best || score < best.score) {
      best = { segmentIndex: i, distance, score }
    }
  }
  return best ? { segmentIndex: best.segmentIndex, distance: best.distance } : null
}

/**
 * L14: koppel Stage-4 ramen aan L10-segmenten zonder bbox te verschuiven.
 * Junction in de raam-bbox → reject.
 */
export function bindWindowsToWalls(params: {
  windows: ResolvedWindowCandidate[]
  refBands: WindowAxelRefBand[]
  segments: SemanticWallSegment[]
  junctions: SemanticWallJunction[]
}): WindowWallBindResult {
  const junctionsById = new Map(params.junctions.map((junction) => [junction.id, junction]))
  const bound: BoundWindow[] = []
  const rejected: WindowWallBindResult['rejected'] = []

  for (const candidate of params.windows) {
    const openingAxis = orientationToAxis(candidate.orientation)
    const picked = pickBestSegment({
      candidate,
      axis: openingAxis,
      segments: params.segments,
    })
    if (!picked) {
      rejected.push({ candidate, reason: 'no_segment' satisfies WindowBindRejectReason })
      continue
    }
    const segment = params.segments[picked.segmentIndex]
    const openingBBox = { ...candidate.bbox }
    if (
      junctionInsideWindow({
        bbox: openingBBox,
        segment,
        junctionsById,
      })
    ) {
      rejected.push({ candidate, reason: 'junction_in_window' })
      continue
    }
    const span = resolveOpeningSpan({ bbox: openingBBox, segment })
    // Breedte: Stage-4 widthPx (strip_stack = langste strip); fallback op geprojecteerde span.
    const widthPx = candidate.widthPx > 0 ? candidate.widthPx : span.widthPx
    bound.push({
      windowId: candidate.id,
      segmentIndex: picked.segmentIndex,
      t: round2(span.t),
      openingAxis,
      openingBBox,
      openingStartPx: { x: round2(span.start.x), y: round2(span.start.y) },
      openingEndPx: { x: round2(span.end.x), y: round2(span.end.y) },
      widthPx: round2(widthPx),
      widthCm: round2(candidate.widthCm),
      fmlRefId: CONCEPT_WINDOW_REFID,
      evidence: candidate.evidence,
      faceIds: [...candidate.faceIds],
    })
  }

  return { bound, rejected }
}
