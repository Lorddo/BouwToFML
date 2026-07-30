import type { SemanticWallSegment } from '@/core/extraction/types'
import {
  closestPointOnSegment,
  distanceToWallInNormal,
  overlapLength,
  resolveMaxSnapPx,
  resolveSideMeta,
  segmentAxis,
  segmentSpan,
  sideSpan,
} from './door-wall-snap-geom'
import {
  DOOR_WALL_SNAP_TUNING,
  type BBoxBounds,
  type DoorSide,
  type SideContact,
} from './door-wall-snap-tuning'

const T = DOOR_WALL_SNAP_TUNING

export function measureSideContact(params: {
  side: DoorSide
  bounds: BBoxBounds
  wallMask: Uint8Array
  width: number
  height: number
  contactDepthPx: number
  searchDepthPx: number
}): SideContact {
  const sideMeta = resolveSideMeta(params.side)
  const depth = Math.max(1, params.contactDepthPx)
  const searchDepth = Math.max(depth, params.searchDepthPx)
  let contactCount = 0
  let sampleCount = 0
  let distanceSum = 0
  let distanceHits = 0
  const sideLength =
    sideMeta.axis === 'v'
      ? params.bounds.y1 - params.bounds.y0
      : params.bounds.x1 - params.bounds.x0

  if (params.side === 'left' || params.side === 'right') {
    const edgeX = params.side === 'left' ? params.bounds.x0 : params.bounds.x1 - 1
    for (let y = params.bounds.y0; y < params.bounds.y1; y += 1) {
      sampleCount += 1
      const distancePx = distanceToWallInNormal({
        wallMask: params.wallMask,
        width: params.width,
        height: params.height,
        startX: edgeX,
        startY: y,
        normalX: sideMeta.normalX,
        normalY: sideMeta.normalY,
        maxSteps: searchDepth,
      })
      if (Number.isFinite(distancePx)) {
        distanceSum += distancePx
        distanceHits += 1
        if (distancePx <= depth) contactCount += 1
      }
    }
    return {
      side: params.side,
      axis: sideMeta.axis,
      outwardSign: sideMeta.outwardSign,
      contactCount,
      sampleCount,
      sideCoverage: sampleCount / Math.max(1, sideLength),
      touchCoverage: contactCount / Math.max(1, sideLength),
      score: contactCount / Math.max(1, sideLength),
      proximityDistancePx: distanceHits > 0 ? distanceSum / distanceHits : Number.POSITIVE_INFINITY,
      sideLength: Math.max(1, sideLength),
      sideMid: { x: edgeX, y: (params.bounds.y0 + params.bounds.y1 - 1) / 2 },
    }
  }

  const edgeY = params.side === 'top' ? params.bounds.y0 : params.bounds.y1 - 1
  for (let x = params.bounds.x0; x < params.bounds.x1; x += 1) {
    sampleCount += 1
    const distancePx = distanceToWallInNormal({
      wallMask: params.wallMask,
      width: params.width,
      height: params.height,
      startX: x,
      startY: edgeY,
      normalX: sideMeta.normalX,
      normalY: sideMeta.normalY,
      maxSteps: searchDepth,
    })
    if (Number.isFinite(distancePx)) {
      distanceSum += distancePx
      distanceHits += 1
      if (distancePx <= depth) contactCount += 1
    }
  }
  return {
    side: params.side,
    axis: sideMeta.axis,
    outwardSign: sideMeta.outwardSign,
    contactCount,
    sampleCount,
    sideCoverage: sampleCount / Math.max(1, sideLength),
    touchCoverage: contactCount / Math.max(1, sideLength),
    score: contactCount / Math.max(1, sideLength),
    proximityDistancePx: distanceHits > 0 ? distanceSum / distanceHits : Number.POSITIVE_INFINITY,
    sideLength: Math.max(1, sideLength),
    sideMid: { x: (params.bounds.x0 + params.bounds.x1 - 1) / 2, y: edgeY },
  }
}

