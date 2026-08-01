/**
 * V3 Laag 10 — FML input: final chain + axis straighten + micro corner-jog absorb after L9 dissolve.
 */
import { tally } from '@/core/diagnostics'
import type { RoomWallMaskRle } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { Segment } from '@/cv/port/wallGraph'
import { reportPipelineProgress } from '@/cv/pipeline/pipeline-progress'
import { buildWallDistanceMap } from '@/cv/walls/rooms/room-wall-segment-thickness'
import type { RoomWallFaceSkeleton, RoomWallJunction } from '../room-wall-skeleton-types'
import {
  absorbMicroCornerJogs,
  collapseInterJunctionChains,
  buildThicknessBySegment,
  straightenCollinearAxisChains,
  withTopologyGuard,
} from './engines/collapse'
import { dedupeExactSegments, rebuildFaceFromSegments } from './engines/segment-ops'
import { resolveLayer10FmlPolicy } from './policies/layer-10'
import type { PipelineV3Layer9Result, PipelineV3Layer10Result } from './types'

export function runLayer10Fml(params: {
  layer9: PipelineV3Layer9Result
  cv: OpenCV
  maskRle: RoomWallMaskRle
  referenceWallThicknessPx?: number
  /** Injected wall distance map (same maskRle); built once if omitted. */
  distanceMap?: Float32Array | null
}): PipelineV3Layer10Result {
  reportPipelineProgress('Skeleton Laag 10 — FML input…')
  const policy = resolveLayer10FmlPolicy(params.referenceWallThicknessPx)
  const distanceMap =
    params.distanceMap !== undefined
      ? params.distanceMap
      : (buildWallDistanceMap({ cv: params.cv, maskRle: params.maskRle })?.distanceMap ?? null)

  const facesReady: RoomWallFaceSkeleton[] = []
  const allSegmentsReady: Segment[] = []
  const allJunctionsReady: RoomWallJunction[] = []

  let chainsCollapsed = 0
  let segmentsRemoved = 0
  let fakeLRemoved = 0
  let chainsStraightened = 0
  let axisSegmentsAdjusted = 0
  let axisEndpointsAdjusted = 0
  let microCornersAbsorbed = 0
  let microCornerSegmentsRemoved = 0
  let dedupedCount = 0
  let facesSkippedTopology = 0
  let facesSkippedMicroTopology = 0

  for (const face of params.layer9.facesCollapsed) {
    const thicknessBySegment = buildThicknessBySegment({
      segments: face.segments,
      cv: params.cv,
      maskRle: params.maskRle,
      policy: policy.collapse,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
      distanceMap,
    })
    // ESC:W-50 (B)
    const chainGuard = withTopologyGuard({
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
    let segmentsOut = chainGuard.segments
    tally('W-50', chainGuard.preserved ? 'accepted' : 'rolled_back')
    if (!chainGuard.preserved) {
      facesSkippedTopology += 1
    } else {
      chainsCollapsed += chainGuard.result.stats.chainsCollapsed
      segmentsRemoved += chainGuard.result.stats.segmentsRemoved
      fakeLRemoved += chainGuard.result.stats.fakeLRemoved
    }

    // ESC:W-51 (A)
    // Axis polish before micro-corner so 0px / near-collinear H/V share one line.
    const straightened = straightenCollinearAxisChains(segmentsOut, policy.collapse)
    segmentsOut = straightened.segments
    tally('W-51', straightened.stats.chainsStraightened > 0 ? 'straightened' : 'noop')
    if (straightened.stats.chainsStraightened > 0) {
      chainsStraightened += straightened.stats.chainsStraightened
      axisSegmentsAdjusted += straightened.stats.segmentsAdjusted
      axisEndpointsAdjusted += straightened.stats.endpointsAdjusted
    }

    // ESC:W-52 (B)
    const microGuard = withTopologyGuard({
      segments: segmentsOut,
      policy: policy.collapse,
      apply: (segments) => absorbMicroCornerJogs(segments, policy.collapse),
    })
    tally('W-52', microGuard.preserved ? 'accepted' : 'rolled_back')
    if (microGuard.preserved) {
      segmentsOut = microGuard.segments
      if (microGuard.result.stats.cornersAbsorbed > 0) {
        microCornersAbsorbed += microGuard.result.stats.cornersAbsorbed
        microCornerSegmentsRemoved += microGuard.result.stats.segmentsRemoved
      }
    } else {
      facesSkippedMicroTopology += 1
    }

    const deduped = dedupeExactSegments(segmentsOut, 0)
    dedupedCount += deduped.removed

    const readyFace = rebuildFaceFromSegments(face, deduped.segments, policy.weld, policy.junction)
    facesReady.push(readyFace)
    allSegmentsReady.push(...deduped.segments)
    allJunctionsReady.push(...readyFace.junctions)
  }

  return {
    facesReady,
    allSegmentsReady,
    allJunctionsReady,
    totalSegmentsReady: allSegmentsReady.length,
    totalJunctionsReady: allJunctionsReady.length,
    fmlStats: {
      chainsCollapsed,
      segmentsRemoved,
      fakeLRemoved,
      chainsStraightened,
      axisSegmentsAdjusted,
      axisEndpointsAdjusted,
      microCornersAbsorbed,
      microCornerSegmentsRemoved,
      dedupedCount,
      facesSkippedTopology,
      facesSkippedMicroTopology,
    },
  }
}
