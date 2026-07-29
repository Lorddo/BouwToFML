/**
 * L10 FML polish — force one shared axis on collinear H/V chains that
 * share endpoints (through L/T) or a short ortho jog-bridge when spread
 * is within policy max.
 *
 * Includes 0px segments so junction snaps stay attached before micro-corner.
 * After align, near-zero jog stubs are dropped so FML sees one axis chain.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { cloneSegments, dropZeroLengthSegments } from '../segment-ops'
import type { CollapsePolicy } from '../policy-types'
import {
  buildExactAdjacency,
  exactPointKey,
  otherEndpoint,
  segmentAxis,
  type CollapseAxis,
  type ExactPoint,
} from './adjacency'

export interface ChainAxisStraightenStats {
  chainsStraightened: number
  segmentsAdjusted: number
  endpointsAdjusted: number
  zeroStubsDropped: number
}

const ZERO_LEN_EPS_PX = 1e-9

function axisValueOf(seg: Segment, axis: CollapseAxis): number {
  return axis === 'H' ? (seg.a.y + seg.b.y) / 2 : (seg.a.x + seg.b.x) / 2
}

function isZeroLength(seg: Segment): boolean {
  return segmentLength(seg) <= ZERO_LEN_EPS_PX
}

function perpendicularAxis(axis: CollapseAxis): CollapseAxis {
  return axis === 'H' ? 'V' : 'H'
}

/** H/V or zero-length (eligible for either axis pass via neighbor union). */
function eligibleForAxis(
  seg: Segment,
  segIndex: number,
  axis: CollapseAxis,
  hvBandPx: number,
): boolean {
  if (isZeroLength(seg)) return true
  return segmentAxis(seg, segIndex, hvBandPx) === axis
}

function buildUnionFind(size: number): {
  find: (i: number) => number
  union: (a: number, b: number) => void
} {
  const parent = Array.from({ length: size }, (_, i) => i)
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i]!)
    return parent[i]!
  }
  const union = (a: number, b: number): void => {
    parent[find(b)] = find(a)
  }
  return { find, union }
}

function sameAxisIndicesAtPoint(params: {
  segments: Segment[]
  incidents: Array<{ segIndex: number }>
  axis: CollapseAxis
  excludeSegIndex: number
  memberSet: Set<number>
  hvBandPx: number
}): number[] {
  const out: number[] = []
  for (const inc of params.incidents) {
    if (inc.segIndex === params.excludeSegIndex) continue
    if (!params.memberSet.has(inc.segIndex)) continue
    const seg = params.segments[inc.segIndex]!
    if (isZeroLength(seg) || segmentAxis(seg, inc.segIndex, params.hvBandPx) === params.axis) {
      out.push(inc.segIndex)
    }
  }
  return [...new Set(out)]
}

