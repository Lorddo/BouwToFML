/** V3 Laag 5 — Copy(6) cleanup + dangling/near weld (geen seal / geen L6-weld). */
import { noteRollback, tally } from '@/core/diagnostics'
import type { Segment } from '@/cv/port/wallGraph'
import { reportPipelineProgress } from '@/cv/pipeline/pipeline-progress'
import type { RoomWallFaceSkeleton, RoomWallJunction } from '../room-wall-skeleton-types'
import {
  mergeSameLineSegments,
  cleanupTxMicroSegments,
  cleanupLlStairs,
  cleanupMicroLoops,
} from './engines/cleanup'
import {
  cloneSegments,
  dedupeExactSegments,
  dropZeroLengthSegments,
  rebuildFaceFromSegments,
  segmentSetChanged,
} from './engines/segment-ops'
import { repairDanglingConnections } from './engines/weld'
import { validateConnectivity } from './engines/topology'
import { resolveLayer5CleanupPolicy } from './policies/layer-5'
import type { Layer5CleanupPolicy } from './engines/policy-types'
import type { PipelineV3Layer4Result, PipelineV3Layer5Result } from './types'

/** L5 accept grid (0.01px) + template — same buckets as former Math.round(v*100)/100 keys. */
const LAYER5_ACCEPT_IDENTITY = { gridPx: 0.01, includeTemplateIndex: true } as const

// ESC:W-16 (B)
/**
 * Compact incidental ≤eps zeros/dupes before connectivity guard.
 * Without this, same-line/tx/ll-stair are rejected on large faces because a
 * crushed micro elsewhere yields `zero-length segment ontstaan`, and the
 * useful T-stub reconnect never lands (BouwTek11 @645,243).
 */
function compactCandidate(segments: Segment[], policy: Layer5CleanupPolicy): Segment[] {
  const compacted = dropZeroLengthSegments(segments, policy.weld.endpointEpsPx)
  const deduped = dedupeExactSegments(compacted.segments, policy.weld.endpointEpsPx).segments
  tally('W-16', deduped.length !== segments.length ? 'compacted' : 'noop')
  return deduped
}

// ESC:W-17 (B)
function tryAcceptStep(
  before: Segment[],
  candidate: Segment[],
  policy: Layer5CleanupPolicy,
): Segment[] | null {
  const compacted = compactCandidate(candidate, policy)
  if (!segmentSetChanged(before, compacted, LAYER5_ACCEPT_IDENTITY)) {
    tally('W-17', 'unchanged')
    return null
  }
  const guard = validateConnectivity(before, compacted, policy.topology, policy.weld)
  if (!guard.ok) {
    tally('W-17', 'connectivity_reject')
    return null
  }
  tally('W-17', 'accepted')
  return compacted
}

export function runLayer5Cleanup(params: {
  layer4: PipelineV3Layer4Result
  referenceWallThicknessPx?: number
}): PipelineV3Layer5Result {
  reportPipelineProgress('Skeleton Laag 5…')
  const policy = resolveLayer5CleanupPolicy(params.referenceWallThicknessPx)
  const facesCleaned: RoomWallFaceSkeleton[] = []
  const allSegmentsCleaned: Segment[] = []
  const allJunctionsCleaned: RoomWallJunction[] = []
  let sameLineMerged = 0
  let microRemoved = 0
  let stairCollapsed = 0
  let loopCollapsed = 0
  let repairedDangling = 0
  let weldedNear = 0
  let zeroLengthRemoved = 0
  let dedupedCount = 0
  let iterations = 0

  for (const face of params.layer4.facesPositioned) {
    let work = cloneSegments(face.segments)
    let convergedEarly = false

    for (let iter = 0; iter < policy.maxIterations; iter += 1) {
      iterations += 1
      let changed = false

      {
        const next = mergeSameLineSegments(work, policy)
        if (next.mergedClusterCount > 0) {
          const accepted = tryAcceptStep(work, next.segments, policy)
          if (accepted) {
            work = accepted
            sameLineMerged += next.mergedSegmentCount
            changed = true
          }
        }
      }

      {
        const next = cleanupTxMicroSegments(work, policy)
        if (next.removedCount > 0) {
          const accepted = tryAcceptStep(work, next.segments, policy)
          if (accepted) {
            work = accepted
            microRemoved += next.removedCount
            changed = true
          }
        }
      }

      {
        const next = cleanupLlStairs(work, policy)
        if (next.collapsedCount > 0) {
          const accepted = tryAcceptStep(work, next.segments, policy)
          if (accepted) {
            work = accepted
            stairCollapsed += next.collapsedCount
            changed = true
          }
        }
      }

      {
        const next = cleanupMicroLoops(work, policy)
        if (next.removedCount > 0) {
          const accepted = tryAcceptStep(work, next.segments, policy)
          if (accepted) {
            work = accepted
            loopCollapsed += next.removedCount
            changed = true
          }
        }
      }

      {
        const compacted = dropZeroLengthSegments(work, policy.weld.endpointEpsPx)
        const deduped = dedupeExactSegments(compacted.segments, policy.weld.endpointEpsPx)
        if (compacted.removed > 0 || deduped.removed > 0) {
          const accepted = tryAcceptStep(work, deduped.segments, policy)
          if (accepted) {
            work = accepted
            zeroLengthRemoved += compacted.removed
            dedupedCount += deduped.removed
            changed = true
          }
        }
      }

      {
        const repaired = repairDanglingConnections(work, policy.weld)
        if (repaired.repairedCount > 0 || repaired.weldedCount > 0) {
          const accepted = tryAcceptStep(work, repaired.segments, policy)
          if (accepted) {
            work = accepted
            repairedDangling += repaired.repairedCount
            weldedNear += repaired.weldedCount
            changed = true
          }
        }
      }

      if (!changed) {
        convergedEarly = true
        break
      }
    }
    // ESC:W-24 (A)
    tally('W-24', convergedEarly ? 'converged' : 'max_iterations')

    // ESC:W-18 (B)
    const finalCompacted = compactCandidate(work, policy)
    const finalGuard = validateConnectivity(
      face.segments,
      finalCompacted,
      policy.topology,
      policy.weld,
    )
    if (finalGuard.ok) {
      tally('W-18', 'accepted')
      work = finalCompacted
    } else {
      tally('W-18', 'rolled_back_to_L4')
      noteRollback(
        'W-18',
        'layer-5-cleanup.runLayer5Cleanup',
        'finale connectivity-guard afgekeurd; terug naar L4-face',
      )
      work = cloneSegments(face.segments)
    }

    const cleanedFace = rebuildFaceFromSegments(face, work, policy.weld, policy.junction)
    facesCleaned.push(cleanedFace)
    allSegmentsCleaned.push(...cleanedFace.segments)
    allJunctionsCleaned.push(...cleanedFace.junctions)
  }

  return {
    facesCleaned,
    allSegmentsCleaned,
    allJunctionsCleaned,
    totalSegmentsCleaned: allSegmentsCleaned.length,
    totalJunctionsCleaned: allJunctionsCleaned.length,
    cleanupStats: {
      sameLineMerged,
      microRemoved,
      stairCollapsed,
      loopCollapsed,
      /** Copy6 reported repairedDangling separately; fold into weldedNear for typed stats. */
      weldedNear: weldedNear + repairedDangling,
      zeroLengthRemoved,
      dedupedCount,
      endpointSealed: 0,
      iterations,
    },
  }
}
