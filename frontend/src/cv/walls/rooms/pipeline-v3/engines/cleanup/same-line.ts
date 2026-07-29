/**
 * L5 cleanup — Copy(6) same-line merge.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { cloneSegments, dropZeroLengthSegments } from '../segment-ops'
import { PIPELINE_HV_ANGLE_TOL_DEG } from '../scale'
import type { Layer5CleanupPolicy } from '../policy-types'

type Axis = 'H' | 'V'

type SameLineCluster = {
  axis: Axis
  cross: number
  indices: number[]
}

function classifyAxis(seg: Segment, sameLineMaxOffsetPx: number): Axis | null {
  const dx = Math.abs(seg.b.x - seg.a.x)
  const dy = Math.abs(seg.b.y - seg.a.y)
  const deg = Math.abs((Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) * 180) / Math.PI)
  const horizontal = deg <= PIPELINE_HV_ANGLE_TOL_DEG || deg >= 180 - PIPELINE_HV_ANGLE_TOL_DEG
  const vertical = Math.abs(deg - 90) <= PIPELINE_HV_ANGLE_TOL_DEG
  if (horizontal && dy <= sameLineMaxOffsetPx && dx >= 1) return 'H'
  if (vertical && dx <= sameLineMaxOffsetPx && dy >= 1) return 'V'
  return null
}

function projectionRange(seg: Segment, axis: Axis): { min: number; max: number } {
  if (axis === 'H') {
    return { min: Math.min(seg.a.x, seg.b.x), max: Math.max(seg.a.x, seg.b.x) }
  }
  return { min: Math.min(seg.a.y, seg.b.y), max: Math.max(seg.a.y, seg.b.y) }
}

function lineCross(seg: Segment, axis: Axis): number {
  return axis === 'H' ? (seg.a.y + seg.b.y) / 2 : (seg.a.x + seg.b.x) / 2
}

function endpointOnLine(point: { x: number; y: number }, axis: Axis, cross: number): boolean {
  const strictEps = 0.5
  return axis === 'H'
    ? Math.abs(point.y - cross) <= strictEps
    : Math.abs(point.x - cross) <= strictEps
}

function pushUniqueCut(cuts: number[], value: number, eps = 0.25): void {
  if (cuts.some((existing) => Math.abs(existing - value) <= eps)) return
  cuts.push(value)
}

function segmentFromAxis(
  axis: Axis,
  cross: number,
  from: number,
  to: number,
  templateIndex?: number,
): Segment {
  if (axis === 'H') {
    return { a: { x: from, y: cross }, b: { x: to, y: cross }, templateIndex }
  }
  return { a: { x: cross, y: from }, b: { x: cross, y: to }, templateIndex }
}

function coveredByCluster(t: number, ranges: Array<{ min: number; max: number }>): boolean {
  return ranges.some((range) => t >= range.min - 1e-6 && t <= range.max + 1e-6)
}

function buildClustersForKey(params: {
  axis: Axis
  cross: number
  indices: number[]
  segments: Segment[]
  sameLineMaxOffsetPx: number
}): SameLineCluster[] {
  const ranges = params.indices
    .map((index) => ({
      index,
      ...projectionRange(params.segments[index]!, params.axis),
    }))
    .sort((a, b) => a.min - b.min)

  const clusters: SameLineCluster[] = []
  let current: SameLineCluster | null = null
  let currentMax = -Infinity
  for (const item of ranges) {
    if (!current || item.min > currentMax + params.sameLineMaxOffsetPx) {
      current = { axis: params.axis, cross: params.cross, indices: [item.index] }
      clusters.push(current)
      currentMax = item.max
      continue
    }
    current.indices.push(item.index)
    currentMax = Math.max(currentMax, item.max)
  }
  return clusters
}

export function mergeSameLineSegments(
  segments: Segment[],
  policy: Layer5CleanupPolicy,
): {
  segments: Segment[]
  mergedClusterCount: number
  mergedSegmentCount: number
} {
  const ref = policy.thicknessFallbackPx
  const work = cloneSegments(segments)
  const byKey = new Map<string, { axis: Axis; cross: number; indices: number[] }>()
  for (let i = 0; i < work.length; i += 1) {
    const seg = work[i]!
    const axis = classifyAxis(seg, policy.sameLineMaxOffsetPx)
    if (!axis) continue
    const cross = lineCross(seg, axis)
    const key = `${axis}:${Math.round(cross * 2) / 2}`
    const entry = byKey.get(key)
    if (entry) {
      entry.indices.push(i)
      continue
    }
    byKey.set(key, { axis, cross, indices: [i] })
  }

  const toDelete = new Set<number>()
  const toAdd: Segment[] = []
  let mergedClusterCount = 0
  let mergedSegmentCount = 0

  for (const entry of byKey.values()) {
    const sameCross = entry.indices.filter((idx) => !toDelete.has(idx))
    if (sameCross.length < 2) continue
    const clusters = buildClustersForKey({
      axis: entry.axis,
      cross: entry.cross,
      indices: sameCross,
      segments: work,
      sameLineMaxOffsetPx: policy.sameLineMaxOffsetPx,
    })

    for (const cluster of clusters) {
      if (cluster.indices.length < 2) continue
      const clusterSegments = cluster.indices.map((idx) => work[idx]!)
      const hasShort = clusterSegments.some((seg) => segmentLength(seg) <= ref)
      if (!hasShort) continue

      const ranges = clusterSegments.map((seg) => projectionRange(seg, cluster.axis))
      const cuts: number[] = []
      for (const range of ranges) {
        pushUniqueCut(cuts, range.min)
        pushUniqueCut(cuts, range.max)
      }

      for (let i = 0; i < work.length; i += 1) {
        if (cluster.indices.includes(i)) continue
        const seg = work[i]!
        if (endpointOnLine(seg.a, cluster.axis, cluster.cross)) {
          pushUniqueCut(cuts, cluster.axis === 'H' ? seg.a.x : seg.a.y)
        }
        if (endpointOnLine(seg.b, cluster.axis, cluster.cross)) {
          pushUniqueCut(cuts, cluster.axis === 'H' ? seg.b.x : seg.b.y)
        }
      }

      const sortedCuts = cuts.sort((a, b) => a - b)
      if (sortedCuts.length < 2) continue

      let longest: Segment | null = null
      let longestLen = -1
      for (const seg of clusterSegments) {
        const len = segmentLength(seg)
        if (len > longestLen) {
          longestLen = len
          longest = seg
        }
      }

      let created = 0
      for (let i = 0; i < sortedCuts.length - 1; i += 1) {
        const from = sortedCuts[i]!
        const to = sortedCuts[i + 1]!
        // Skip sub-eps spans — otherwise same-line merge recreates 1px mid-chain stubs
        // (BouwTek11 @1202–1203) that incidentAt cannot clean up.
        if (to - from <= policy.weld.endpointEpsPx) continue
        const mid = (from + to) / 2
        if (!coveredByCluster(mid, ranges)) continue
        toAdd.push(segmentFromAxis(cluster.axis, cluster.cross, from, to, longest?.templateIndex))
        created += 1
      }

      if (created === 0) continue
      mergedClusterCount += 1
      mergedSegmentCount += cluster.indices.length
      for (const idx of cluster.indices) toDelete.add(idx)
    }
  }

  const merged = work.filter((_, index) => !toDelete.has(index))
  merged.push(...toAdd)
  const cleaned = dropZeroLengthSegments(merged, policy.weld.endpointEpsPx)
  return {
    segments: cleaned.segments,
    mergedClusterCount,
    mergedSegmentCount,
  }
}