function collectAxisClusters(params: {
  segments: Segment[]
  axis: CollapseAxis
  maxSpreadPx: number
  maxBridgePx: number
  hvBandPx: number
}): number[][] {
  const { segments, axis, maxSpreadPx, maxBridgePx } = params
  const members: number[] = []
  for (let i = 0; i < segments.length; i += 1) {
    if (eligibleForAxis(segments[i]!, i, axis, params.hvBandPx)) members.push(i)
  }
  if (members.length < 2) return []

  const memberSet = new Set(members)
  const { find, union } = buildUnionFind(segments.length)
  const adjacency = buildExactAdjacency(segments)

  // 1) Direct: same-axis (or 0px) segments that share an exact endpoint.
  for (const node of adjacency.values()) {
    const local = [...new Set(node.incidents.map((inc) => inc.segIndex))].filter((idx) =>
      memberSet.has(idx),
    )
    for (let i = 0; i < local.length; i += 1) {
      for (let j = i + 1; j < local.length; j += 1) {
        const a = local[i]!
        const b = local[j]!
        const spread = Math.abs(axisValueOf(segments[a]!, axis) - axisValueOf(segments[b]!, axis))
        if (spread <= maxSpreadPx) union(a, b)
      }
    }
  }

  // 2) Bridge: short perpendicular jog between two same-axis arms (T/L micro-offset).
  const perp = perpendicularAxis(axis)
  for (let stubIndex = 0; stubIndex < segments.length; stubIndex += 1) {
    const stub = segments[stubIndex]!
    if (isZeroLength(stub)) continue
    if (segmentAxis(stub, stubIndex, params.hvBandPx) !== perp) continue
    const stubLen = segmentLength(stub)
    if (stubLen <= 0 || stubLen > maxBridgePx) continue

    const nodeA = adjacency.get(exactPointKey(stub.a))
    const nodeB = adjacency.get(exactPointKey(stub.b))
    if (!nodeA || !nodeB) continue

    const armsA = sameAxisIndicesAtPoint({
      segments,
      incidents: nodeA.incidents,
      axis,
      excludeSegIndex: stubIndex,
      memberSet,
      hvBandPx: params.hvBandPx,
    })
    const armsB = sameAxisIndicesAtPoint({
      segments,
      incidents: nodeB.incidents,
      axis,
      excludeSegIndex: stubIndex,
      memberSet,
      hvBandPx: params.hvBandPx,
    })
    if (armsA.length === 0 || armsB.length === 0) continue

    for (const a of armsA) {
      for (const b of armsB) {
        if (a === b) continue
        const spread = Math.abs(axisValueOf(segments[a]!, axis) - axisValueOf(segments[b]!, axis))
        if (spread <= maxSpreadPx) union(a, b)
      }
    }
  }

  const groups = new Map<number, number[]>()
  for (const idx of members) {
    const root = find(idx)
    const list = groups.get(root) ?? []
    list.push(idx)
    groups.set(root, list)
  }

  return [...groups.values()].filter((indices) => {
    if (indices.length < 2) return false
    const nonZeroSameAxis = indices.filter((idx) => {
      if (isZeroLength(segments[idx]!)) return false
      return segmentAxis(segments[idx]!, idx, params.hvBandPx) === axis
    })
    return nonZeroSameAxis.length >= 2
  })
}

function applyAxisToCluster(params: {
  work: Segment[]
  clusterIndices: number[]
  axis: CollapseAxis
  targetAxis: number
}): { segmentsAdjusted: number; endpointsAdjusted: number } {
  const pointKeys = new Set<string>()
  for (const idx of params.clusterIndices) {
    const seg = params.work[idx]!
    pointKeys.add(exactPointKey(seg.a))
    pointKeys.add(exactPointKey(seg.b))
  }

  type Update = { segIndex: number; endpoint: 'a' | 'b'; point: ExactPoint }
  const updates: Update[] = []
  const touchedSeg = new Set<number>()

  for (let segIndex = 0; segIndex < params.work.length; segIndex += 1) {
    const seg = params.work[segIndex]!
    for (const endpoint of ['a', 'b'] as const) {
      const point = seg[endpoint]
      if (!pointKeys.has(exactPointKey(point))) continue
      const next: ExactPoint =
        params.axis === 'H'
          ? { x: point.x, y: params.targetAxis }
          : { x: params.targetAxis, y: point.y }
      if (Math.abs(next.x - point.x) > 1e-12 || Math.abs(next.y - point.y) > 1e-12) {
        updates.push({ segIndex, endpoint, point: next })
        touchedSeg.add(segIndex)
      }
    }
  }

  for (const update of updates) {
    const seg = params.work[update.segIndex]!
    seg[update.endpoint] = { ...update.point }
  }

  return {
    segmentsAdjusted: touchedSeg.size,
    endpointsAdjusted: updates.length,
  }
}

