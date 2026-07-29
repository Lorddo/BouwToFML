/**
 * I-spur prune engine — policy-driven.
 * L3: iterative shortest I→T/X.
 * L8: single sweep I→L/T/X with optional structural T/X protect.
 */
import {
  buildJunctionGraph,
  computeJunctionTurnAngleDeg,
  type WallEdge,
  type WallNode,
} from '@/cv/port/wallJunctionGraph'
import type { Segment } from '@/cv/port/wallGraph'
import { endpointNearPoint, segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { classifyLayer6Segment } from '../connector/segment-classify'
import { cloneSegments } from '../segment-ops'
import type { PrunePolicy, PruneTerminalKind } from '../policy-types'

export type ISpurTraceResult = {
  pathSegments: Segment[]
  pathLengthPx: number
  reachedTx: boolean
  reachedTerminal: boolean
  terminalNode?: WallNode
}

export type PruneISpursResult = {
  segments: Segment[]
  pruneStats: { removedPathCount: number; removedSegmentCount: number }
}

function edgeTouchesNode(edge: WallEdge, nodeId: string): boolean {
  return edge.a === nodeId || edge.b === nodeId
}

function otherNodeId(edge: WallEdge, nodeId: string): string | null {
  if (edge.a === nodeId) return edge.b
  if (edge.b === nodeId) return edge.a
  return null
}

function resolveSpurThresholdPx(policy: PrunePolicy): number {
  return policy.thicknessFallbackPx * policy.maxPathLengthRatio
}

function isTerminalKind(kind: WallNode['kind'], terminals: readonly PruneTerminalKind[]): boolean {
  return terminals.includes(kind as PruneTerminalKind)
}

/**
 * Micro near-endpoint weld so junction graph sees exact shared points.
 */
function weldNearEndpointsForGraph(segments: Segment[], weldGapPx: number): Segment[] {
  const work = cloneSegments(segments)
  let changed = true
  while (changed) {
    changed = false
    outer: for (let i = 0; i < work.length; i += 1) {
      const seg = work[i]!
      const refs: Array<{ segIndex: number; endpoint: 'a' | 'b'; point: { x: number; y: number } }> = [
        { segIndex: i, endpoint: 'a', point: seg.a },
        { segIndex: i, endpoint: 'b', point: seg.b },
      ]
      for (const ref of refs) {
        const group: Array<{ segIndex: number; endpoint: 'a' | 'b'; point: { x: number; y: number } }> = []
        const seen = new Set<string>()
        for (let j = 0; j < work.length; j += 1) {
          const candidate = work[j]!
          for (const endpoint of ['a', 'b'] as const) {
            const point = endpoint === 'a' ? candidate.a : candidate.b
            if (Math.hypot(point.x - ref.point.x, point.y - ref.point.y) > 1) continue
            const key = `${j}:${endpoint}`
            if (seen.has(key)) continue
            seen.add(key)
            group.push({ segIndex: j, endpoint, point: { x: point.x, y: point.y } })
          }
        }
        if (group.length < 2) continue

        let maxD = 0
        for (let a = 0; a < group.length; a += 1) {
          for (let b = a + 1; b < group.length; b += 1) {
            const d = Math.hypot(
              group[a]!.point.x - group[b]!.point.x,
              group[a]!.point.y - group[b]!.point.y,
            )
            if (d > maxD) maxD = d
          }
        }
        if (maxD <= 1e-6 || maxD > weldGapPx) continue

        const target = {
          x: group.reduce((sum, item) => sum + item.point.x, 0) / group.length,
          y: group.reduce((sum, item) => sum + item.point.y, 0) / group.length,
        }
        for (const item of group) {
          const s = work[item.segIndex]!
          if (item.endpoint === 'a') {
            s.a.x = target.x
            s.a.y = target.y
          } else {
            s.b.x = target.x
            s.b.y = target.y
          }
        }
        changed = true
        break outer
      }
    }
  }
  return work
}

export function buildPruneJunctionGraph(segments: Segment[], policy: PrunePolicy) {
  const welded = weldNearEndpointsForGraph(segments, policy.endpointEpsPx)
  return buildJunctionGraph(welded, policy.junctionSnapPx)
}

/** Trace vanaf I tot eerste terminal in policy.terminalKinds. */
function tracePathFromNodeToFirstTerminal(params: {
  graph: ReturnType<typeof buildJunctionGraph>
  startNode: WallNode
  terminalKinds: readonly PruneTerminalKind[]
}): ISpurTraceResult {
  const { graph, startNode, terminalKinds } = params
  const startEdges = graph.edges.filter((edge) => edgeTouchesNode(edge, startNode.id))
  if (startEdges.length !== 1) {
    return { pathSegments: [], pathLengthPx: 0, reachedTx: false, reachedTerminal: false }
  }

  const pathSegments: Segment[] = []
  let pathLengthPx = 0
  let incomingEdge = startEdges[0]!
  let currentNodeId = otherNodeId(incomingEdge, startNode.id)
  const maxHops = Math.max(1, graph.edges.length + 1)

  pathSegments.push(incomingEdge.segment)
  pathLengthPx += segmentLength(incomingEdge.segment)

  let hops = 0
  while (currentNodeId && hops < maxHops) {
    hops += 1
    const currentNode = graph.nodes.find((node) => node.id === currentNodeId)
    if (!currentNode) break
    if (isTerminalKind(currentNode.kind, terminalKinds)) {
      const reachedTx = currentNode.kind === 'T' || currentNode.kind === 'X'
      return {
        pathSegments,
        pathLengthPx,
        reachedTx,
        reachedTerminal: true,
        terminalNode: currentNode,
      }
    }

    const nextEdges = graph.edges.filter(
      (edge) => edgeTouchesNode(edge, currentNode.id) && edge.id !== incomingEdge.id,
    )
    if (nextEdges.length !== 1) break
    const nextEdge = nextEdges[0]!
    pathSegments.push(nextEdge.segment)
    pathLengthPx += segmentLength(nextEdge.segment)
    incomingEdge = nextEdge
    currentNodeId = otherNodeId(nextEdge, currentNode.id)
  }

  return { pathSegments, pathLengthPx, reachedTx: false, reachedTerminal: false }
}

function matchSegmentsUndirected(a: Segment, b: Segment, snapPx: number): boolean {
  const forward = endpointNearPoint(a.a, b.a, snapPx) && endpointNearPoint(a.b, b.b, snapPx)
  const reverse = endpointNearPoint(a.a, b.b, snapPx) && endpointNearPoint(a.b, b.a, snapPx)
  return forward || reverse
}

function removePathSegments(
  segments: Segment[],
  pathSegments: Segment[],
  snapPx: number,
): { segments: Segment[]; removedSegmentCount: number } {
  if (!pathSegments.length) {
    return { segments: cloneSegments(segments), removedSegmentCount: 0 }
  }
  const keep: Segment[] = []
  let removedSegmentCount = 0
  for (const seg of segments) {
    const isPath = pathSegments.some((pathSeg) => matchSegmentsUndirected(seg, pathSeg, snapPx))
    if (isPath) {
      removedSegmentCount += 1
      continue
    }
    keep.push({ ...seg, a: { ...seg.a }, b: { ...seg.b } })
  }
  return { segments: keep, removedSegmentCount }
}

function directionAwayFromNode(
  edge: WallEdge,
  nodeId: string,
  nodes: WallNode[],
): { x: number; y: number } | null {
  const otherId = edge.a === nodeId ? edge.b : edge.b === nodeId ? edge.a : null
  if (!otherId) return null
  const node = nodes.find((entry) => entry.id === nodeId)
  const other = nodes.find((entry) => entry.id === otherId)
  if (!node || !other) return null
  const dx = other.x - node.x
  const dy = other.y - node.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null
  return { x: dx / len, y: dy / len }
}

function pathIsStructuralHvOnly(
  pathSegments: Segment[],
  hvBandPx: number,
): boolean {
  return pathSegments.every((seg, index) => {
    const kind = classifyLayer6Segment(seg, index, hvBandPx).kind
    return kind === 'H' || kind === 'V'
  })
}

/** L8: bescherm T/X alleen bij structurele H/V-spur — L-terminals altijd prunebaar. */
function shouldProtectTxFromSpurPrune(params: {
  graph: ReturnType<typeof buildJunctionGraph>
  trace: ISpurTraceResult
  policy: PrunePolicy
  hvBandPx?: number
}): boolean {
  if (!params.policy.protectStructuralTx) return false
  const { graph, trace, policy } = params
  const terminal = trace.terminalNode
  if (!trace.reachedTerminal || !terminal || trace.pathSegments.length === 0) return false
  if (terminal.kind === 'L') return false
  const hvBandPx = params.hvBandPx ?? policy.hvBandPx
  if (!pathIsStructuralHvOnly(trace.pathSegments, hvBandPx)) return false
  if (terminal.kind !== 'T' && terminal.kind !== 'X') return false

  const remainingDirs: Array<{ x: number; y: number }> = []
  for (const edge of graph.edges) {
    if (edge.a !== terminal.id && edge.b !== terminal.id) continue
    if (
      trace.pathSegments.some((pathSeg) =>
        matchSegmentsUndirected(pathSeg, edge.segment, policy.endpointEpsPx),
      )
    ) {
      continue
    }
    const dir = directionAwayFromNode(edge, terminal.id, graph.nodes)
    if (dir) remainingDirs.push(dir)
  }

  const minRemaining = terminal.kind === 'T' ? 2 : 3
  if (remainingDirs.length < minRemaining) return true

  if (terminal.kind === 'T' && remainingDirs.length === 2) {
    const turnAngle = computeJunctionTurnAngleDeg(remainingDirs)
    if (turnAngle < policy.collinearMaxDeg) return true
  }

  return false
}

export function tracePathFromIToFirstTx(params: {
  segments: Segment[]
  iPoint: { x: number; y: number }
  policy: PrunePolicy
}): ISpurTraceResult {
  const graph = buildPruneJunctionGraph(params.segments, params.policy)
  const startNode =
    graph.nodes.find(
      (node) =>
        node.kind === 'I' && endpointNearPoint(node, params.iPoint, params.policy.endpointEpsPx),
    ) ?? null
  if (!startNode) return { pathSegments: [], pathLengthPx: 0, reachedTx: false, reachedTerminal: false }
  return tracePathFromNodeToFirstTerminal({
    graph,
    startNode,
    terminalKinds: params.policy.terminalKinds,
  })
}

function pruneISpursIterative(segments: Segment[], policy: PrunePolicy): PruneISpursResult {
  const thresholdPx = resolveSpurThresholdPx(policy)
  const endpointEpsPx = policy.endpointEpsPx
  const hvBandPx = policy.hvBandPx

  let work = weldNearEndpointsForGraph(segments, endpointEpsPx)
  let removedPathCount = 0
  let removedSegmentCount = 0

  let changed = true
  while (changed) {
    changed = false
    const graph = buildJunctionGraph(work, policy.junctionSnapPx)
    const candidates = graph.nodes
      .filter((node) => node.kind === 'I')
      .map((node) => {
        const trace = tracePathFromNodeToFirstTerminal({
          graph,
          startNode: node,
          terminalKinds: policy.terminalKinds,
        })
        return { trace, startNode: node }
      })
      .filter(
        (item) =>
          item.trace.reachedTerminal &&
          item.trace.pathLengthPx < thresholdPx &&
          item.trace.pathSegments.length > 0 &&
          !shouldProtectTxFromSpurPrune({
            graph,
            trace: item.trace,
            policy,
            hvBandPx,
          }),
      )
      .sort((a, b) => a.trace.pathLengthPx - b.trace.pathLengthPx)

    if (candidates.length === 0) break
    const next = candidates[0]!
    const removed = removePathSegments(work, next.trace.pathSegments, endpointEpsPx)
    if (removed.removedSegmentCount <= 0) break
    work = removed.segments
    removedPathCount += 1
    removedSegmentCount += removed.removedSegmentCount
    changed = true
  }

  return {
    segments: work,
    pruneStats: { removedPathCount, removedSegmentCount },
  }
}

/** Eén sweep: alle korte I→terminal paden in één ronde. */
function pruneISpursOnce(segments: Segment[], policy: PrunePolicy): PruneISpursResult {
  const thresholdPx = resolveSpurThresholdPx(policy)
  const endpointEpsPx = policy.endpointEpsPx
  const hvBandPx = policy.hvBandPx
  const work = weldNearEndpointsForGraph(segments, endpointEpsPx)
  const graph = buildJunctionGraph(work, policy.junctionSnapPx)

  const pathsToRemove: Segment[][] = []
  for (const node of graph.nodes) {
    if (node.kind !== 'I') continue
    const trace = tracePathFromNodeToFirstTerminal({
      graph,
      startNode: node,
      terminalKinds: policy.terminalKinds,
    })
    if (
      trace.reachedTerminal &&
      trace.pathLengthPx < thresholdPx &&
      trace.pathSegments.length > 0 &&
      !shouldProtectTxFromSpurPrune({ graph, trace, policy, hvBandPx })
    ) {
      pathsToRemove.push(trace.pathSegments)
    }
  }

  if (pathsToRemove.length === 0) {
    return { segments: work, pruneStats: { removedPathCount: 0, removedSegmentCount: 0 } }
  }

  let current = work
  let removedSegmentCount = 0
  for (const path of pathsToRemove) {
    const removed = removePathSegments(current, path, endpointEpsPx)
    removedSegmentCount += removed.removedSegmentCount
    current = removed.segments
  }

  return {
    segments: current,
    pruneStats: { removedPathCount: pathsToRemove.length, removedSegmentCount },
  }
}

/** Policy dispatcher: L3 iterative-tx / L8 once-ltx. */
export function pruneISpurs(segments: Segment[], policy: PrunePolicy): PruneISpursResult {
  if (policy.mode === 'once-ltx') {
    return pruneISpursOnce(segments, policy)
  }
  return pruneISpursIterative(segments, policy)
}
