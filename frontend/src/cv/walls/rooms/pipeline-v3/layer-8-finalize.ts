/**
 * V3 Laag 8 — finalize: bare HV (wall-mask distance map) + once I→L/T/X prune.
 * Golden: CURRENT layer-8-finalize. No L4 seal; no L9 stub absorb.
 */
import { tally } from '@/core/diagnostics'
import type { RoomWallMaskRle } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { Segment } from '@/cv/port/wallGraph'
import { reportPipelineProgress } from '@/cv/pipeline/pipeline-progress'
import { buildWallDistanceMap } from '@/cv/walls/rooms/room-wall-segment-thickness'
import type { RoomWallFaceSkeleton, RoomWallJunction } from '../room-wall-skeleton-types'
import { positionSegmentsHv } from './engines/hv'
import { pruneISpurs } from './engines/prune'
import {
  dedupeExactSegments,
  dropZeroLengthSegments,
  rebuildFaceFromSegments,
} from './engines/segment-ops'
import { weldNearEndpoints } from './engines/weld'
import { resolveLayer8FinalizePolicy } from './policies/layer-8'
import type { PipelineV3Layer7Result, PipelineV3Layer8Result } from './types'

function countJunctionKinds(junctions: RoomWallJunction[]): Record<'I' | 'L' | 'T' | 'X', number> {
  const counts: Record<'I' | 'L' | 'T' | 'X', number> = { I: 0, L: 0, T: 0, X: 0 }
  for (const junction of junctions) counts[junction.kind] += 1
  return counts
}

export function runLayer8Finalize(params: {
  layer7: PipelineV3Layer7Result
  cv?: OpenCV
  maskRle?: RoomWallMaskRle
  referenceWallThicknessPx?: number
  /** Injected wall distance map (same maskRle); built once if omitted. */
  distanceMap?: Float32Array | null
}): PipelineV3Layer8Result {
  reportPipelineProgress('Skeleton Laag 8 — H/V + I-prune…')
  const policy = resolveLayer8FinalizePolicy(params.referenceWallThicknessPx)

  const distanceMap =
    params.distanceMap !== undefined
      ? params.distanceMap
      : params.cv && params.maskRle
        ? (buildWallDistanceMap({ cv: params.cv, maskRle: params.maskRle })?.distanceMap ?? null)
        : null
  const width = params.maskRle?.width ?? 0
  const height = params.maskRle?.height ?? 0

  const facesFinalized: RoomWallFaceSkeleton[] = []
  const allSegmentsFinalized: Segment[] = []
  const allJunctionsFinalized: RoomWallJunction[] = []

  let movedSegmentCount = 0
  let movedJunctionCount = 0
  let removedPathCount = 0
  let removedSegmentCount = 0
  let zeroLengthRemoved = 0
  let dedupedCount = 0

  const junctionKindsBeforeHv = countJunctionKinds(params.layer7.allJunctionsAligned)

  for (const face of params.layer7.facesAligned) {
    const weldedBefore = weldNearEndpoints(face.segments, policy.weld)
    const hvInput = rebuildFaceFromSegments(face, weldedBefore, policy.weld, policy.junction)

    // ESC:W-47 (A)
    const positioned = positionSegmentsHv({
      face: hvInput,
      distanceMap,
      maskWidth: width,
      maskHeight: height,
      policy: policy.hv,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
    })
    movedSegmentCount += positioned.movedSegmentCount
    movedJunctionCount += positioned.movedJunctionCount
    tally('W-47', positioned.movedSegmentCount > 0 ? 'repositioned' : 'noop')

    const weldedAfterHv = weldNearEndpoints(positioned.face.segments, policy.weld)
    // ESC:W-48 (B)
    const pruned = pruneISpurs(weldedAfterHv, policy.prune)
    removedPathCount += pruned.pruneStats.removedPathCount
    removedSegmentCount += pruned.pruneStats.removedSegmentCount
    tally('W-48', pruned.pruneStats.removedPathCount > 0 ? 'pruned' : 'noop')

    const withoutZero = dropZeroLengthSegments(pruned.segments)
    zeroLengthRemoved += withoutZero.removed
    const deduped = dedupeExactSegments(withoutZero.segments, 0)
    dedupedCount += deduped.removed

    const finalizedFace = rebuildFaceFromSegments(
      face,
      deduped.segments,
      policy.weld,
      policy.junction,
    )
    facesFinalized.push(finalizedFace)
    allSegmentsFinalized.push(...finalizedFace.segments)
    allJunctionsFinalized.push(...finalizedFace.junctions)
  }

  const junctionKindsAfter = countJunctionKinds(allJunctionsFinalized)

  return {
    facesFinalized,
    allSegmentsFinalized,
    allJunctionsFinalized,
    totalSegmentsFinalized: allSegmentsFinalized.length,
    totalJunctionsFinalized: allJunctionsFinalized.length,
    finalizeStats: {
      movedSegmentCount,
      movedJunctionCount,
      removedPathCount,
      removedSegmentCount,
      zeroLengthRemoved,
      dedupedCount,
      junctionKindCountsBeforeHv: junctionKindsBeforeHv,
      junctionKindCountsAfter: junctionKindsAfter,
    },
  }
}
