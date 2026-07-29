/**
 * Micro corner-jog absorb — L10 FML prep.
 *
 * Pattern: hard L (~90°) — short H/V stub — fake L (~0°, collinear continuation).
 * Removes the stub and welds the continuation onto the hard corner so FML gets
 * one clean orthogonal L instead of a 0° junk junction.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { cloneSegments, removeSegmentAt, replaceSegmentEndpoint } from '../segment-ops'
import type { CollapsePolicy } from '../policy-types'
import {
  buildExactAdjacency,
  exactPointKey,
  otherIncidentSegIndex,
  segmentAxis,
  turnAngleDegAtPoint,
  uniqueIncidentCount,
  type ExactPoint,
} from './adjacency'

export interface MicroCornerStats {
  cornersAbsorbed: number
  segmentsRemoved: number
}

type MicroCornerHit = {
  stubIndex: number
  continuationIndex: number
  hardPoint: ExactPoint
  fakePoint: ExactPoint
}

function tryCollectMicroCorner(params: {
  stubIndex: number
  segments: Segment[]
  adjacency: ReturnType<typeof buildExactAdjacency>
  policy: CollapsePolicy
  hvBandPx: number
}): MicroCornerHit | null {
  const stub = params.segments[params.stubIndex]!
  const stubLen = segmentLength(stub)
  if (stubLen <= 0 || stubLen > params.policy.microCornerMaxPx) return null

  const stubAxis = segmentAxis(stub, params.stubIndex, params.hvBandPx)
  if (stubAxis !== 'H' && stubAxis !== 'V') return null

  const nodeA = params.adjacency.get(exactPointKey(stub.a))
  const nodeB = params.adjacency.get(exactPointKey(stub.b))
  if (!nodeA || !nodeB) return null
  if (uniqueIncidentCount(nodeA) !== 2 || uniqueIncidentCount(nodeB) !== 2) return null

  const armAIndex = otherIncidentSegIndex(nodeA, params.stubIndex)
  const armBIndex = otherIncidentSegIndex(nodeB, params.stubIndex)
  if (armAIndex == null || armBIndex == null) return null

  const pointA: ExactPoint = { x: nodeA.x, y: nodeA.y }
  const pointB: ExactPoint = { x: nodeB.x, y: nodeB.y }
  const angleA = turnAngleDegAtPoint(pointA, params.stubIndex, armAIndex, params.segments)
  const angleB = turnAngleDegAtPoint(pointB, params.stubIndex, armBIndex, params.segments)

  let hardPoint: ExactPoint
  let fakePoint: ExactPoint
  let hardArmIndex: number
  let continuationIndex: number

  if (angleA >= params.policy.structuralLDeg && angleB < params.policy.collinearMaxDeg) {
    hardPoint = pointA
    fakePoint = pointB
    hardArmIndex = armAIndex
    continuationIndex = armBIndex
  } else if (angleB >= params.policy.structuralLDeg && angleA < params.policy.collinearMaxDeg) {
    hardPoint = pointB
    fakePoint = pointA
    hardArmIndex = armBIndex
    continuationIndex = armAIndex
  } else {
    return null
  }

  const hardAxis = segmentAxis(params.segments[hardArmIndex]!, hardArmIndex, params.hvBandPx)
  const contAxis = segmentAxis(
    params.segments[continuationIndex]!,
    continuationIndex,
    params.hvBandPx,
  )
  // Hard arm must be perpendicular; continuation collinear with the stub.
  if (hardAxis == null || hardAxis === stubAxis) return null
  if (contAxis !== stubAxis) return null

  return {
    stubIndex: params.stubIndex,
    continuationIndex,
    hardPoint,
    fakePoint,
  }
}

/**
 * Absorb micro corner-jogs into one clean orthogonal L.
 * L10 only (`enableMicroCornerAbsorb`).
 */
export function absorbMicroCornerJogs(
  segments: Segment[],
  policy: CollapsePolicy,
): { segments: Segment[]; stats: MicroCornerStats } {
  if (!policy.enableMicroCornerAbsorb) {
    throw new Error('V3 absorbMicroCornerJogs: disabled for this layer policy')
  }

  const work = cloneSegments(segments)
  const hvBandPx = policy.hvBandPx
  let cornersAbsorbed = 0
  let segmentsRemoved = 0

  let changed = true
  while (changed) {
    changed = false
    const adjacency = buildExactAdjacency(work)
    for (let stubIndex = 0; stubIndex < work.length; stubIndex += 1) {
      const hit = tryCollectMicroCorner({
        stubIndex,
        segments: work,
        adjacency,
        policy,
        hvBandPx,
      })
      if (!hit) continue

      // Weld continuation onto the hard corner, then drop the stub.
      replaceSegmentEndpoint(work, hit.continuationIndex, hit.fakePoint, hit.hardPoint, 0)
      removeSegmentAt(work, hit.stubIndex)
      cornersAbsorbed += 1
      segmentsRemoved += 1
      changed = true
      break
    }
  }

  return {
    segments: work,
    stats: { cornersAbsorbed, segmentsRemoved },
  }
}
