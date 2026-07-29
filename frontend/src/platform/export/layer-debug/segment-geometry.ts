import type { SegmentRecord } from '../examples-report.ts'
import type { SegmentRef } from './types.ts'

function segmentLength(seg: Pick<SegmentRecord, 'a' | 'b'>): number {
  return Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)
}

export function toSegmentRef(index: number, seg: SegmentRecord): SegmentRef {
  const lengthPx = seg.lengthPx ?? Math.round(segmentLength(seg))
  return {
    index,
    a: { x: seg.a.x, y: seg.a.y },
    b: { x: seg.b.x, y: seg.b.y },
    lengthPx,
    mid: {
      x: Math.round((seg.a.x + seg.b.x) / 2),
      y: Math.round((seg.a.y + seg.b.y) / 2),
    },
  }
}

export function orientationSimilar(
  a: Pick<SegmentRef, 'a' | 'b'>,
  b: Pick<SegmentRef, 'a' | 'b'>,
  minDot = 0.92,
): boolean {
  const lenA = segmentLength(a)
  const lenB = segmentLength(b)
  if (lenA < 1e-6 || lenB < 1e-6) return true
  const ax = (a.b.x - a.a.x) / lenA
  const ay = (a.b.y - a.a.y) / lenA
  const bx = (b.b.x - b.a.x) / lenB
  const by = (b.b.y - b.a.y) / lenB
  return Math.abs(ax * bx + ay * by) > minDot
}

export function endpointErrorPx(
  prev: Pick<SegmentRef, 'a' | 'b'>,
  next: Pick<SegmentRef, 'a' | 'b'>,
): number {
  const direct = (dist(prev.a, next.a) + dist(prev.b, next.b)) / 2
  const flipped = (dist(prev.a, next.b) + dist(prev.b, next.a)) / 2
  return Math.min(direct, flipped)
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Afstand van punt tot lijnsegment (clamp op segment). */
export function pointToSegmentDistancePx(
  p: { x: number; y: number },
  seg: Pick<SegmentRef, 'a' | 'b'>,
): number {
  const dx = seg.b.x - seg.a.x
  const dy = seg.b.y - seg.a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-6) return dist(p, seg.a)
  const t = Math.max(0, Math.min(1, ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / lenSq))
  return dist(p, { x: seg.a.x + t * dx, y: seg.a.y + t * dy })
}

/** Of prev-midden op dezelfde lijn ligt als next (collinear merge). */
export function segmentProjectsOntoLine(
  prev: SegmentRef,
  next: SegmentRef,
  bandPx: number,
): boolean {
  if (!orientationSimilar(prev, next, 0.95)) return false
  const dMid = pointToSegmentDistancePx(prev.mid, next)
  const dA = pointToSegmentDistancePx(prev.a, next)
  const dB = pointToSegmentDistancePx(prev.b, next)
  return dMid <= bandPx && (dA <= bandPx * 2 || dB <= bandPx * 2)
}

export function formatSegmentLine(seg: SegmentRef): string {
  return `(${seg.a.x},${seg.a.y})→(${seg.b.x},${seg.b.y}) L=${seg.lengthPx}px`
}
