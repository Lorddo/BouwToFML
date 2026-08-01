/**
 * L5 cleanup — Copy(6) T/X micro-stub collapse.
 */
import { tally } from '@/core/diagnostics'
import type { Segment } from '@/cv/port/wallGraph'
import { segmentAngleDeg, segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import {
  cloneSegments,
  incidentAt,
  removeSegmentAt,
  replaceEndpoint,
  dropZeroLengthSegments,
} from '../segment-ops'
import { PIPELINE_HV_ANGLE_TOL_DEG } from '../scale'
import { validateConnectivity } from '../topology'
import type { Layer5CleanupPolicy } from '../policy-types'

function isRemovableTxStub(seg: Segment, maxPx: number): boolean {
  const len = segmentLength(seg)
  if (len > maxPx) return false
  if (len <= 3) return true
  const dx = Math.abs(seg.a.x - seg.b.x)
  const dy = Math.abs(seg.a.y - seg.b.y)
  const deg = Math.abs(segmentAngleDeg(seg))
  const horizontal = deg <= PIPELINE_HV_ANGLE_TOL_DEG || deg >= 180 - PIPELINE_HV_ANGLE_TOL_DEG
  const vertical = Math.abs(deg - 90) <= PIPELINE_HV_ANGLE_TOL_DEG
  return (horizontal && dy <= 2.5) || (vertical && dx <= 2.5)
}

export function cleanupTxMicroSegments(
  segments: Segment[],
  policy: Layer5CleanupPolicy,
): { segments: Segment[]; removedCount: number } {
  const microMaxPx = policy.txZoneMaxPx
  const work = cloneSegments(segments)
  let removedCount = 0

  let i = 0
  while (i < work.length) {
    const seg = work[i]
    if (!isRemovableTxStub(seg, microMaxPx)) {
      i += 1
      continue
    }
    const atA = incidentAt(work, seg.a).filter((item) => item.segIndex !== i)
    const atB = incidentAt(work, seg.b).filter((item) => item.segIndex !== i)
    const isTxZone = atA.length >= 2 || atB.length >= 2
    if (!isTxZone) {
      i += 1
      continue
    }
    // Junction↔junction micro (both ends hubs) is a short wall between real T/X,
    // not a T-stub. Collapsing merges opposite T's into X and yanks hosts (2D_3E
    // @(221.7,1355)↔(230.9,1355)).
    if (atA.length >= 2 && atB.length >= 2) {
      i += 1
      continue
    }
    const hubIsA =
      atA.length > atB.length ? true : atB.length > atA.length ? false : atA.length >= 2
    const leafIncidents = hubIsA ? atB : atA
    if (leafIncidents.length === 0) {
      i += 1
      continue
    }

    // ESC:W-20 (B)
    // Apply on a candidate so one bad stub cannot poison the whole batch
    // (full-face tx was rejected for "losse delen" while this T needed reconnect).
    const candidate = cloneSegments(work)
    const candSeg = candidate[i]
    const candHub = hubIsA ? candSeg.a : candSeg.b
    const candLeaf = hubIsA ? candSeg.b : candSeg.a
    const moved = replaceEndpoint(candidate, candLeaf, candHub)
    // Stub leaf itself always matches — require ≥1 other endpoint reconnected.
    if (moved <= 1) {
      tally('W-20', 'moved_insufficient')
      i += 1
      continue
    }
    removeSegmentAt(candidate, i)
    const compacted = dropZeroLengthSegments(candidate, policy.weld.endpointEpsPx).segments
    const guard = validateConnectivity(work, compacted, policy.topology, policy.weld)
    if (!guard.ok) {
      tally('W-20', 'connectivity_reject')
      i += 1
      continue
    }
    tally('W-20', 'accepted')
    work.length = 0
    work.push(...compacted)
    removedCount += 1
    // indices shifted — restart scan from i (same position is next segment)
  }

  const cleaned = dropZeroLengthSegments(work, policy.weld.endpointEpsPx)
  return { segments: cleaned.segments, removedCount: removedCount + cleaned.removed }
}
