import type { RefBBox, RefPoint } from './types'

export type Vec2 = { x: number; y: number }

export type Segment2 = {
  a: RefPoint
  b: RefPoint
  midpoint: RefPoint
  length: number
  angleDeg: number
}

export function clampCropBBox(width: number, height: number, bbox: RefBBox): RefBBox | null {
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  if (x1 <= x0 || y1 <= y0) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export function magnitude(v: Vec2): number {
  return Math.hypot(v.x, v.y)
}

export function normalize(v: Vec2): Vec2 | null {
  const m = magnitude(v)
  if (m <= 1e-6) return null
  return { x: v.x / m, y: v.y / m }
}

export function canonicalizeDirection(dir: Vec2): Vec2 {
  if (dir.x < 0) return { x: -dir.x, y: -dir.y }
  if (Math.abs(dir.x) < 1e-6 && dir.y < 0) return { x: -dir.x, y: -dir.y }
  return dir
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x
}

export function subtract(a: RefPoint, b: RefPoint): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function angleDegFromDir(dir: Vec2): number {
  const deg = (Math.atan2(dir.y, dir.x) * 180) / Math.PI
  let wrapped = deg % 180
  if (wrapped < 0) wrapped += 180
  return wrapped
}

export function angleDiffDeg(aDeg: number, bDeg: number): number {
  const raw = Math.abs(aDeg - bDeg) % 180
  return raw > 90 ? 180 - raw : raw
}

export function pointLineDistance(point: RefPoint, lineOrigin: RefPoint, lineDir: Vec2): number {
  const delta = subtract(point, lineOrigin)
  return Math.abs(cross(delta, lineDir))
}

export function segmentMidpoint(a: RefPoint, b: RefPoint): RefPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function polygonBounds(points: RefPoint[]): RefBBox {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) }
}

export function minSeedLength(points: RefPoint[], override?: number): number {
  if (override != null) return Math.max(2, override)
  const bbox = polygonBounds(points)
  return Math.max(4, Math.round(Math.min(bbox.width, bbox.height) * 0.08))
}

export function buildSegments(points: RefPoint[], minLenPx: number): Segment2[] {
  if (points.length < 2) return []
  const out: Segment2[] = []
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length < minLenPx) continue
    const dir = normalize({ x: b.x - a.x, y: b.y - a.y })
    if (!dir) continue
    out.push({
      a,
      b,
      midpoint: segmentMidpoint(a, b),
      length,
      angleDeg: angleDegFromDir(dir),
    })
  }
  return out
}

export function intersectLines(
  a: { origin: RefPoint; dir: Vec2 },
  b: { origin: RefPoint; dir: Vec2 },
): RefPoint | null {
  const den = cross(a.dir, b.dir)
  if (Math.abs(den) < 1e-6) return null
  const delta = subtract(b.origin, a.origin)
  const t = cross(delta, b.dir) / den
  return {
    x: a.origin.x + a.dir.x * t,
    y: a.origin.y + a.dir.y * t,
  }
}

export function closestPointDistance(point: RefPoint, samples: RefPoint[]): number {
  let best = Number.POSITIVE_INFINITY
  for (const sample of samples) {
    const d = Math.hypot(sample.x - point.x, sample.y - point.y)
    if (d < best) best = d
  }
  return Number.isFinite(best) ? best : Number.POSITIVE_INFINITY
}

export function rotate90(dir: Vec2): Vec2 {
  return { x: -dir.y, y: dir.x }
}

export function directedAngleDeg(from: Vec2, to: Vec2): number {
  const den = magnitude(from) * magnitude(to)
  if (den <= 1e-9) return 0
  const c = Math.max(-1, Math.min(1, dot(from, to) / den))
  return (Math.acos(c) * 180) / Math.PI
}

export function distToNearestBBoxCorner(point: RefPoint, bbox: RefBBox): number {
  const corners: RefPoint[] = [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y },
    { x: bbox.x, y: bbox.y + bbox.height },
    { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
  ]
  return closestPointDistance(point, corners)
}

export function distancePointToSegment(point: RefPoint, a: RefPoint, b: RefPoint): number {
  const ab = subtract(b, a)
  const ap = subtract(point, a)
  const denom = dot(ab, ab)
  if (denom <= 1e-9) return Math.hypot(point.x - a.x, point.y - a.y)
  const t = Math.max(0, Math.min(1, dot(ap, ab) / denom))
  const q = { x: a.x + ab.x * t, y: a.y + ab.y * t }
  return Math.hypot(point.x - q.x, point.y - q.y)
}

export function pointOnPolygonEdge(
  point: RefPoint,
  polygon: RefPoint[],
  tolerancePx: number,
): boolean {
  if (polygon.length < 2) return false
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if (distancePointToSegment(point, a, b) <= tolerancePx) return true
  }
  return false
}

export function pointInPolygon(point: RefPoint, polygon: RefPoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + 1e-9) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

export function pointInOrOnPolygon(
  point: RefPoint,
  polygon: RefPoint[],
  tolerancePx: number,
): boolean {
  if (pointInPolygon(point, polygon)) return true
  return pointOnPolygonEdge(point, polygon, tolerancePx)
}
