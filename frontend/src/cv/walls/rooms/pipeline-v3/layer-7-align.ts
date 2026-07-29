/**
 * V3 Laag 7 — inter-junction chain collapse (CURRENT golden).
 * No stub-collapse (that is L9 via enableStubCollapse).
 */
import type { RoomWallMaskRle } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { Segment } from '@/cv/port/wallGraph'
import { reportPipelineProgress } from '@/cv/pipeline/pipeline-progress'
import { buildWallDistanceMap } from '@/cv/walls/rooms/room-wall-segment-thickness'
import type { RoomWallFaceSkeleton, RoomWallJunction } from '../room-wall-skeleton-types'
import {
  collapseInterJunctionChains,
  buildThicknessBySegment,
  withTopologyGuard,
} from './engines/collapse'
import {
  dedupeExactSegments,
  rebuildFaceFromSegments,
} from './engines/segment-ops'
import { resolveLayer7AlignPolicy } from './policies/layer-7'
import type { PipelineV3Layer6Result, PipelineV3Layer7Result } from './types'

export function runLayer7Align(params: {
  layer6: PipelineV3Layer6Result
  cv: OpenCV
  maskRle: RoomWallMaskRle
  referenceWallThicknessPx?: number
  /** Injected wall distance map (same maskRle); built once if omitted. */
  distanceMap?: Float32Array | null
}): PipelineV3Layer7Result {
  reportPipelineProgress('Skeleton Laag 7 — keten-collapse…')
  const policy = resolveLayer7AlignPolicy(params.referenceWallThicknessPx)
  const distanceMap =
    params.distanceMap !== undefined
      ? params.distanceMap
      : (buildWallDistanceMap({ cv: params.cv, maskRle: params.maskRle })?.distanceMap ?? null)

  const facesAligned: RoomWallFaceSkeleton[] = []
  const allSegmentsAligned: Segment[] = []
  const allJunctionsAligned: RoomWallJunction[] = []

  let chainsCollapsed = 0
  let segmentsRemoved = 0
  let fakeLRemoved = 0
  let dedupedCount = 0
  let facesSkippedTopology = 0

  for (const face of params.layer6.facesRepaired) {
    const thicknessBySegment = buildThicknessBySegment({
      segments: face.segments,
      cv: params.cv,
      maskRle: params.maskRle,
      policy: policy.collapse,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
      distanceMap,
    })
    const guard = withTopologyGuard({
      segments: face.segments,
      policy: policy.collapse,
      apply: (segments) =>
        collapseInterJunctionChains({
          segments,
          thicknessBySegment,
          policy: policy.collapse,
          referenceWallThicknessPx: params.referenceWallThicknessPx,
        }),
    })
    const segmentsOut = guard.segments
    if (!guard.preserved) {
      facesSkippedTopology += 1
    } else {
      chainsCollapsed += guard.result.stats.chainsCollapsed
      segmentsRemoved += guard.result.stats.segmentsRemoved
      fakeLRemoved += guard.result.stats.fakeLRemoved
    }

    const deduped = dedupeExactSegments(segmentsOut, 0)
    dedupedCount += deduped.removed

    const alignedFace = rebuildFaceFromSegments(
      face,
      deduped.segments,
      policy.weld,
      policy.junction,
    )
    facesAligned.push(alignedFace)
    allSegmentsAligned.push(...deduped.segments)
    allJunctionsAligned.push(...alignedFace.junctions)
  }

  return {
    facesAligned,
    allSegmentsAligned,
    allJunctionsAligned,
    totalSegmentsAligned: allSegmentsAligned.length,
    totalJunctionsAligned: allJunctionsAligned.length,
    collapseStats: {
      chainsCollapsed,
      segmentsRemoved,
      fakeLRemoved,
      dedupedCount,
      facesSkippedTopology,
    },
  }
}
