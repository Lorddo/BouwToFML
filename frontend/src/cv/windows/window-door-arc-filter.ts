import type {
  WindowAxelHypothesis,
  WindowDoorArcFilterResult,
  WindowDoorArcRejectionReason,
} from './types'
import {
  axisEnd,
  axisSpan,
  axisStart,
  overlapLength,
  perpEnd,
  perpGapPx,
  perpSpan,
  perpStart,
} from './window-evidence-geom'
import { assertSpacePolicy } from '@/cv/walls/rooms/space-policy-assert'
import { WINDOW_SPACE_POLICY } from './window-space-policy'

type Rect = { x: number; y: number; width: number; height: number }
type Axis = 'horizontal' | 'vertical'

function orientationOfRect(bbox: Rect): Axis {
  return bbox.width >= bbox.height ? 'horizontal' : 'vertical'
}

function axisGap(a: Rect, b: Rect, axis: Axis): number {
  const a0 = axisStart(a, axis)
  const a1 = axisEnd(a, axis)
  const b0 = axisStart(b, axis)
  const b1 = axisEnd(b, axis)
  if (a1 < b0) return b0 - a1
  if (b1 < a0) return a0 - b1
  return 0
}

function axisOverlap(a: Rect, b: Rect, axis: Axis): number {
  return overlapLength(axisStart(a, axis), axisEnd(a, axis), axisStart(b, axis), axisEnd(b, axis))
}

function isSameAxisBand(params: {
  source: Rect
  target: Rect
  maxPerpDistancePx: number
  maxAxisGapPx: number
  minAxisOverlapRatio?: number
}): boolean {
  const axis = orientationOfRect(params.source)
  if (axis !== orientationOfRect(params.target)) return false
  const perpDistance = perpGapPx({ a: params.source, b: params.target, orientation: axis })
  if (perpDistance > params.maxPerpDistancePx) return false
  if (axisGap(params.source, params.target, axis) > params.maxAxisGapPx) return false
  const minAxisOverlapRatio = Math.max(0, params.minAxisOverlapRatio ?? 0)
  if (minAxisOverlapRatio <= 0) return true
  const overlap = axisOverlap(params.source, params.target, axis)
  const base = Math.max(1, Math.min(axisSpan(params.source, axis), axisSpan(params.target, axis)))
  return overlap / base >= minAxisOverlapRatio
}

function directionalBandForRect(
  bbox: Rect,
  wallThicknessPx: number,
): { maxPerpDistancePx: number; maxAxisGapPx: number } {
  const axis = orientationOfRect(bbox)
  const across = perpSpan(bbox, axis)
  const maxPerpDistancePx = Math.max(2, Math.min(across, wallThicknessPx * 0.9))
  const maxAxisGapPx = Math.max(2, wallThicknessPx * 0.35)
  return { maxPerpDistancePx, maxAxisGapPx }
}

function isTargetFullyInsidePerpBand(params: {
  source: Rect
  target: Rect
  marginPx: number
}): boolean {
  const axis = orientationOfRect(params.source)
  if (axis !== orientationOfRect(params.target)) return false
  const sourceMin = perpStart(params.source, axis) - params.marginPx
  const sourceMax = perpEnd(params.source, axis) + params.marginPx
  const targetMin = perpStart(params.target, axis)
  const targetMax = perpEnd(params.target, axis)
  return targetMin >= sourceMin && targetMax <= sourceMax
}

/**
 * 1-hop adjacency via wall-ink (labels na ink-resolve): wit–inkt–wit bruggen tellen mee.
 * Opening-wit adjacency is hier bewust niet genoeg (inkt-pixels = 0 → geen brug).
 */
export function facesTouchDoorArc(params: {
  faceIds: Iterable<number>
  doorArcFaceIds: ReadonlySet<number>
  wallInkAdjacency?: ReadonlyMap<number, ReadonlySet<number>>
}): boolean {
  return collectTouchedDoorArcFaceIds(params).length > 0
}

