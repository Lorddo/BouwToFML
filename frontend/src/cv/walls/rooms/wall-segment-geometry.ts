import type { Segment } from '@/cv/port/wallGraph'
import {
  JUNCTION_DIRECTION_BIN_DEG,
  MIN_INK_SUPPORT_KEEP_PX,
  ORTHO_TOLERANCE_DEG,
} from './wall-segment-geometry-constants'

export function isFlatHorizontal(seg: Segment, bandPx: number): boolean {
  return Math.abs(seg.a.y - seg.b.y) <= bandPx
}

/** Horizontaal genoeg voor ortho-consensus — geen korte chamfers met kleine Δy. */
function isConsensusFlatHorizontal(seg: Segment, bandPx: number): boolean {
  return (
    isFlatHorizontal(seg, bandPx) &&
    isHorizontalAngle(segmentAngleDeg(seg)) &&
    isDominantHorizontal(seg)
  )
}

/** Verticaal genoeg voor ortho-consensus — geen korte chamfers met kleine Δx. */
function isConsensusFlatVertical(seg: Segment, bandPx: number): boolean {
  return (
    isFlatVertical(seg, bandPx) &&
    isVerticalAngle(segmentAngleDeg(seg)) &&
    isDominantVertical(seg)
  )
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

function isHorizontalAngle(angleDeg: number): boolean {
  const a = Math.abs(((angleDeg % 180) + 180) % 180)
  return a <= ORTHO_TOLERANCE_DEG || a >= 180 - ORTHO_TOLERANCE_DEG
}

function isVerticalAngle(angleDeg: number): boolean {
  const a = Math.abs(((angleDeg % 180) + 180) % 180)
  return Math.abs(a - 90) <= ORTHO_TOLERANCE_DEG
}

export function segmentLength(seg: Segment): number {
  return Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)
}

export function segmentAngleDeg(seg: Segment): number {
  return (Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) * 180) / Math.PI
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

function areCollinear(a: Segment, b: Segment, minTurnDeg: number): boolean {
  return undirectedAngleDiffDeg(segmentAngleDeg(a), segmentAngleDeg(b)) < minTurnDeg
}

function endpointDistanceWithin(a: Segment, b: Segment, maxDistance: number): boolean {
  return (
    Math.hypot(a.a.x - b.a.x, a.a.y - b.a.y) <= maxDistance ||
    Math.hypot(a.a.x - b.b.x, a.a.y - b.b.y) <= maxDistance ||
    Math.hypot(a.b.x - b.a.x, a.b.y - b.a.y) <= maxDistance ||
    Math.hypot(a.b.x - b.b.x, a.b.y - b.b.y) <= maxDistance
  )
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

function sharedEndpoint(a: Segment, b: Segment, snapPx: number): { x: number; y: number } | null {
  const pairs = [
    [a.a, b.a],
    [a.a, b.b],
    [a.b, b.a],
    [a.b, b.b],
  ] as const
  for (const [pa, pb] of pairs) {
    if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= snapPx) {
      return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
    }
  }
  return null
}