function collapseStraightDegree2Nodes(params: {
  segments: Segment[]
  hvBandPx: number
}): { segments: Segment[]; merged: number } {
  let work = params.segments.map((seg) => ({
    ...seg,
    a: { ...seg.a },
    b: { ...seg.b },
  }))
  let merged = 0

  let changed = true
  while (changed) {
    changed = false
    const adjacency = buildExactAdjacency(work)

    outer: for (const node of adjacency.values()) {
      const incidentIndices = [...new Set(node.incidents.map((incident) => incident.segIndex))]
      if (incidentIndices.length !== 2) continue

      const firstIdx = incidentIndices[0]!
      const secondIdx = incidentIndices[1]!
      const firstSeg = work[firstIdx]
      const secondSeg = work[secondIdx]
      if (!firstSeg || !secondSeg) continue

      const firstAxis = segmentAxis(firstSeg, firstIdx, params.hvBandPx)
      const secondAxis = segmentAxis(secondSeg, secondIdx, params.hvBandPx)
      if (!firstAxis || !secondAxis || firstAxis !== secondAxis) continue

      if (
        firstSeg.templateIndex != null
        && secondSeg.templateIndex != null
        && firstSeg.templateIndex !== secondSeg.templateIndex
      ) {
        continue
      }

      const nodePoint = { x: node.x, y: node.y }
      const mergedCandidate: Segment = {
        a: { ...otherEndpoint(firstSeg, nodePoint) },
        b: { ...otherEndpoint(secondSeg, nodePoint) },
        templateIndex: firstSeg.templateIndex ?? secondSeg.templateIndex,
      }
      if (segmentLength(mergedCandidate) <= ZERO_LEN_EPS_PX) continue

      const next: Segment[] = []
      for (let i = 0; i < work.length; i += 1) {
        if (i === firstIdx || i === secondIdx) continue
        next.push(work[i]!)
      }
      next.push(mergedCandidate)

      work = next
      merged += 1
      changed = true
      break outer
    }
  }

  return { segments: work, merged }
}

/**
 * Straighten collinear H/V chains onto one consensus axis.
 * L10 only (`enableChainAxisStraighten`).
 */
export function straightenCollinearAxisChains(
  segments: Segment[],
  policy: CollapsePolicy,
): { segments: Segment[]; stats: ChainAxisStraightenStats } {
  if (!policy.enableChainAxisStraighten) {
    throw new Error('V3 straightenCollinearAxisChains: disabled for this layer policy')
  }

  const work = cloneSegments(segments)
  const hvBandPx = policy.hvBandPx
  let chainsStraightened = 0
  let segmentsAdjusted = 0
  let endpointsAdjusted = 0

  for (const axis of ['H', 'V'] as const) {
    const clusters = collectAxisClusters({
      segments: work,
      axis,
      maxSpreadPx: policy.chainAxisMaxSpreadPx,
      maxBridgePx: policy.microCornerMaxPx,
      hvBandPx,
    })

    for (const clusterIndices of clusters) {
      let weight = 0
      let sum = 0
      for (const idx of clusterIndices) {
        const seg = work[idx]!
        if (isZeroLength(seg)) continue
        if (segmentAxis(seg, idx, hvBandPx) !== axis) continue
        const len = Math.max(1, segmentLength(seg))
        sum += axisValueOf(seg, axis) * len
        weight += len
      }
      if (weight <= 0) continue

      const targetAxis = sum / weight
      const beforeSpread =
        Math.max(...clusterIndices.map((idx) => axisValueOf(work[idx]!, axis))) -
        Math.min(...clusterIndices.map((idx) => axisValueOf(work[idx]!, axis)))

      const applied = applyAxisToCluster({
        work,
        clusterIndices,
        axis,
        targetAxis,
      })
      if (applied.endpointsAdjusted > 0 || beforeSpread > 1e-12) {
        chainsStraightened += 1
        segmentsAdjusted += applied.segmentsAdjusted
        endpointsAdjusted += applied.endpointsAdjusted
      }
    }
  }

  // Jog-bridges collapse to ~0 when both arms snap to one axis — drop them for FML.
  const dropped = dropZeroLengthSegments(work, ZERO_LEN_EPS_PX)
  const collinearCollapsed = collapseStraightDegree2Nodes({
    segments: dropped.segments,
    hvBandPx,
  })

  return {
    segments: collinearCollapsed.segments,
    stats: {
      chainsStraightened,
      segmentsAdjusted: segmentsAdjusted + collinearCollapsed.merged,
      endpointsAdjusted,
      zeroStubsDropped: dropped.removed,
    },
  }
}
