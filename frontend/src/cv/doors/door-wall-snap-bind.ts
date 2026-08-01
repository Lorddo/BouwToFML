import type { SemanticWallSegment } from '@/core/extraction/types'
import {
  closestPointOnSegment,
  resolveCandidateSides,
  resolveSideMeta,
  round2,
} from './door-wall-snap-geom'
import {
  findBestSegment,
  measureSideContact,
  pickBestContactSide,
  resolveBindingScore,
} from './door-wall-snap-scoring'
import {
  DOOR_WALL_SNAP_TUNING,
  type BBoxBounds,
  type DoorSide,
  type SideContact,
} from './door-wall-snap-tuning'
import type { BoundDoor, DoorOpeningAxis, ResolvedDoorCandidate } from './types'

const T = DOOR_WALL_SNAP_TUNING

export function maxCentroidSegmentDistancePx(referenceWallThicknessPx?: number): number {
  const thickness = Math.max(1, referenceWallThicknessPx ?? T.expandThicknessFallbackPx)
  return Math.max(
    T.maxCentroidSegmentDistFloorPx,
    Math.round(thickness * T.maxCentroidSegmentDistThicknessFactor),
  )
}

export function segmentNearDoorCentroid(params: {
  segment: SemanticWallSegment
  doorBounds: BBoxBounds
  referenceWallThicknessPx?: number
}): boolean {
  const cx = (params.doorBounds.x0 + params.doorBounds.x1 - 1) / 2
  const cy = (params.doorBounds.y0 + params.doorBounds.y1 - 1) / 2
  const projected = closestPointOnSegment({ x: cx, y: cy }, params.segment)
  const dist = Math.hypot(projected.x - cx, projected.y - cy)
  return dist <= maxCentroidSegmentDistancePx(params.referenceWallThicknessPx)
}

/**
 * Segment-first bind via ink-anchor (Path A / D-47).
 * Contact-side = swing-rand naar de anchor; span = anchor (lange as). Geen wallMask-gate.
 * ESC:D-50 Path B wall-union-aanroep — VERWIJDERD 2026-07-31 (tombstone in door-wall-snap.ts).
 */
