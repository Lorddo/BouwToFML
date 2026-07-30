/**
 * L5 cleanup — Copy(6) L-L stair micro collapse.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { segmentAngleDeg, segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { cloneSegments, incidentAt, removeSegmentAt, dropZeroLengthSegments } from '../segment-ops'
import { PIPELINE_HV_ANGLE_TOL_DEG } from '../scale'
import type { Layer5CleanupPolicy } from '../policy-types'

function undirectedAngleDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 180
  if (d > 90) d = 180 - d
  return d
}

function isNearHorizontal(seg: Segment): boolean {
  const deg = Math.abs(segmentAngleDeg(seg))
  return deg <= PIPELINE_HV_ANGLE_TOL_DEG || deg >= 180 - PIPELINE_HV_ANGLE_TOL_DEG
}

function isNearVertical(seg: Segment): boolean {
  const deg = Math.abs(segmentAngleDeg(seg))
  return Math.abs(deg - 90) <= PIPELINE_HV_ANGLE_TOL_DEG
}

function isHorizontal(seg: Segment): boolean {
  return Math.abs(seg.b.x - seg.a.x) >= Math.abs(seg.b.y - seg.a.y)
}

// ESC:W-23 (A)
export function cleanupLlStairs(
  segments: Segment[],
  policy: Layer5CleanupPolicy,
): { segments: Segment[]; collapsedCount: number } {
  const microMaxPx = policy.microMaxPx
  const work = cloneSegments(segments)
  let collapsedCount = 0

  let i = 0
  while (i < work.length) {
    const micro = work[i]
    const microLen = segmentLength(micro)
    if (microLen > microMaxPx) {
      i += 1
      continue
    }
    const atA = incidentAt(work, micro.a).filter((item) => item.segIndex !== i)
    const atB = incidentAt(work, micro.b).filter((item) => item.segIndex !== i)
    if (atA.length !== 1 || atB.length !== 1) {
      i += 1
      continue
    }
    const leftHit = atA[0]
    const rightHit = atB[0]
    // Re-fetch by index — `.segment` refs go stale after prior removals in this pass.
    const left = work[leftHit.segIndex]
    const right = work[rightHit.segIndex]
    if (!left || !right || leftHit.segIndex === rightHit.segIndex) {
      i += 1
      continue
    }
    // Both arms must be real walls, not another micro (Copy6 computed lens but never used).
    if (segmentLength(left) <= microLen || segmentLength(right) <= microLen) {
      i += 1
      continue
    }

    const angleDiff = undirectedAngleDiffDeg(segmentAngleDeg(left), segmentAngleDeg(right))
    const nearCollinear = angleDiff <= 25 || angleDiff >= 155
    const bothNearHorizontal = isNearHorizontal(left) && isNearHorizontal(right)
    const bothNearVertical = isNearVertical(left) && isNearVertical(right)
    const hvAligned =
      (isHorizontal(left) && isHorizontal(right) && bothNearHorizontal) ||
      (!isHorizontal(left) && !isHorizontal(right) && bothNearVertical)
    if (!nearCollinear && !hvAligned) {
      i += 1
      continue
    }

    const target = {
      x: (micro.a.x + micro.b.x) / 2,
      y: (micro.a.y + micro.b.y) / 2,
    }
    const leftPoint = leftHit.endpoint === 'a' ? left.a : left.b
    const rightPoint = rightHit.endpoint === 'a' ? right.a : right.b
    leftPoint.x = target.x
    leftPoint.y = target.y
    rightPoint.x = target.x
    rightPoint.y = target.y
    removeSegmentAt(work, i)
    collapsedCount += 1
  }

  const cleaned = dropZeroLengthSegments(work, policy.weld.endpointEpsPx)
  return { segments: cleaned.segments, collapsedCount }
}