function segmentPassesNearPoint(seg: Segment, point: { x: number; y: number }, snapPx: number): boolean {
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

/** Punt nabij platte muur-as (niet alleen eindpunt) — voor chamfer-detectie. */
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

/** Lange ortho-muren mogen lichte scan-drift hebben (|Δy|/|Δx| > 8px band). */
function cornerOrthoBandPx(bandPx: number): number {
  return Math.max(bandPx, 16)
}

function isCornerHorizontal(seg: Segment, bandPx: number): boolean {
  if (isFlatHorizontal(seg, bandPx)) return true
  if (!isHorizontalAngle(segmentAngleDeg(seg)) || !isDominantHorizontal(seg)) return false
  return Math.abs(seg.a.y - seg.b.y) <= cornerOrthoBandPx(bandPx)
}

function isCornerVertical(seg: Segment, bandPx: number): boolean {
  if (isFlatVertical(seg, bandPx)) return true
  if (!isVerticalAngle(segmentAngleDeg(seg)) || !isDominantVertical(seg)) return false
  return Math.abs(seg.a.x - seg.b.x) <= cornerOrthoBandPx(bandPx)
}

function pointNearFlatWallLine(
  point: { x: number; y: number },
  wall: Segment,
  bandPx: number,
  axisReachPx: number,
): boolean {
  const orthoBand = cornerOrthoBandPx(bandPx)
  if (isCornerHorizontal(wall, bandPx)) {
    const xLo = Math.min(wall.a.x, wall.b.x) - axisReachPx
    const xHi = Math.max(wall.a.x, wall.b.x) + axisReachPx
    if (point.x < xLo || point.x > xHi) return false
    return Math.abs(point.y - yOnWallAtX(wall, point.x)) <= orthoBand
  }
  if (isCornerVertical(wall, bandPx)) {
    const yLo = Math.min(wall.a.y, wall.b.y) - axisReachPx
    const yHi = Math.max(wall.a.y, wall.b.y) + axisReachPx
    if (point.y < yLo || point.y > yHi) return false
    return Math.abs(point.x - xOnWallAtY(wall, point.y)) <= orthoBand
  }
  return false
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

function nearestEndpointDistance(seg: Segment, point: { x: number; y: number }): number {
  return Math.min(
    Math.hypot(seg.a.x - point.x, seg.a.y - point.y),
    Math.hypot(seg.b.x - point.x, seg.b.y - point.y),
  )
}

function snapNearestEndpoint(seg: Segment, point: { x: number; y: number }): Segment {
  const toA = Math.hypot(seg.a.x - point.x, seg.a.y - point.y)
  const toB = Math.hypot(seg.b.x - point.x, seg.b.y - point.y)
  if (toA <= toB) {
    return { ...seg, a: { x: point.x, y: point.y } }
  }
  return { ...seg, b: { x: point.x, y: point.y } }
}

function axisConstrainedSnapPoint(
  seg: Segment,
  endpoint: { x: number; y: number },
  hit: { x: number; y: number },
  bandPx: number,
  /** T5 ≈ T4/3 wanneer band = 0.3×ref; override optioneel. */
  collinearOffsetPx: number = Math.max(0.5, bandPx / 3),
): { x: number; y: number } {
  if (isCornerHorizontal(seg, bandPx) || isHorizontalAngle(segmentAngleDeg(seg))) {
    const dy = Math.abs(seg.a.y - seg.b.y)
    if (dy <= collinearOffsetPx) {
      return { x: hit.x, y: endpoint.y }
    }
    if (Math.abs(endpoint.y - hit.y) <= bandPx) {
      return { x: endpoint.x, y: hit.y }
    }
    return endpoint
  }
  if (isCornerVertical(seg, bandPx) || isVerticalAngle(segmentAngleDeg(seg))) {
    const dx = Math.abs(seg.a.x - seg.b.x)
    if (dx <= collinearOffsetPx) {
      return { x: endpoint.x, y: hit.y }
    }
    if (Math.abs(endpoint.x - hit.x) <= bandPx) {
      return { x: hit.x, y: endpoint.y }
    }
    return endpoint
  }
  return { x: hit.x, y: hit.y }
}

function snapNearestEndpointAxisConstrained(
  seg: Segment,
  point: { x: number; y: number },
  bandPx: number,
): Segment {
  const toA = Math.hypot(seg.a.x - point.x, seg.a.y - point.y)
  const toB = Math.hypot(seg.b.x - point.x, seg.b.y - point.y)
  if (toA <= toB) {
    return { ...seg, a: axisConstrainedSnapPoint(seg, seg.a, point, bandPx) }
  }
  return { ...seg, b: axisConstrainedSnapPoint(seg, seg.b, point, bandPx) }
}

function snapEndpointsToPointIfWithinReach(
  seg: Segment,
  point: { x: number; y: number },
  maxReachPx: number,
): Segment {
  let a = seg.a
  let b = seg.b
  if (Math.hypot(a.x - point.x, a.y - point.y) <= maxReachPx) {
    a = { x: point.x, y: point.y }
  }
  if (Math.hypot(b.x - point.x, b.y - point.y) <= maxReachPx) {
    b = { x: point.x, y: point.y }
  }
  return { ...seg, a, b }
}

function snapEndpointsToPointIfWithinReachPreserving(
  seg: Segment,
  point: { x: number; y: number },
  maxReachPx: number,
  bandPx: number,
): Segment {
  let a = seg.a
  let b = seg.b
  if (Math.hypot(a.x - point.x, a.y - point.y) <= maxReachPx) {
    a = axisConstrainedSnapPoint(seg, a, point, bandPx)
  }
  if (Math.hypot(b.x - point.x, b.y - point.y) <= maxReachPx) {
    b = axisConstrainedSnapPoint(seg, b, point, bandPx)
  }
  return { ...seg, a, b }
}

function segmentXRange(seg: Segment): { min: number; max: number } {
  return { min: Math.min(seg.a.x, seg.b.x), max: Math.max(seg.a.x, seg.b.x) }
}

function segmentYRange(seg: Segment): { min: number; max: number } {
  return { min: Math.min(seg.a.y, seg.b.y), max: Math.max(seg.a.y, seg.b.y) }
}

function axisOverlap(a: { min: number; max: number }, b: { min: number; max: number }): number {
  return Math.max(0, Math.min(a.max, b.max) - Math.max(a.min, b.min))
}

function endpointNearPoint(
  p: { x: number; y: number },
  point: { x: number; y: number },
  snapPx: number,
): boolean {
  return Math.hypot(p.x - point.x, p.y - point.y) <= snapPx
}

function otherEndpoint(seg: Segment, point: { x: number; y: number }, snapPx: number): { x: number; y: number } | null {
  if (endpointNearPoint(seg.a, point, snapPx)) return seg.b
  if (endpointNearPoint(seg.b, point, snapPx)) return seg.a
  return null
}

function directionFromPoint(
  seg: Segment,
  point: { x: number; y: number },
  snapPx: number,
): { x: number; y: number } | null {
  const other = otherEndpoint(seg, point, snapPx)
  if (!other) return null
  const dx = other.x - point.x
  const dy = other.y - point.y
  const len = Math.hypot(dx, dy)
  if (len <= 1e-6) return null
  return { x: dx / len, y: dy / len }
}

function collectJunctionPoints(segments: Segment[], snapPx: number): Array<{ x: number; y: number }> {
  const clusters: Array<{ x: number; y: number; count: number }> = []
  for (const seg of segments) {
    for (const p of [seg.a, seg.b]) {
      const existing = clusters.find((c) => Math.hypot(c.x - p.x, c.y - p.y) <= snapPx)
      if (existing) {
        const count = existing.count + 1
        existing.x = (existing.x * existing.count + p.x) / count
        existing.y = (existing.y * existing.count + p.y) / count
        existing.count = count
      } else {
        clusters.push({ x: p.x, y: p.y, count: 1 })
      }
    }
  }
  return clusters.map((c) => ({ x: c.x, y: c.y }))
}

function segmentsAtPoint(segments: Segment[], point: { x: number; y: number }, snapPx: number): number[] {
  const out: number[] = []
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]
    if (endpointNearPoint(seg.a, point, snapPx) || endpointNearPoint(seg.b, point, snapPx)) {
      out.push(i)
    }
  }
  return out
}

