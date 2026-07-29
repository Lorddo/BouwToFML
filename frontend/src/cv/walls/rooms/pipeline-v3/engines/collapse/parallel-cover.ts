/**
 * Parallel-cover absorb — redundant H/V segments whose span is covered by
 * the union of other same-axis segments (BouwTek11 short-V on through-V).
 */
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { cloneSegments } from '../segment-ops'
import type { CollapsePolicy } from '../policy-types'
import { segmentAxis, type CollapseAxis, type ExactPoint } from './adjacency'

export interface ParallelCoverStats {
  coveredCount: number
  segmentsRemoved: number
  splitCount: number
}

type Span = { index: number; lo: number; hi: number; axisValue: number }

function pointNear(a: ExactPoint, b: ExactPoint, eps: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= eps
}

function segmentHasEndpoint(seg: Segment, point: ExactPoint, eps: number): boolean {
  return pointNear(seg.a, point, eps) || pointNear(seg.b, point, eps)
}

function alongSpan(seg: Segment, axis: CollapseAxis): { lo: number; hi: number } {
  if (axis === 'V') {
    return { lo: Math.min(seg.a.y, seg.b.y), hi: Math.max(seg.a.y, seg.b.y) }
  }
  return { lo: Math.min(seg.a.x, seg.b.x), hi: Math.max(seg.a.x, seg.b.x) }
}

function axisValueOf(seg: Segment, axis: CollapseAxis): number {
  return axis === 'V' ? (seg.a.x + seg.b.x) / 2 : (seg.a.y + seg.b.y) / 2
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = [[sorted[0]![0], sorted[0]![1]]]
  for (let i = 1; i < sorted.length; i += 1) {
    const [lo, hi] = sorted[i]!
    const last = out[out.length - 1]!
    if (lo <= last[1] + 1e-6) {
      last[1] = Math.max(last[1], hi)
    } else {
      out.push([lo, hi])
    }
  }
  return out
}

function spanCoveredByUnion(
  lo: number,
  hi: number,
  union: Array<[number, number]>,
  slack: number,
): boolean {
  if (hi - lo <= slack) {
    // Degenerate / tiny: covered if any union interval touches the point.
    return union.some(([ulo, uhi]) => lo >= ulo - slack && lo <= uhi + slack)
  }
  let cursor = lo
  for (const [ulo, uhi] of union) {
    if (uhi + slack < cursor) continue
    if (ulo - slack > cursor) return false
    cursor = Math.max(cursor, uhi)
    if (cursor + slack >= hi) return true
  }
  return cursor + slack >= hi
}

function projectPointOntoAxis(
  point: ExactPoint,
  axis: CollapseAxis,
  axisValue: number,
): ExactPoint {
  return axis === 'V' ? { x: axisValue, y: point.y } : { x: point.x, y: axisValue }
}

function alongCoord(point: ExactPoint, axis: CollapseAxis): number {
  return axis === 'V' ? point.y : point.x
}

function splitSegmentAt(
  seg: Segment,
  split: ExactPoint,
  axis: CollapseAxis,
  eps: number,
): Segment[] | null {
  const span = alongSpan(seg, axis)
  const t = alongCoord(split, axis)
  if (t <= span.lo + eps || t >= span.hi - eps) return null
  const atEndA = pointNear(seg.a, split, eps)
  const atEndB = pointNear(seg.b, split, eps)
  if (atEndA || atEndB) return null

  const aAlong = alongCoord(seg.a, axis)
  const nearA = Math.abs(aAlong - span.lo) <= Math.abs(aAlong - span.hi)
  const lowEnd = nearA ? seg.a : seg.b
  const highEnd = nearA ? seg.b : seg.a
  return [
    { a: { ...lowEnd }, b: { ...split }, templateIndex: seg.templateIndex },
    { a: { ...split }, b: { ...highEnd }, templateIndex: seg.templateIndex },
  ]
}

function findClusterKey(
  clusters: Map<string, { axis: CollapseAxis; axisValue: number; indices: number[] }>,
  axis: CollapseAxis,
  axisValue: number,
  eps: number,
): string | null {
  for (const [key, cluster] of clusters) {
    if (cluster.axis !== axis) continue
    if (Math.abs(cluster.axisValue - axisValue) <= eps) return key
  }
  return null
}

/**
 * Remove H/V segments whose along-axis span is covered by the union of other
 * same-axis segments. Split a covering survivor at unique endpoints so
 * perpendicular arms become T junctions on the through-line.
 */