/** Deurboog-faces die hyp-faces delen of 1-hop ink-adjacent raken. */
export function collectTouchedDoorArcFaceIds(params: {
  faceIds: Iterable<number>
  doorArcFaceIds: ReadonlySet<number>
  wallInkAdjacency?: ReadonlyMap<number, ReadonlySet<number>>
}): number[] {
  const touched: number[] = []
  const seen = new Set<number>()
  for (const faceId of params.faceIds) {
    if (!(faceId > 0)) continue
    if (params.doorArcFaceIds.has(faceId) && !seen.has(faceId)) {
      seen.add(faceId)
      touched.push(faceId)
    }
    if (!params.wallInkAdjacency) continue
    const neighbors = params.wallInkAdjacency.get(faceId)
    if (!neighbors || neighbors.size <= 0) continue
    for (const neighborId of neighbors) {
      if (!params.doorArcFaceIds.has(neighborId) || seen.has(neighborId)) continue
      seen.add(neighborId)
      touched.push(neighborId)
    }
  }
  return touched
}

function unionRects(rects: Rect[]): Rect | null {
  if (rects.length <= 0) return null
  let x0 = rects[0]!.x
  let y0 = rects[0]!.y
  let x1 = rects[0]!.x + rects[0]!.width
  let y1 = rects[0]!.y + rects[0]!.height
  for (let i = 1; i < rects.length; i += 1) {
    const r = rects[i]!
    x0 = Math.min(x0, r.x)
    y0 = Math.min(y0, r.y)
    x1 = Math.max(x1, r.x + r.width)
    y1 = Math.max(y1, r.y + r.height)
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/**
 * Stage-3 late retarget → doorframe.
 * Alleen `hypothesis.faceIds` (geen framing-evidence) + as-overlap met geraakte deurboog.
 * Voorkomt vals positief: raam naast deur op dezelfde muur waarvan alleen de jamb de swing raakt.
 */
export function shouldRetargetAcceptedWindowToDoorframe(params: {
  hypothesisFaceIds: Iterable<number>
  hypothesisBBox: Rect
  orientation?: Axis
  doorArcFaceIds: ReadonlySet<number>
  wallInkAdjacency?: ReadonlyMap<number, ReadonlySet<number>>
  doorArcBBoxByFaceId: ReadonlyMap<number, Rect>
}): boolean {
  const touched = collectTouchedDoorArcFaceIds({
    faceIds: params.hypothesisFaceIds,
    doorArcFaceIds: params.doorArcFaceIds,
    wallInkAdjacency: params.wallInkAdjacency,
  })
  if (touched.length <= 0) return false

  const doorRects: Rect[] = []
  for (const id of touched) {
    const bbox = params.doorArcBBoxByFaceId.get(id)
    if (bbox) doorRects.push(bbox)
  }
  const doorUnion = unionRects(doorRects)
  if (!doorUnion) return false

  const axis = params.orientation ?? orientationOfRect(params.hypothesisBBox)
  return axisOverlap(params.hypothesisBBox, doorUnion, axis) > 0
}

function hasAdjacentDoorArcFace(params: {
  hypothesis: WindowAxelHypothesis
  doorArcFaceIds: ReadonlySet<number>
  wallInkAdjacency?: ReadonlyMap<number, ReadonlySet<number>>
}): boolean {
  return facesTouchDoorArc({
    faceIds: params.hypothesis.faceIds,
    doorArcFaceIds: params.doorArcFaceIds,
    wallInkAdjacency: params.wallInkAdjacency,
  })
}

function resolveDoorframeReason(params: {
  hypothesis: WindowAxelHypothesis
  doorArcFaceIds: ReadonlySet<number>
  wallInkAdjacency?: ReadonlyMap<number, ReadonlySet<number>>
}): WindowDoorArcRejectionReason | null {
  for (const faceId of params.hypothesis.faceIds) {
    if (faceId > 0 && params.doorArcFaceIds.has(faceId)) {
      return 'shares_door_arc_face'
    }
  }
  if (hasAdjacentDoorArcFace(params)) {
    return 'adjacent_to_door_arc'
  }
  return null
}

/**
 * Stage 2: hypotheses naast/op deurboog → doorframeCandidates (niet droppen).
 * Adjacent-check op wall-ink adjacency (WINDOW_SPACE_POLICY.stage2DoorArc).
 */
export function filterWindowsTouchingDoorArcs(params: {
  hypotheses: WindowAxelHypothesis[]
  doorArcFaceIds: ReadonlySet<number>
  /** Wall-ink label adjacency (post ink-resolve). */
  wallInkAdjacency?: ReadonlyMap<number, ReadonlySet<number>>
  wallThicknessPx?: number
}): WindowDoorArcFilterResult {
  assertSpacePolicy('window Stage 2 door-arc', WINDOW_SPACE_POLICY.stage2DoorArc, 'ink')
  const doorframeById = new Map<string, WindowDoorArcFilterResult['doorframeCandidates'][number]>()
  const wallThicknessPx = params.wallThicknessPx ?? 0

  let rejectedShare = 0
  let rejectedAdjacent = 0
  let rejectedDirectional = 0

  // Pass 1: direct deurboog contact (shared / adjacent via wall-ink)
  for (const hypothesis of params.hypotheses) {
    const reason = resolveDoorframeReason({
      hypothesis,
      doorArcFaceIds: params.doorArcFaceIds,
      wallInkAdjacency: params.wallInkAdjacency,
    })
    if (!reason) continue
    if (reason === 'shares_door_arc_face') {
      rejectedShare += 1
    } else if (reason === 'adjacent_to_door_arc') {
      rejectedAdjacent += 1
    } else {
      rejectedDirectional += 1
    }
    doorframeById.set(hypothesis.id, { hypothesis, reason })
  }

  // Pass 2: propagatie in dezelfde richting/as-band vanaf DIRECT geraakte hypotheses.
  if (wallThicknessPx > 0 && doorframeById.size > 0) {
    const directDoorframes = [...doorframeById.values()]
      .filter(
        (entry) =>
          entry.reason === 'shares_door_arc_face' || entry.reason === 'adjacent_to_door_arc',
      )
      .map((entry) => entry.hypothesis)

    for (const hypothesis of params.hypotheses) {
      if (doorframeById.has(hypothesis.id)) continue
      const thresholds = directionalBandForRect(hypothesis.unionBBox, wallThicknessPx)
      const bandMarginPx = Math.max(1, Math.round(wallThicknessPx * 0.6))
      const matchesDoorframeBand = directDoorframes.some((doorframeHypothesis) => {
        const sameBand = isSameAxisBand({
          source: hypothesis.unionBBox,
          target: doorframeHypothesis.unionBBox,
          ...thresholds,
          maxAxisGapPx: 0,
          minAxisOverlapRatio: 0.3,
        })
        if (!sameBand) return false
        return isTargetFullyInsidePerpBand({
          source: doorframeHypothesis.unionBBox,
          target: hypothesis.unionBBox,
          marginPx: bandMarginPx,
        })
      })
      if (!matchesDoorframeBand) continue
      rejectedDirectional += 1
      doorframeById.set(hypothesis.id, {
        hypothesis,
        reason: 'aligned_with_rejected_arc_band',
      })
    }
  }

  const doorframeCandidates = [...doorframeById.values()]
  const kept = params.hypotheses.filter((hypothesis) => !doorframeById.has(hypothesis.id))

  return {
    kept,
    doorframeCandidates,
    stats: {
      acceptedCount: kept.length,
      rejectedShare,
      rejectedAdjacent,
      rejectedDirectional,
    },
  }
}