export function pickBestContactSide(contacts: SideContact[]): {
  best: SideContact
  orderedCandidates: SideContact[]
  secondScore: number
} | null {
  if (contacts.length <= 0) return null
  const hasTouch = contacts.some((side) => side.contactCount > 0)
  const candidates = contacts.filter(
    (side) => side.sampleCount > 0 && Number.isFinite(side.proximityDistancePx),
  )
  if (candidates.length <= 0) return null
  const sorted = [...candidates].sort((a, b) => {
    if (hasTouch) {
      if (b.score !== a.score) return b.score - a.score
      if (b.contactCount !== a.contactCount) return b.contactCount - a.contactCount
      if (b.sideCoverage !== a.sideCoverage) return b.sideCoverage - a.sideCoverage
      if (a.proximityDistancePx !== b.proximityDistancePx)
        return a.proximityDistancePx - b.proximityDistancePx
      return b.sideLength - a.sideLength
    }
    if (a.proximityDistancePx !== b.proximityDistancePx)
      return a.proximityDistancePx - b.proximityDistancePx
    if (b.sideCoverage !== a.sideCoverage) return b.sideCoverage - a.sideCoverage
    if (b.sampleCount !== a.sampleCount) return b.sampleCount - a.sampleCount
    return b.sideLength - a.sideLength
  })
  const best = sorted[0]
  if (!best) return null
  const second = sorted[1]
  return {
    best,
    orderedCandidates: sorted,
    secondScore: second ? second.score : 0,
  }
}

