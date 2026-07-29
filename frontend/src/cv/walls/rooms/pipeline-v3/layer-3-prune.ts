/** V3 Laag 3 — I-spur prune only (CURRENT behavior, engines/prune + policy). */
import type { Segment } from '@/cv/port/wallGraph'
import { reportPipelineProgress } from '@/cv/pipeline/pipeline-progress'
import type { RoomWallFaceSkeleton, RoomWallJunction } from '../room-wall-skeleton-types'
import { pruneISpurs } from './engines/prune'
import { rebuildFaceJunctionsOnly } from './engines/segment-ops'
import { resolveLayer3PrunePolicy } from './policies/layer-3'
import type { PipelineV3Layer2Result, PipelineV3Layer3Result } from './types'

export function runLayer3Prune(params: {
  layer2: PipelineV3Layer2Result
  referenceWallThicknessPx?: number
}): PipelineV3Layer3Result {
  reportPipelineProgress('Skeleton Laag 3…')
  const policy = resolveLayer3PrunePolicy(params.referenceWallThicknessPx)
  const facesPruned: RoomWallFaceSkeleton[] = []
  const allSegmentsPruned: Segment[] = []
  const allJunctionsPruned: RoomWallJunction[] = []
  let removedPathCount = 0
  let removedSegmentCount = 0

  for (const face of params.layer2.facesClean) {
    const pruned = pruneISpurs(face.segments, policy)
    removedPathCount += pruned.pruneStats.removedPathCount
    removedSegmentCount += pruned.pruneStats.removedSegmentCount
    const prunedFace = rebuildFaceJunctionsOnly(face, pruned.segments, policy.junctionSnapPx)
    facesPruned.push(prunedFace)
    allSegmentsPruned.push(...prunedFace.segments)
    allJunctionsPruned.push(...prunedFace.junctions)
  }

  return {
    facesPruned,
    allSegmentsPruned,
    allJunctionsPruned,
    totalSegmentsPruned: allSegmentsPruned.length,
    totalJunctionsPruned: allJunctionsPruned.length,
    pruneStats: { removedPathCount, removedSegmentCount },
  }
}
