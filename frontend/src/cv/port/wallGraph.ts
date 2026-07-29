import type { Point2D } from '@/core/fml/types'
import RBush from 'rbush'

export interface Segment {
  a: Point2D
  b: Point2D
  /** LBE-voorbeeld dat dit segment domineert (voor kleur + kernel). */
  templateIndex?: number
}

export interface WallGraphOptions {
  snapRadiusPx?: number
  minLengthPx?: number
  angleToleranceDeg?: number
}

export type WallOrientation = 'horizontal' | 'vertical'

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function segmentAngle(seg: Segment): number {
  return Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x)
}

/** Plattegronden zijn haaks — arcering/hatching levert schuine lijnen die we weggooien. */
function isAxisAligned(seg: Segment, tolDeg = 15): boolean {
  const deg = (segmentAngle(seg) * 180) / Math.PI
  const abs = Math.abs(deg)
  return (
    abs < tolDeg || abs > 180 - tolDeg || Math.abs(abs - 90) < tolDeg || Math.abs(abs + 90) < tolDeg
  )
}

function anglesSimilar(a1: number, a2: number, tolRad: number): boolean {
  let d = Math.abs(a1 - a2) % Math.PI
  if (d > Math.PI / 2) d = Math.PI - d
  return d < tolRad
}

type PointItem = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  index: number
}

function snapEndpoints(segments: Segment[], radius: number): Segment[] {
  const points: Point2D[] = []
  for (const s of segments) {
    points.push(s.a, s.b)
  }
  const tree = new RBush<PointItem>()
  points.forEach((point, index) => {
    tree.insert({ minX: point.x, minY: point.y, maxX: point.x, maxY: point.y, index })
  })

  const snapped = points.map((p) => {
    let best = p
    let bestDist = radius
    const nearby = tree.search({
      minX: p.x - radius,
      minY: p.y - radius,
      maxX: p.x + radius,
      maxY: p.y + radius,
    })
    for (const item of nearby) {
      const other = points[item.index]
      const d = dist(p, other)
      if (d < bestDist && d > 0) {
        bestDist = d
        best = other
      }
    }
    return best
  })

  const result: Segment[] = []
  for (let i = 0; i < segments.length; i++) {
    result.push({
      a: snapped[i * 2],
      b: snapped[i * 2 + 1],
      templateIndex: segments[i].templateIndex,
    })
  }
  return result
}

function segmentLength(seg: Segment): number {
  return dist(seg.a, seg.b)
}

function mergeCollinear(segments: Segment[], angleTol: number, snapRadius: number): Segment[] {
  const merged: Segment[] = []
  const used = new Set<number>()

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue
    let seg = { ...segments[i] }
    used.add(i)

    for (let j = i + 1; j < segments.length; j++) {
      if (used.has(j)) continue
      const other = segments[j]
      if (!anglesSimilar(segmentAngle(seg), segmentAngle(other), angleTol)) continue

      const onLine =
        dist(seg.a, other.a) < snapRadius ||
        dist(seg.a, other.b) < snapRadius ||
        dist(seg.b, other.a) < snapRadius ||
        dist(seg.b, other.b) < snapRadius

      if (onLine) {
        if (
          seg.templateIndex != null &&
          other.templateIndex != null &&
          seg.templateIndex !== other.templateIndex
        ) {
          continue
        }
        const pts = [seg.a, seg.b, other.a, other.b]
        pts.sort((p1, p2) => p1.x - p2.x || p1.y - p2.y)
        const keepOther = segmentLength(other) > segmentLength(seg)
        seg = {
          a: pts[0],
          b: pts[pts.length - 1],
          templateIndex: keepOther ? other.templateIndex : seg.templateIndex,
        }
        used.add(j)
      }
    }
    merged.push(seg)
  }
  return merged
}

function snapToOrthogonal(seg: Segment, tolDeg = 12): Segment | null {
  const dx = seg.b.x - seg.a.x
  const dy = seg.b.y - seg.a.y
  const len = Math.hypot(dx, dy)
  if (len < 1) return null

  const deg = (Math.atan2(dy, dx) * 180) / Math.PI
  const abs = Math.abs(deg)

  if (abs < tolDeg || abs > 180 - tolDeg) {
    const y = (seg.a.y + seg.b.y) / 2
    const x0 = Math.min(seg.a.x, seg.b.x)
    const x1 = Math.max(seg.a.x, seg.b.x)
    return { a: { x: x0, y }, b: { x: x1, y }, templateIndex: seg.templateIndex }
  }
  if (Math.abs(abs - 90) < tolDeg) {
    const x = (seg.a.x + seg.b.x) / 2
    const y0 = Math.min(seg.a.y, seg.b.y)
    const y1 = Math.max(seg.a.y, seg.b.y)
    return { a: { x, y: y0 }, b: { x, y: y1 }, templateIndex: seg.templateIndex }
  }
  return null
}

export function buildWallGraph(segments: Segment[], options: WallGraphOptions = {}): Segment[] {
  const snapRadius = options.snapRadiusPx ?? 12
  const minLen = options.minLengthPx ?? 20
  const angleTol = ((options.angleToleranceDeg ?? 8) * Math.PI) / 180
  const maxInput = 2000

  const orthTol = options.angleToleranceDeg ?? 15
  const snapTol = options.angleToleranceDeg ?? 12

  let result = segments
    .filter((s) => dist(s.a, s.b) >= minLen)
    .filter((s) => isAxisAligned(s, orthTol))
    .map((s) => snapToOrthogonal(s, snapTol))
    .filter((s): s is Segment => s !== null)

  if (result.length > maxInput) {
    result = [...result].sort((a, b) => dist(b.a, b.b) - dist(a.a, a.b)).slice(0, maxInput)
  }

  result = snapEndpoints(result, snapRadius)
  result = mergeCollinear(result, angleTol, snapRadius)

  return result
}