export function parallelCoverAbsorb(
  segments: Segment[],
  policy: CollapsePolicy,
): { segments: Segment[]; stats: ParallelCoverStats } {
  if (!policy.enableParallelCover) {
    throw new Error('V3 parallelCoverAbsorb: disabled for this layer policy')
  }

  const eps = policy.axisCoverEpsPx
  const hvBandPx = policy.hvBandPx
  // Laat beperkte near-parallel cleanup toe, maar nooit agressiever dan 5px.
  const axisClusterEps = Math.max(
    eps,
    Math.min(5, Math.max(1, Math.round(policy.orthoStubTierMaxPx))),
  )
  let work = cloneSegments(segments)
  let coveredCount = 0
  let segmentsRemoved = 0
  let splitCount = 0

  let changed = true
  while (changed) {
    changed = false

    const clusters = new Map<string, { axis: CollapseAxis; axisValue: number; indices: number[] }>()
    for (let i = 0; i < work.length; i += 1) {
      const axis = segmentAxis(work[i]!, i, hvBandPx)
      if (axis !== 'H' && axis !== 'V') continue
      if (segmentLength(work[i]!) <= eps) continue
      const value = axisValueOf(work[i]!, axis)
      const existingKey = findClusterKey(clusters, axis, value, axisClusterEps)
      if (existingKey) {
        clusters.get(existingKey)!.indices.push(i)
      } else {
        const key = `${axis}:${value}`
        clusters.set(key, { axis, axisValue: value, indices: [i] })
      }
    }

    type Victim = { index: number; axis: CollapseAxis; axisValue: number; clusterIndices: number[] }
    const victims: Victim[] = []

    for (const cluster of clusters.values()) {
      if (cluster.indices.length < 2) continue
      const spans: Span[] = cluster.indices.map((index) => {
        const span = alongSpan(work[index]!, cluster.axis)
        return { index, lo: span.lo, hi: span.hi, axisValue: cluster.axisValue }
      })

      for (const candidate of spans) {
        const others = spans
          .filter((s) => s.index !== candidate.index)
          .map((s): [number, number] => [s.lo, s.hi])
        const union = mergeIntervals(others)
        if (!spanCoveredByUnion(candidate.lo, candidate.hi, union, eps)) continue
        victims.push({
          index: candidate.index,
          axis: cluster.axis,
          axisValue: cluster.axisValue,
          clusterIndices: cluster.indices,
        })
      }
    }

    if (victims.length === 0) break

    victims.sort((a, b) => segmentLength(work[a.index]!) - segmentLength(work[b.index]!))
    const victim = victims[0]!
    const victimSeg = work[victim.index]!

    const uniqueEnds: ExactPoint[] = []
    for (const ep of [victimSeg.a, victimSeg.b]) {
      const sharedWithCluster = victim.clusterIndices.some((idx) => {
        if (idx === victim.index) return false
        return segmentHasEndpoint(work[idx]!, ep, axisClusterEps)
      })
      if (!sharedWithCluster) uniqueEnds.push(ep)
    }

    // Split covering survivors at unique endpoints before removing the victim.
    const next: Segment[] = []
    for (let i = 0; i < work.length; i += 1) {
      if (i === victim.index) continue
      let pieces: Segment[] = [work[i]!]
      if (victim.clusterIndices.includes(i)) {
        for (const ep of uniqueEnds) {
          const t = alongCoord(ep, victim.axis)
          const rebuilt: Segment[] = []
          for (const piece of pieces) {
            const span = alongSpan(piece, victim.axis)
            if (t < span.lo - eps || t > span.hi + eps) {
              rebuilt.push(piece)
              continue
            }
            const splitAt = projectPointOntoAxis(ep, victim.axis, victim.axisValue)
            const split = splitSegmentAt(piece, splitAt, victim.axis, eps)
            if (!split) {
              rebuilt.push(piece)
              continue
            }
            rebuilt.push(...split)
            splitCount += 1
          }
          pieces = rebuilt
        }
      }
      next.push(...pieces)
    }

    // Unique-end perpendiculars already sit at the split point; keep them as-is.
    work = next
    coveredCount += 1
    segmentsRemoved += 1
    changed = true
  }

  // Drop zero-length leftovers from splits / covers.
  work = work.filter((seg) => segmentLength(seg) > eps)

  return {
    segments: work,
    stats: { coveredCount, segmentsRemoved, splitCount },
  }
}