export function tryBindDoorToAnchorSegment(params: {
  door: ResolvedDoorCandidate
  doorBounds: BBoxBounds
  anchorUnion: BBoxBounds
  segments: SemanticWallSegment[]
  referenceWallThicknessPx?: number
}): BoundDoor | null {
  const df = params.anchorUnion
  const door = params.doorBounds
  const dfW = df.x1 - df.x0
  const dfH = df.y1 - df.y0
  const axis: DoorOpeningAxis = dfH >= dfW ? 'v' : 'h'

  const doorCx = (door.x0 + door.x1 - 1) / 2
  const doorCy = (door.y0 + door.y1 - 1) / 2
  const dfCx = (df.x0 + df.x1 - 1) / 2
  const dfCy = (df.y0 + df.y1 - 1) / 2

  let side: DoorSide
  if (axis === 'v') {
    side = doorCx >= dfCx ? 'left' : 'right'
  } else {
    side = doorCy >= dfCy ? 'top' : 'bottom'
  }
  const sideMeta = resolveSideMeta(side)
  const edgeX = side === 'left' ? door.x0 : side === 'right' ? door.x1 - 1 : doorCx
  const edgeY = side === 'top' ? door.y0 : side === 'bottom' ? door.y1 - 1 : doorCy
  const sideMid = {
    x: axis === 'v' ? edgeX : doorCx,
    y: axis === 'h' ? edgeY : doorCy,
  }

  // Span langs anchor (segment ligt op de muur-/kozijnlijn, niet alleen swing-y).
  const spanBounds: BBoxBounds =
    axis === 'v'
      ? {
          x0: door.x0,
          x1: door.x1,
          y0: Math.min(door.y0, df.y0),
          y1: Math.max(door.y1, df.y1),
        }
      : {
          x0: Math.min(door.x0, df.x0),
          x1: Math.max(door.x1, df.x1),
          y0: door.y0,
          y1: door.y1,
        }

  const fakeContact: SideContact = {
    side,
    axis: sideMeta.axis,
    outwardSign: sideMeta.outwardSign,
    contactCount: 1,
    sampleCount: 1,
    sideCoverage: 1,
    touchCoverage: 1,
    score: 1,
    proximityDistancePx: Math.max(
      0,
      axis === 'v' ? Math.abs(dfCx - edgeX) : Math.abs(dfCy - edgeY),
    ),
    sideLength:
      axis === 'v'
        ? Math.max(1, spanBounds.y1 - spanBounds.y0)
        : Math.max(1, spanBounds.x1 - spanBounds.x0),
    sideMid,
  }

  const strictMatch = findBestSegment({
    side: fakeContact,
    bounds: spanBounds,
    segments: params.segments,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
  // ESC:D-53 (A) — VERWIJDERD 2026-07-31: anchor relaxed fallback; alleen strikte match.
  const match = strictMatch
  if (!match) return null
  const segment = params.segments[match.segmentIndex]
  if (!segment) return null
  if (
    !segmentNearDoorCentroid({
      segment,
      doorBounds: params.doorBounds,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
    })
  ) {
    return null
  }

  const shiftX = match.projected.x - sideMid.x
  const shiftY = match.projected.y - sideMid.y
  return {
    doorId: params.door.id,
    segmentIndex: match.segmentIndex,
    junctionAId: segment.junctionAId,
    junctionBId: segment.junctionBId,
    t: round2(match.t),
    openingAxis: sideMeta.axis,
    outwardSign: sideMeta.outwardSign,
    contactScore: 1,
    secondaryContactScore: 0,
    snappedBBox: {
      x: round2(params.door.bbox.x + shiftX),
      y: round2(params.door.bbox.y + shiftY),
      width: round2(params.door.bbox.width),
      height: round2(params.door.bbox.height),
    },
  }
}

export function tryBindDoorToBounds(params: {
  door: ResolvedDoorCandidate
  bounds: BBoxBounds
  wallMask: Uint8Array
  width: number
  height: number
  segments: SemanticWallSegment[]
  referenceWallThicknessPx?: number
}): BoundDoor | null {
  const contactDepthPx = Math.max(
    1,
    Math.round(
      (params.referenceWallThicknessPx ?? 0) > 0
        ? (params.referenceWallThicknessPx ?? 1) * T.contactDepthThicknessFactor
        : T.contactDepthFallbackPx,
    ),
  )
  const searchDepthPx = Math.max(
    contactDepthPx + 1,
    Math.round(
      Math.max(params.bounds.x1 - params.bounds.x0, params.bounds.y1 - params.bounds.y0) +
        (params.referenceWallThicknessPx ?? 0) * T.searchDepthThicknessFactor,
    ),
  )
  const contacts: SideContact[] = resolveCandidateSides(params.bounds).map((side) =>
    measureSideContact({
      side,
      bounds: params.bounds,
      wallMask: params.wallMask,
      width: params.width,
      height: params.height,
      contactDepthPx,
      searchDepthPx,
    }),
  )
  const picked = pickBestContactSide(contacts)
  if (!picked) return null
  const hasTouch = picked.orderedCandidates.some((side) => side.contactCount > 0)

  let selectedSide: SideContact | null = null
  let segmentMatch: {
    segmentIndex: number
    t: number
    projected: { x: number; y: number }
    segmentScore: number
    normalDistancePx: number
  } | null = null
  let bestBindingScore = Number.POSITIVE_INFINITY
  for (const candidateSide of picked.orderedCandidates) {
    const strictMatch = findBestSegment({
      side: candidateSide,
      bounds: params.bounds,
      segments: params.segments,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
    })
    const relaxedMatch = strictMatch
      ? null
      : findBestSegment({
          side: candidateSide,
          bounds: params.bounds,
          segments: params.segments,
          referenceWallThicknessPx: params.referenceWallThicknessPx,
          relaxed: true,
        })
    for (const match of [strictMatch, relaxedMatch]) {
      if (!match) continue
      const segment = params.segments[match.segmentIndex]
      if (!segment) continue
      const bindingScore = resolveBindingScore({
        side: candidateSide,
        segmentScore: match.segmentScore,
        hasTouch,
      })
      if (bindingScore >= bestBindingScore) continue
      bestBindingScore = bindingScore
      selectedSide = candidateSide
      segmentMatch = match
    }
  }
  if (!segmentMatch || !selectedSide) return null
  const segment = params.segments[segmentMatch.segmentIndex]
  if (!segment) return null

  const shiftX = segmentMatch.projected.x - selectedSide.sideMid.x
  const shiftY = segmentMatch.projected.y - selectedSide.sideMid.y
  return {
    doorId: params.door.id,
    segmentIndex: segmentMatch.segmentIndex,
    junctionAId: segment.junctionAId,
    junctionBId: segment.junctionBId,
    t: round2(segmentMatch.t),
    openingAxis: selectedSide.axis,
    outwardSign: selectedSide.outwardSign,
    contactScore: round2(selectedSide.score),
    secondaryContactScore: round2(picked.secondScore),
    snappedBBox: {
      x: round2(params.door.bbox.x + shiftX),
      y: round2(params.door.bbox.y + shiftY),
      width: round2(params.door.bbox.width),
      height: round2(params.door.bbox.height),
    },
  }
}
