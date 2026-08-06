/**
 * L5 cleanup — Copy(6) parallel micro-loop removal.
 */
import { tally } from '@/core/diagnostics'
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { cloneSegments, incidentAt, removeSegmentAt } from '../segment-ops'
import type { Layer5CleanupPolicy } from '../policy-types'

function angleDeg(seg: Segment, fromA: boolean): number {
  const p = fromA ? seg.a : seg.b
  const q = fromA ? seg.b : seg.a
  return (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI
}

/** Same heading (thin lens), not opposite collinear T-stubs (undirected 180°→0). */
function directedAbsDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360
  if (d > 180) d = 360 - d
  return d
}

export function cleanupMicroLoops(
  segments: Segment[],
  policy: Layer5CleanupPolicy,
): { segments: Segment[]; removedCount: number } {
  const ref = policy.thicknessFallbackPx
  const work = cloneSegments(segments)
  let removedCount = 0
  const endGapMax = Math.max(4, Math.min(12, Math.round(ref * 0.25)))

  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < work.length; i += 1) {
      const a = work[i]
      for (let j = i + 1; j < work.length; j += 1) {
        const b = work[j]
        const shareA = Math.hypot(a.a.x - b.a.x, a.a.y - b.a.y) <= 1
        const shareB = Math.hypot(a.a.x - b.b.x, a.a.y - b.b.y) <= 1
        const shareC = Math.hypot(a.b.x - b.a.x, a.b.y - b.a.y) <= 1
        const shareD = Math.hypot(a.b.x - b.b.x, a.b.y - b.b.y) <= 1
        const sharesStart = shareA || shareB || shareC || shareD
        if (!sharesStart) continue

        const start = shareA || shareB ? a.a : a.b
        const aFromStart = Math.hypot(a.a.x - start.x, a.a.y - start.y) <= 1
        const bFromStart = Math.hypot(b.a.x - start.x, b.a.y - start.y) <= 1
        const endA = aFromStart ? a.b : a.a
        const endB = bFromStart ? b.b : b.a
        const endGap = Math.hypot(endA.x - endB.x, endA.y - endB.y)
        if (endGap > endGapMax) continue

        const lenA = segmentLength(a)
        const lenB = segmentLength(b)
        if (Math.max(lenA, lenB) > ref) continue
        const angA = angleDeg(a, aFromStart)
        const angB = angleDeg(b, bFromStart)
        // Directed: opposite T-arm stubs are ~180° and must not match.
        if (directedAbsDiffDeg(angA, angB) > 25) continue

        // ESC:W-21 (B)
        // Far ends must be leaves (only this segment). Degree≥2 means a through-wall
        // continuation — deleting would strand an I at a through-wall joint.
        const degA = incidentAt(work, endA).length
        const degB = incidentAt(work, endB).length
        if (degA !== 1 || degB !== 1) {
          tally('W-21', 'guard_degree')
          continue
        }

        const removeIndex = lenA <= lenB ? i : j
        removeSegmentAt(work, removeIndex)
        removedCount += 1
        tally('W-21', 'removed')
        changed = true
        break
      }
      if (changed) break
    }
  }

  return { segments: work, removedCount }
}
