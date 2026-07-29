import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import type { WallGraph } from '@/cv/port/wallJunctionGraph'
import type { Segment } from '@/cv/port/wallGraph'
import { weldNearEndpoints } from '../weld'
import type { WeldPolicy } from '../policy-types'

/** Match CURRENT weld-then-graph (eps 1.25) for kind counts. */
const CONNECTOR_GRAPH_WELD: WeldPolicy = {
  layerId: 6,
  nearEndpointGapPx: 1.25,
  endpointEpsPx: 1.25,
  repairMaxGapPx: 0,
}

export function prepareSegmentsForConnectorGraph(segments: Segment[]): Segment[] {
  return weldNearEndpoints(segments, CONNECTOR_GRAPH_WELD)
}

/** Weld near endpoints then buildJunctionGraph(snap=0). */
export function buildConnectorJunctionGraph(segments: Segment[]) {
  const welded = prepareSegmentsForConnectorGraph(segments)
  return buildJunctionGraph(welded, 0)
}

export type Layer6JunctionKindCounts = Record<'I' | 'L' | 'T' | 'X', number>

/** Kind-telling uit een reeds gebouwde connector-graph (geen rebuild). */
export function kindCountsFromGraph(graph: WallGraph): Layer6JunctionKindCounts {
  const counts: Layer6JunctionKindCounts = { I: 0, L: 0, T: 0, X: 0 }
  for (const node of graph.nodes) counts[node.kind] += 1
  return counts
}

export function countLayer6JunctionKinds(segments: Segment[]): Layer6JunctionKindCounts {
  return kindCountsFromGraph(buildConnectorJunctionGraph(segments))
}

export type BaselineJunctionRef = { x: number; y: number; kind: 'I' | 'L' | 'T' | 'X' }
export type BaselineTxJunctionRef = { x: number; y: number; kind: 'T' | 'X' }
export type BaselineLJunctionRef = { x: number; y: number; kind: 'L' }

/** T/X-refs uit een reeds gebouwde connector-graph. */
export function txRefsFromGraph(graph: WallGraph): BaselineTxJunctionRef[] {
  return graph.nodes
    .filter((node) => node.kind === 'T' || node.kind === 'X')
    .map((node) => ({ x: node.x, y: node.y, kind: node.kind as 'T' | 'X' }))
}

/** L-refs uit een reeds gebouwde connector-graph. */
export function lRefsFromGraph(graph: WallGraph): BaselineLJunctionRef[] {
  return graph.nodes
    .filter((node) => node.kind === 'L')
    .map((node) => ({ x: node.x, y: node.y, kind: 'L' as const }))
}

/** Zelfde check als `baselineTxJunctionsPreserved` maar tegen een reeds gebouwde graph. */
export function txJunctionsPreservedInGraph(
  baseline: BaselineTxJunctionRef[],
  graph: WallGraph,
  radiusPx: number,
): boolean {
  if (baseline.length === 0) return true
  for (const ref of baseline) {
    const near = graph.nodes
      .filter((node) => {
        if (Math.hypot(node.x - ref.x, node.y - ref.y) > radiusPx) return false
        if (ref.kind === 'T') return node.kind === 'T' || node.kind === 'X'
        return node.kind === 'X'
      })
      .sort(
        (a, b) =>
          Math.hypot(a.x - ref.x, a.y - ref.y) - Math.hypot(b.x - ref.x, b.y - ref.y),
      )[0]
    if (!near) return false
  }
  return true
}

/** L-baseline vs graph: knoop binnen radius mag geen I zijn (gat). */
export function lJunctionsPreservedInGraph(
  baseline: BaselineLJunctionRef[],
  graph: WallGraph,
  radiusPx: number,
): boolean {
  if (baseline.length === 0) return true
  for (const ref of baseline) {
    const near = graph.nodes
      .filter((node) => Math.hypot(node.x - ref.x, node.y - ref.y) <= radiusPx)
      .sort(
        (a, b) =>
          Math.hypot(a.x - ref.x, a.y - ref.y) - Math.hypot(b.x - ref.x, b.y - ref.y),
      )[0]
    if (!near) continue
    if (near.kind === 'I') return false
  }
  return true
}

/** T/X mogen niet dalen (T→X telt als behoud); I mag niet stijgen. L mag dalen bij upgrade. */
function layer6JunctionKindsDegraded(
  baseline: Layer6JunctionKindCounts,
  current: Layer6JunctionKindCounts,
): boolean {
  const baselineTx = baseline.T + baseline.X
  const currentTx = current.T + current.X
  if (currentTx < baselineTx) return true
  if (current.X < baseline.X) return true
  if (current.I > baseline.I) return true
  return false
}

export function collectBaselineTxJunctions(segments: Segment[]): BaselineTxJunctionRef[] {
  return txRefsFromGraph(buildConnectorJunctionGraph(segments))
}

/** Elke baseline T/X moet in de output nog T/X zijn (binnen radius). */
export function baselineTxJunctionsPreserved(
  baseline: BaselineTxJunctionRef[],
  segments: Segment[],
  radiusPx: number,
): boolean {
  if (baseline.length === 0) return true
  return txJunctionsPreservedInGraph(baseline, buildConnectorJunctionGraph(segments), radiusPx)
}

export function layer6RepairTopologyOk(params: {
  baselineSegments: Segment[]
  repairedSegments: Segment[]
}): boolean {
  const baselineKinds = countLayer6JunctionKinds(params.baselineSegments)
  const repairedKinds = countLayer6JunctionKinds(params.repairedSegments)
  return !layer6JunctionKindsDegraded(baselineKinds, repairedKinds)
}