export function findBestSegment(params: {
  side: SideContact
  bounds: BBoxBounds
  segments: SemanticWallSegment[]
  referenceWallThicknessPx?: number
  relaxed?: boolean
}): {
  segmentIndex: number
  t: number
  projected: { x: number; y: number }
  segmentScore: number
  normalDistancePx: number
} | null {
  const sideSpanInfo = sideSpan(params.bounds, params.side.axis)
  const doorDepthPx =
    params.side.axis === 'v'
      ? params.bounds.x1 - params.bounds.x0
      : params.bounds.y1 - params.bounds.y0
  let best: {
    segmentIndex: number
    projected: { t: number; x: number; y: number }
    normalDistancePx: number
    overlapRatio: number
    score: number
  } | null = null
  const thicknessRefPx = Math.max(1, params.referenceWallThicknessPx ?? 0)

  for (let segmentIndex = 0; segmentIndex < params.segments.length; segmentIndex += 1) {
    const segment = params.segments[segmentIndex]
    if (!segment) continue
    const segAxis = segmentAxis(segment)
    if (segAxis !== params.side.axis) continue
    const segSpan = segmentSpan(segment, params.side.axis)
    const overlapPx = overlapLength(sideSpanInfo.min, sideSpanInfo.max, segSpan.min, segSpan.max)
    const spanGapPx =
      overlapPx > 0
        ? 0
        : Math.max(0, sideSpanInfo.min - segSpan.max, segSpan.min - sideSpanInfo.max)
    const spanGapTolerancePx = Math.max(
      T.spanGapToleranceMinPx,
      Math.round(
        (params.referenceWallThicknessPx ??
          segment.thicknessPxMax ??
          T.spanGapThicknessFallbackPx) * T.spanGapThicknessFactor,
      ),
    )
    if (!params.relaxed && overlapPx <= 0 && spanGapPx > spanGapTolerancePx) continue
    // ESC:D-49 (A)
    if (params.relaxed && overlapPx <= 0) {
      const relaxedSpanGapLimit = Math.max(
        spanGapTolerancePx,
        Math.round(sideSpanInfo.length * T.relaxedSpanGapSideFactor + thicknessRefPx),
      )
      if (spanGapPx > relaxedSpanGapLimit) continue
    }

    const projected = closestPointOnSegment(params.side.sideMid, segment)
    const offsetX = projected.x - params.side.sideMid.x
    const offsetY = projected.y - params.side.sideMid.y
    const normalOffset = params.side.axis === 'v' ? offsetX : offsetY
    const directionSlackPx = Math.max(
      T.directionSlackMinPx,
      Math.round(
        (params.referenceWallThicknessPx ??
          segment.thicknessPxMax ??
          T.directionSlackThicknessFallbackPx) * T.directionSlackThicknessFactor,
      ),
    )
    const proximitySlackPx = Number.isFinite(params.side.proximityDistancePx)
      ? Math.min(Math.max(0, params.side.proximityDistancePx), directionSlackPx * 2)
      : 0
    const allowedOppositePxBase = directionSlackPx + proximitySlackPx
    const allowedOppositePx = params.relaxed
      ? Math.max(
          allowedOppositePxBase,
          Math.round(
            (params.referenceWallThicknessPx ??
              segment.thicknessPxMax ??
              T.relaxedOppositeThicknessFallbackPx) * T.relaxedOppositeThicknessFactor,
          ),
        )
      : allowedOppositePxBase
    if (params.side.outwardSign < 0 && normalOffset > allowedOppositePx) continue
    if (params.side.outwardSign > 0 && normalOffset < -allowedOppositePx) continue

    const normalDistancePx = Math.abs(normalOffset)
    const maxSnapPxBase = resolveMaxSnapPx({
      referenceWallThicknessPx: params.referenceWallThicknessPx,
      segmentThicknessPxMax: segment.thicknessPxMax,
      doorDepthPx,
      sideProximityPx: params.side.proximityDistancePx,
    })
    const relaxedMaxSnapPx = Math.max(
      maxSnapPxBase,
      Math.round(
        Math.max(0, params.side.proximityDistancePx) +
          (params.referenceWallThicknessPx ??
            segment.thicknessPxMax ??
            T.relaxedMaxSnapThicknessFallbackPx) *
            T.relaxedMaxSnapThicknessFactor,
      ),
    )
    const relaxedMaxSnapCapPx = Math.round(
      (params.referenceWallThicknessPx ??
        segment.thicknessPxMax ??
        T.relaxedMaxSnapCapThicknessFallbackPx) *
        T.relaxedMaxSnapCapThicknessFactor +
        doorDepthPx * T.relaxedMaxSnapCapDoorDepthFactor,
    )
    const maxSnapPx = params.relaxed
      ? Math.min(relaxedMaxSnapPx, relaxedMaxSnapCapPx)
      : maxSnapPxBase
    if (normalDistancePx > maxSnapPx) continue
    if (params.relaxed && spanGapPx > maxSnapPx * T.relaxedSpanGapVsMaxSnapFactor) continue

    const overlapRatio = overlapPx / sideSpanInfo.length
    const score =
      normalDistancePx +
      spanGapPx * T.segmentScoreSpanGapWeight -
      overlapRatio * maxSnapPx * T.segmentScoreOverlapWeight
    if (
      !best ||
      score < best.score ||
      (score === best.score && normalDistancePx < best.normalDistancePx) ||
      (score === best.score &&
        normalDistancePx === best.normalDistancePx &&
        overlapRatio > best.overlapRatio)
    ) {
      best = {
        segmentIndex,
        projected,
        normalDistancePx,
        overlapRatio,
        score,
      }
    }
  }

  if (!best) return null
  return {
    segmentIndex: best.segmentIndex,
    t: best.projected.t,
    projected: { x: best.projected.x, y: best.projected.y },
    segmentScore: best.score,
    normalDistancePx: best.normalDistancePx,
  }
}

export function resolveBindingScore(params: {
  side: SideContact
  segmentScore: number
  hasTouch: boolean
}): number {
  const noTouchPenaltyPx =
    params.side.contactCount > 0
      ? 0
      : Math.max(1, params.side.proximityDistancePx) * T.noTouchProximityPenaltyFactor
  const missingTouchPenaltyPx =
    params.hasTouch && params.side.contactCount <= 0
      ? Math.max(
          T.missingTouchPenaltyFloorPx,
          Math.max(0, params.side.proximityDistancePx) * T.missingTouchProximityFactor,
        )
      : 0
  const touchBonusPx = params.side.touchCoverage * T.touchCoverageBonusFactor
  return params.segmentScore + noTouchPenaltyPx + missingTouchPenaltyPx - touchBonusPx
}
