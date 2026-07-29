/**
 * Topology / connectivity guard — Copy(6) L5 validateLayer5Connectivity.
 */
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { weldNearEndpoints } from '../weld'
import type { TopologyPolicy, WeldPolicy } from '../policy-types'

function componentCount(graph: ReturnType<typeof buildJunctionGraph>): number {
  const adjacency = new Map<string, string[]>()
  for (const node of graph.nodes) adjacency.set(node.id, [])
  for (const edge of graph.edges) {
    adjacency.get(edge.a)?.push(edge.b)
    adjacency.get(edge.b)?.push(edge.a)
  }
  const visited = new Set<string>()
  let components = 0
  for (const node of graph.nodes) {
    if (visited.has(node.id)) continue
    components += 1
    const stack = [node.id]
    visited.add(node.id)
    while (stack.length) {
      const current = stack.pop()!
      const next = adjacency.get(current) ?? []
      for (const id of next) {
        if (visited.has(id)) continue
        visited.add(id)
        stack.push(id)
      }
    }
  }
  return components
}

function prepareForGraph(
  segments: Segment[],
  policy: TopologyPolicy,
  weldPolicy?: WeldPolicy,
): Segment[] {
  if (!policy.weldBeforeGraph || !weldPolicy) return segments
  const microWeld: WeldPolicy = {
    ...weldPolicy,
    nearEndpointGapPx: policy.endpointEpsPx,
    repairMaxGapPx: 0,
  }
  return weldNearEndpoints(segments, microWeld)
}

export function validateConnectivity(
  before: Segment[],
  after: Segment[],
  policy: TopologyPolicy,
  weldPolicy?: WeldPolicy,
): { ok: boolean; reason?: string } {
  if (after.some((seg) => segmentLength(seg) < 1)) {
    return { ok: false, reason: 'zero-length segment ontstaan' }
  }
  const beforeGraph = buildJunctionGraph(
    prepareForGraph(before, policy, weldPolicy),
    policy.junctionSnapPx,
  )
  const afterGraph = buildJunctionGraph(
    prepareForGraph(after, policy, weldPolicy),
    policy.junctionSnapPx,
  )
  if (policy.enforceINodeCheck) {
    const iBefore = beforeGraph.nodes.filter((node) => node.kind === 'I').length
    const iAfter = afterGraph.nodes.filter((node) => node.kind === 'I').length
    if (iAfter > iBefore) {
      return { ok: false, reason: `nieuwe I-junctions: ${iBefore} -> ${iAfter}` }
    }
  }
  const componentsBefore = componentCount(beforeGraph)
  const componentsAfter = componentCount(afterGraph)
  if (componentsAfter > componentsBefore) {
    return {
      ok: false,
      reason: `losse delen toegenomen: ${componentsBefore} -> ${componentsAfter}`,
    }
  }
  return { ok: true }
}
