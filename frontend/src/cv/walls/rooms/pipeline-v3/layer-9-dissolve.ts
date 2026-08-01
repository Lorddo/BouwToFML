/**
 * V3 Laag 9 — dissolve: chain + stair-stub + parallel-cover (CURRENT + cover).
 */
import { tally } from '@/core/diagnostics'
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
  collapseOrthoStairStubs,
  parallelCoverAbsorb,
} from './engines/collapse'
import { dedupeExactSegments, rebuildFaceFromSegments } from './engines/segment-ops'
import { resolveLayer9DissolvePolicy } from './policies/layer-9'
import type { PipelineV3Layer8Result, PipelineV3Layer9Result } from './types'

export function runLayer9Dissolve(params: {
  layer8: PipelineV3Layer8Result
  cv: OpenCV
  maskRle: RoomWallMaskRle
  referenceWallThicknessPx?: number
  /** Injected wall distance map (same maskRle); built once if omitted. */
  distanceMap?: Float32Array | null
}): PipelineV3Layer9Result {
  reportPipelineProgress('Skeleton Laag 9 — dissolve (chain/stub/cover)…')
  const policy = resolveLayer9DissolvePolicy(params.referenceWallThicknessPx)
  const distanceMap =
    params.distanceMap !== undefined
      ? params.distanceMap
      : (buildWallDistanceMap({ cv: params.cv, maskRle: params.maskRle })?.distanceMap ?? null)

  const facesCollapsed: RoomWallFaceSkeleton[] = []
  const allSegmentsCollapsed: Segment[] = []
  const allJunctionsCollapsed: RoomWallJunction[] = []

  let chainsCollapsed = 0
  let segmentsRemoved = 0
  let fakeLRemoved = 0
  let stubsCollapsed = 0
  let stubSegmentsRemoved = 0
  let parallelCovered = 0
  let parallelSegmentsRemoved = 0
  let dedupedCount = 0
  let facesSkippedTopology = 0
  let facesSkippedStubTopology = 0
  let facesSkippedCoverTopology = 0

  for (const face of params.layer8.facesFinalized) {
    const thicknessBySegment = buildThicknessBySegment({
      segments: face.segments,
      cv: params.cv,
      maskRle: params.maskRle,
      policy: policy.collapse,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
      distanceMap,
    })
    // ESC:W-49 (B)
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
    tally('W-49', chainGuard.preserved ? 'chain_accepted' : 'chain_rolled_back')
    if (!chainGuard.preserved) {
      facesSkippedTopology += 1
    } else {
      chainsCollapsed += chainGuard.result.stats.chainsCollapsed
      segmentsRemoved += chainGuard.result.stats.segmentsRemoved
      fakeLRemoved += chainGuard.result.stats.fakeLRemoved
    }

    const stubGuard = withTopologyGuard({
      segments: segmentsOut,
      policy: policy.collapse,
      apply: (segments) => collapseOrthoStairStubs(segments, policy.collapse),
    })
    tally('W-49', stubGuard.preserved ? 'stub_accepted' : 'stub_rolled_back')
    if (stubGuard.preserved) {
      segmentsOut = stubGuard.segments
      if (stubGuard.result.stats.stubsCollapsed > 0) {
        stubsCollapsed += stubGuard.result.stats.stubsCollapsed
        stubSegmentsRemoved += stubGuard.result.stats.segmentsRemoved
      }
    } else {
      facesSkippedStubTopology += 1
    }

    const coverGuard = withTopologyGuard({
      segments: segmentsOut,
      policy: policy.collapse,
      apply: (segments) => parallelCoverAbsorb(segments, policy.collapse),
    })
    tally('W-49', coverGuard.preserved ? 'cover_accepted' : 'cover_rolled_back')
    if (coverGuard.preserved) {
      segmentsOut = coverGuard.segments
      if (coverGuard.result.stats.coveredCount > 0) {
        parallelCovered += coverGuard.result.stats.coveredCount
        parallelSegmentsRemoved += coverGuard.result.stats.segmentsRemoved
      }
    } else {
      facesSkippedCoverTopology += 1
    }

    const deduped = dedupeExactSegments(segmentsOut, 0)
    dedupedCount += deduped.removed

    const collapsedFace = rebuildFaceFromSegments(
      face,
      deduped.segments,
      policy.weld,
      policy.junction,
    )
    facesCollapsed.push(collapsedFace)
    allSegmentsCollapsed.push(...deduped.segments)
    allJunctionsCollapsed.push(...collapsedFace.junctions)
  }

  return {
    facesCollapsed,
    allSegmentsCollapsed,
    allJunctionsCollapsed,
    totalSegmentsCollapsed: allSegmentsCollapsed.length,
    totalJunctionsCollapsed: allJunctionsCollapsed.length,
    collapseStats: {
      chainsCollapsed,
      segmentsRemoved,
      fakeLRemoved,
      stubsCollapsed,
      stubSegmentsRemoved,
      parallelCovered,
      parallelSegmentsRemoved,
      dedupedCount,
      facesSkippedTopology,
      facesSkippedStubTopology,
      facesSkippedCoverTopology,
    },
  }
}
