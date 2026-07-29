/**
 * Topology preserve guard for chain collapse (CURRENT L7).
 */
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import type { Segment } from '@/cv/port/wallGraph'
import { cloneSegments } from '../segment-ops'
import { weldNearEndpoints } from '../weld'
import type { CollapsePolicy, WeldPolicy } from '../policy-types'

export type CollapseJunctionKindCounts = Record<'I' | 'L' | 'T' | 'X', number>

/** Match V2 buildPipelineV2JunctionGraph (eps=1, snap=0). */
function graphWeldPolicy(layerId: CollapsePolicy['layerId']): WeldPolicy {
  return {
    layerId,
    nearEndpointGapPx: 1,
    endpointEpsPx: 1,
    repairMaxGapPx: 0,
  }
}

export function buildCollapseJunctionGraph(
  segments: Segment[],
  policy: CollapsePolicy,
) {
  const welded = weldNearEndpoints(segments, graphWeldPolicy(policy.layerId))
  return buildJunctionGraph(welded, 0)
}

export function countJunctionKindsFromSegments(
  segments: Segment[],
  policy: CollapsePolicy,
): CollapseJunctionKindCounts {
  const graph = buildCollapseJunctionGraph(segments, policy)
  const counts: CollapseJunctionKindCounts = { I: 0, L: 0, T: 0, X: 0 }
  for (const node of graph.nodes) counts[node.kind] += 1
  return counts
}

function junctionEndpointsPreserved(
  segmentsBefore: Segment[],
  segmentsAfter: Segment[],
  policy: CollapsePolicy,
): boolean {
  const graphBefore = buildCollapseJunctionGraph(segmentsBefore, policy)
  const anchorPx = policy.junctionAnchorPx
  for (const node of graphBefore.nodes) {
    if (node.kind !== 'I' && node.kind !== 'T' && node.kind !== 'X') continue
    const hasEndpointAfter = segmentsAfter.some(
      (seg) =>
        Math.hypot(seg.a.x - node.x, seg.a.y - node.y) <= anchorPx
        || Math.hypot(seg.b.x - node.x, seg.b.y - node.y) <= anchorPx,
    )
    if (!hasEndpointAfter) return false
  }
  return true
}

/** T/X mogen niet dalen; I/T/X-eindpunten mogen niet in een through-lijn verdwijnen. */
export function topologyPreservedAfterCollapse(
  before: CollapseJunctionKindCounts,
  after: CollapseJunctionKindCounts,
  policy: CollapsePolicy,
  segmentsBefore?: Segment[],
  segmentsAfter?: Segment[],
): boolean {
  if (after.T < before.T || after.X < before.X) return false
  if (segmentsBefore && segmentsAfter) {
    return junctionEndpointsPreserved(segmentsBefore, segmentsAfter, policy)
  }
  return true
}

/**
 * kinds → apply → preserve. Callers keep skip-counters / stats bookkeeping.
 * On reject: returns a clone of input segments (L7/L9/L10 chain semantics).
 */
export function withTopologyGuard<T extends { segments: Segment[] }>(params: {
  segments: Segment[]
  policy: CollapsePolicy
  apply: (segments: Segment[]) => T
}): {
  preserved: boolean
  /** Segments to continue with (apply result if preserved, else clone of input). */
  segments: Segment[]
  /** Full apply result (always), for caller stats. */
  result: T
} {
  const kindsBefore = countJunctionKindsFromSegments(params.segments, params.policy)
  const result = params.apply(params.segments)
  const kindsAfter = countJunctionKindsFromSegments(result.segments, params.policy)
  const preserved = topologyPreservedAfterCollapse(
    kindsBefore,
    kindsAfter,
    params.policy,
    params.segments,
    result.segments,
  )
  return {
    preserved,
    segments: preserved ? result.segments : cloneSegments(params.segments),
    result,
  }
}
