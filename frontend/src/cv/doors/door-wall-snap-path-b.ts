import type { SemanticWallSegment } from '@/core/extraction/types'
import { noteCascadeLevel } from '@/core/diagnostics'
import {
  measureSwingMaskSideContacts,
  paintSwingFaceMask,
  type SwingMaskSideContact,
} from './door-swing-mask'
import { segmentNearDoorCentroid } from './door-wall-snap-bind'
import { resolveCandidateSides, resolveSideMeta, round2 } from './door-wall-snap-geom'
import { findBestSegment, pickBestContactSide, resolveBindingScore } from './door-wall-snap-scoring'
import { DOOR_WALL_SNAP_TUNING, type BBoxBounds, type SideContact } from './door-wall-snap-tuning'
import type { BoundDoor, ResolvedDoorCandidate } from './types'

const T = DOOR_WALL_SNAP_TUNING

function swingContactToSideContact(contact: SwingMaskSideContact): SideContact {
  const sideMeta = resolveSideMeta(contact.side)
  return {
    side: contact.side,
    axis: sideMeta.axis,
    outwardSign: sideMeta.outwardSign,
    contactCount: contact.contactCount,
    sampleCount: Math.max(1, contact.sampleCount),
    sideCoverage: contact.sampleCount / Math.max(1, contact.sideLength),
    touchCoverage: contact.contactCount / Math.max(1, contact.sideLength),
    score: contact.score,
    proximityDistancePx: contact.proximityDistancePx,
    sideLength: contact.sideLength,
    sideMid: contact.sideMid,
  }
}

/**
 * Path B primair: as/side uit gemergde swing-mask ↔ muur (wallMask of adjacent
 * wall-bboxes) — niet uit wall-union aspect (dfH≥dfW faalt in hoeken).
 * ESC:D-48 (A) — AFBAKENEN 2026-07-31: Path B swing-mask blijft.
 */
// ESC:D-48 (A)
export function tryBindDoorViaSwingMaskContact(params: {
  door: ResolvedDoorCandidate
  doorBounds: BBoxBounds
  wallMask: Uint8Array
  width: number
  height: number
  labelsData: Int32Array
  parentMap: Map<number, number>
  segments: SemanticWallSegment[]
  referenceWallThicknessPx?: number
  adjacentWallBBoxes: BBoxBounds[]
}): BoundDoor | null {
  const swingMask = paintSwingFaceMask({
    labelsData: params.labelsData,
    parentMap: params.parentMap,
    width: params.width,
    height: params.height,
    faceIds: params.door.faceIds,
    bbox: params.door.bbox,
  })
  if (!swingMask) return null

  const contactDepthPx = Math.max(
    1,
    Math.round(
      (params.referenceWallThicknessPx ?? T.contactDepthFallbackPx) * T.contactDepthThicknessFactor,
    ),
  )
  const searchDepthPx = Math.max(
    contactDepthPx,
    Math.round(
      (params.referenceWallThicknessPx ?? T.contactDepthFallbackPx) * T.searchDepthThicknessFactor,
    ),
  )
  const swingContacts = measureSwingMaskSideContacts({
    mask: swingMask,
    wallMask: params.wallMask,
    width: params.width,
    height: params.height,
    contactDepthPx,
    searchDepthPx,
    wallBBoxes: params.adjacentWallBBoxes,
  })
  const allowedSides = new Set(resolveCandidateSides(params.doorBounds))
  const sideContacts = swingContacts
    .filter(
      (c) =>
        allowedSides.has(c.side) &&
        c.sampleCount > 0 &&
        (c.contactCount > 0 || Number.isFinite(c.proximityDistancePx)),
    )
    .map(swingContactToSideContact)
  const picked = pickBestContactSide(sideContacts)
  if (!picked) return null

  const spanBounds: BBoxBounds = {
    x0: swingMask.offsetX,
    y0: swingMask.offsetY,
    x1: swingMask.offsetX + swingMask.width,
    y1: swingMask.offsetY + swingMask.height,
  }

  let bestBindingScore = Number.POSITIVE_INFINITY
  let selectedSide: SideContact | null = null
  let segmentMatch: {
    segmentIndex: number
    t: number
    projected: { x: number; y: number }
    segmentScore: number
    normalDistancePx: number
  } | null = null

  for (const candidateSide of picked.orderedCandidates) {
    if (candidateSide.contactCount <= 0 && !Number.isFinite(candidateSide.proximityDistancePx)) {
      continue
    }
    // ESC:D-49 (A) — VERWIJDERD 2026-07-31: relaxed segment-match; alleen strikte match.
    const match = findBestSegment({
      side: candidateSide,
      bounds: spanBounds,
      segments: params.segments,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
    })
    if (!match) continue
    const segment = params.segments[match.segmentIndex]
    if (!segment) continue
    if (
      !segmentNearDoorCentroid({
        segment,
        doorBounds: params.doorBounds,
        referenceWallThicknessPx: params.referenceWallThicknessPx,
      })
    ) {
      continue
    }
    const bindingScore = resolveBindingScore({
      side: candidateSide,
      segmentScore: match.segmentScore,
      hasTouch: candidateSide.contactCount > 0,
    })
    if (bindingScore >= bestBindingScore) continue
    bestBindingScore = bindingScore
    selectedSide = candidateSide
    segmentMatch = match
  }
  if (!segmentMatch || !selectedSide) return null
  const segment = params.segments[segmentMatch.segmentIndex]
  if (!segment) return null

  noteCascadeLevel('D-48', 'door-wall-snap-path-b.tryBindDoorViaSwingMaskContact', 'swing_mask', {
    doorId: params.door.id,
  })

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
