/**
 * Weld engine — Copy(6) L5 near-endpoint + dangling repair.
 * Junction-cluster / collinear-gap remain stubs until later child-plans.
 */
import type { Segment } from '@/cv/port/wallGraph'
import {
  buildEndpointIndex,
  cloneSegments,
  incidentAtIndexed,
  unifyNearEndpoints,
} from '../segment-ops'
import type { WeldPolicy } from '../policy-types'

type EndpointRef = {
  segIndex: number
  endpoint: 'a' | 'b'
  point: { x: number; y: number }
}

function moveEndpoint(seg: Segment, endpoint: 'a' | 'b', target: { x: number; y: number }): void {
  if (endpoint === 'a') {
    seg.a.x = target.x
    seg.a.y = target.y
    return
  }
  seg.b.x = target.x
  seg.b.y = target.y
}

function collectDanglingEndpoints(segments: Segment[]): EndpointRef[] {
  const index = buildEndpointIndex(segments)
  const out: EndpointRef[] = []
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]
    const endpoints: Array<{ endpoint: 'a' | 'b'; point: { x: number; y: number } }> = [
      { endpoint: 'a', point: seg.a },
      { endpoint: 'b', point: seg.b },
    ]
    for (const entry of endpoints) {
      const degree = incidentAtIndexed(segments, index, entry.point).length
      if (degree === 1) {
        out.push({
          segIndex: i,
          endpoint: entry.endpoint,
          point: { x: entry.point.x, y: entry.point.y },
        })
      }
    }
  }
  return out
}

/** Copy6 weldNearConnectedEndpoints — policy.nearEndpointGapPx (+ ULP bake). */
export function weldNearEndpoints(segments: Segment[], policy: WeldPolicy): Segment[] {
  return weldNearConnectedEndpoints(segments, policy).segments
}

export function weldNearConnectedEndpoints(
  segments: Segment[],
  policy: WeldPolicy,
): { segments: Segment[]; weldedCount: number } {
  const unified = unifyNearEndpoints(segments, policy.nearEndpointGapPx, policy.endpointEpsPx)
  return { segments: unified.segments, weldedCount: unified.unifiedCount }
}

/**
 * Copy6 repairLayer5DanglingConnections — close dangling pairs then near-weld.
 * Requires policy.repairMaxGapPx > 0.
 */
export function repairDanglingConnections(
  segments: Segment[],
  policy: WeldPolicy,
): {
  segments: Segment[]
  repairedCount: number
  weldedCount: number
} {
  const maxGapPx = policy.repairMaxGapPx
  if (maxGapPx <= 0) {
    return { segments: cloneSegments(segments), repairedCount: 0, weldedCount: 0 }
  }
  const work = cloneSegments(segments)
  let repairedCount = 0

  while (true) {
    const dangling = collectDanglingEndpoints(work)
    let bestPair: { a: EndpointRef; b: EndpointRef; d: number } | null = null
    for (let i = 0; i < dangling.length; i += 1) {
      const a = dangling[i]
      for (let j = i + 1; j < dangling.length; j += 1) {
        const b = dangling[j]
        if (a.segIndex === b.segIndex) continue
        const d = Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y)
        if (d > maxGapPx) continue
        if (!bestPair || d < bestPair.d) {
          bestPair = { a, b, d }
        }
      }
    }
    if (!bestPair) break

    const target = {
      x: (bestPair.a.point.x + bestPair.b.point.x) / 2,
      y: (bestPair.a.point.y + bestPair.b.point.y) / 2,
    }
    moveEndpoint(work[bestPair.a.segIndex], bestPair.a.endpoint, target)
    moveEndpoint(work[bestPair.b.segIndex], bestPair.b.endpoint, target)
    repairedCount += 1
  }

  const welded = weldNearConnectedEndpoints(work, policy)
  return {
    segments: welded.segments,
    repairedCount,
    weldedCount: welded.weldedCount,
  }
}