/** Segmenten die door een knooppunt lopen zonder daar te eindigen. */
function segmentsThroughPoint(
  segments: Segment[],
  point: { x: number; y: number },
  snapPx: number,
): number[] {
  const out: number[] = []
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]
    if (!segmentPassesNearPoint(seg, point, snapPx)) continue
    if (endpointNearPoint(seg.a, point, snapPx) || endpointNearPoint(seg.b, point, snapPx)) continue
    out.push(i)
  }
  return out
}

function segmentInkSupportRatio(
  seg: Segment,
  mask: Uint8Array | undefined,
  width: number,
  height: number,
  stepPx = 4,
): number {
  if (!mask || width <= 0 || height <= 0) return 1
  const len = segmentLength(seg)
  if (len <= 1e-6) return 0
  const steps = Math.max(1, Math.ceil(len / stepPx))
  let hits = 0
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const x = Math.round(seg.a.x + (seg.b.x - seg.a.x) * t)
    const y = Math.round(seg.a.y + (seg.b.y - seg.a.y) * t)
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    if ((mask[y * width + x] ?? 0) >= 128) hits += 1
  }
  return hits / (steps + 1)
}

function segmentKeepScore(
  seg: Segment,
  mask: Uint8Array | undefined,
  width: number,
  height: number,
): number {
  return segmentLength(seg) * segmentInkSupportRatio(seg, mask, width, height)
}

/** Gerichte hoek-bin vanaf junction — scheidt tegenovergestelde muurarmen (0° vs 180°). */
function directedBinFromJunction(
  seg: Segment,
  point: { x: number; y: number },
  snapPx: number,
): number | null {
  const dir = directionFromPoint(seg, point, snapPx)
  if (!dir) return null
  let angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI
  if (angle < 0) angle += 360
  return Math.round(angle / JUNCTION_DIRECTION_BIN_DEG) % 24
}

function segmentHasInkSupport(
  seg: Segment,
  mask: Uint8Array | undefined,
  width: number,
  height: number,
  minRatio = MIN_INK_SUPPORT_KEEP_PX,
): boolean {
  if (!mask || width <= 0 || height <= 0) return false
  return segmentInkSupportRatio(seg, mask, width, height) >= minRatio
}

function pointKey(p: { x: number; y: number }, snapPx: number): string {
  const qx = Math.round(p.x / snapPx) * snapPx
  const qy = Math.round(p.y / snapPx) * snapPx
  return `${qx}:${qy}`
}

function degreeMapFromSegments(segments: Segment[], snapPx: number): Map<string, number> {
  const degree = new Map<string, number>()
  for (const seg of segments) {
    const aKey = pointKey(seg.a, snapPx)
    const bKey = pointKey(seg.b, snapPx)
    degree.set(aKey, (degree.get(aKey) ?? 0) + 1)
    degree.set(bKey, (degree.get(bKey) ?? 0) + 1)
  }
  return degree
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

export {
  infiniteLineIntersection,
  endpointNearPoint,
  perpendicularOffsetPx,
}
