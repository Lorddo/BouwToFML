import type { Segment } from '@/cv/port/wallGraph'

export function isFlatHorizontal(seg: Segment, bandPx: number): boolean {
  return Math.abs(seg.a.y - seg.b.y) <= bandPx
}

export function isFlatVertical(seg: Segment, bandPx: number): boolean {
  return Math.abs(seg.a.x - seg.b.x) <= bandPx
}

export function isDominantHorizontal(seg: Segment): boolean {
  return Math.abs(seg.b.x - seg.a.x) >= Math.abs(seg.b.y - seg.a.y)
}

export function isDominantVertical(seg: Segment): boolean {
  return Math.abs(seg.b.y - seg.a.y) > Math.abs(seg.b.x - seg.a.x)
}

export function segmentLength(seg: Segment): number {
  return Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)
}

export function segmentAngleDeg(seg: Segment): number {
  return (Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) * 180) / Math.PI
}

export function yOnWallAtX(wall: Segment, x: number): number {
  const dx = wall.b.x - wall.a.x
  if (Math.abs(dx) < 1e-6) return (wall.a.y + wall.b.y) / 2
  const t = (x - wall.a.x) / dx
  return wall.a.y + t * (wall.b.y - wall.a.y)
}

export function xOnWallAtY(wall: Segment, y: number): number {
  const dy = wall.b.y - wall.a.y
  if (Math.abs(dy) < 1e-6) return (wall.a.x + wall.b.x) / 2
  const t = (y - wall.a.y) / dy
  return wall.a.x + t * (wall.b.x - wall.a.x)
}

function normalizeDirection(seg: Segment): { x: number; y: number } {
  const dx = seg.b.x - seg.a.x
  const dy = seg.b.y - seg.a.y
  const len = Math.hypot(dx, dy)
  if (len <= 1e-6) return { x: 1, y: 0 }
  return { x: dx / len, y: dy / len }
}

function undirectedAngleDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 180
  if (d > 90) d = 180 - d
  return d
}

function perpendicularOffsetPx(a: Segment, b: Segment): number {
  if (isDominantHorizontal(a)) {
    return Math.abs((a.a.y + a.b.y) / 2 - (b.a.y + b.b.y) / 2)
  }
  if (isDominantVertical(a)) {
    return Math.abs((a.a.x + a.b.x) / 2 - (b.a.x + b.b.x) / 2)
  }
  const axis = normalizeDirection(a)
  const nx = -axis.y
  const ny = axis.x
  const midB = { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 }
  return Math.abs((midB.x - a.a.x) * nx + (midB.y - a.a.y) * ny)
}

function segmentPassesNearPoint(
  seg: Segment,
  point: { x: number; y: number },
  snapPx: number,
): boolean {
  const nearA = Math.hypot(seg.a.x - point.x, seg.a.y - point.y) <= snapPx
  const nearB = Math.hypot(seg.b.x - point.x, seg.b.y - point.y) <= snapPx
  if (nearA || nearB) return true
  const dx = seg.b.x - seg.a.x
  const dy = seg.b.y - seg.a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-6) return nearA
  const t = ((point.x - seg.a.x) * dx + (point.y - seg.a.y) * dy) / len2
  if (t <= 0 || t >= 1) return false
  const projX = seg.a.x + t * dx
  const projY = seg.a.y + t * dy
  return Math.hypot(projX - point.x, projY - point.y) <= snapPx
}

function lineIntersection(
  p: { x: number; y: number },
  d: { x: number; y: number },
  q: { x: number; y: number },
  e: { x: number; y: number },
): { x: number; y: number } | null {
  const denom = d.x * e.y - d.y * e.x
  if (Math.abs(denom) < 1e-6) return null
  const dx = q.x - p.x
  const dy = q.y - p.y
  const t = (dx * e.y - dy * e.x) / denom
  return { x: p.x + t * d.x, y: p.y + t * d.y }
}

function infiniteLineIntersection(segA: Segment, segB: Segment): { x: number; y: number } | null {
  const d1 = normalizeDirection(segA)
  const d2 = normalizeDirection(segB)
  const p = { x: (segA.a.x + segA.b.x) / 2, y: (segA.a.y + segA.b.y) / 2 }
  const q = { x: (segB.a.x + segB.b.x) / 2, y: (segB.a.y + segB.b.y) / 2 }
  return lineIntersection(p, d1, q, d2)
}

function endpointNearPoint(
  p: { x: number; y: number },
  point: { x: number; y: number },
  snapPx: number,
): boolean {
  return Math.hypot(p.x - point.x, p.y - point.y) <= snapPx
}

/** Voorkom collinear merge op T-snijpunt waar een loodrechte tak doorloopt. */
export function hasPerpendicularBranchAt(
  point: { x: number; y: number },
  axisAngleDeg: number,
  allSegments: Segment[],
  skipIndices: Set<number>,
  snapPx: number,
  minTurnDeg: number,
  minBranchPx: number = 0,
): boolean {
  for (let k = 0; k < allSegments.length; k += 1) {
    if (skipIndices.has(k)) continue
    const seg = allSegments[k]
    if (!segmentPassesNearPoint(seg, point, snapPx)) continue
    const angleDiff = undirectedAngleDiffDeg(axisAngleDeg, segmentAngleDeg(seg))
    if (angleDiff >= minTurnDeg && angleDiff <= 180 - minTurnDeg) {
      if (minBranchPx > 0 && segmentLength(seg) < minBranchPx) continue
      return true
    }
  }
  return false
}

export { infiniteLineIntersection, endpointNearPoint, perpendicularOffsetPx }
