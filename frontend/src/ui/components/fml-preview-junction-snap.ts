import type { Point2D, Wall } from '@/core/fml/types'
import {
  ENDPOINT_SNAP_RADIUS_CM,
  ROOM_DRAW_END_SNAP_CM,
  ROOM_DRAW_SNAP_CM,
  WALL_AXIS_EPS_CM,
  distance,
  refKey,
  type JunctionNode,
  type WallEndRef,
} from './fml-preview-junction-core'
import { findWallAtPoint } from './fml-preview-wall-draw-geom'

function isWallSegmentHorizontal(wall: { a: Point2D; b: Point2D }): boolean {
  const dx = Math.abs(wall.b.x - wall.a.x)
  const dy = Math.abs(wall.b.y - wall.a.y)
  if (dx < WALL_AXIS_EPS_CM && dy < WALL_AXIS_EPS_CM) return true
  return dx >= dy
}

/** Shift-snap t.o.v. het vaste andere eindpunt van de muur (niet t.o.v. sleep-start). */
export function applyShiftSnapFromOppositeEnd(
  walls: Wall[],
  refs: WallEndRef[],
  candidate: Point2D,
  preferredWallId?: string | null,
): Point2D {
  const ref =
    (preferredWallId ? refs.find((item) => item.wallId === preferredWallId) : null) ?? refs[0]
  if (!ref) return candidate

  const wall = walls.find((item) => item.id === ref.wallId)
  if (!wall) return candidate

  const anchor = ref.end === 'a' ? wall.b : wall.a
  const dx = Math.abs(candidate.x - anchor.x)
  const dy = Math.abs(candidate.y - anchor.y)
  if (dx >= dy) {
    return { x: candidate.x, y: anchor.y }
  }
  return { x: anchor.x, y: candidate.y }
}

/**
 * Shift-snap: elk verbonden segment blijft H/V t.o.v. zijn vaste andere eindpunt.
 * Werkt voor gesplitste muren (collinear) en hoeken (x én y vast).
 */
export function applyShiftSnapAxisAligned(
  walls: Wall[],
  refs: WallEndRef[],
  candidate: Point2D,
): Point2D {
  const horizontalYs: number[] = []
  const verticalXs: number[] = []

  for (const ref of refs) {
    const wall = walls.find((item) => item.id === ref.wallId)
    if (!wall) continue
    const anchor = ref.end === 'a' ? wall.b : wall.a
    if (isWallSegmentHorizontal(wall)) {
      horizontalYs.push(anchor.y)
    } else {
      verticalXs.push(anchor.x)
    }
  }

  return {
    x: verticalXs.length > 0 ? verticalXs[0] : candidate.x,
    y: horizontalYs.length > 0 ? horizontalYs[0] : candidate.y,
  }
}

/** Shift-snap voor knooppunten met meerdere muur-einden (bv. na split). */
export function applyShiftSnapFromAllOppositeEnds(
  walls: Wall[],
  refs: WallEndRef[],
  candidate: Point2D,
): Point2D {
  if (refs.length === 0) return candidate
  if (refs.length === 1) {
    return applyShiftSnapFromOppositeEnd(walls, refs, candidate, refs[0].wallId)
  }
  return applyShiftSnapAxisAligned(walls, refs, candidate)
}

/** Lichte H/V-snap naar punten (onafhankelijk per as) — zelfde magnet als muureinden. */
export function snapToNearbyPointAxes(
  points: ReadonlyArray<Point2D>,
  candidate: Point2D,
  radiusCm = ENDPOINT_SNAP_RADIUS_CM,
): Point2D {
  let x = candidate.x
  let y = candidate.y
  let bestDx = radiusCm
  let bestDy = radiusCm

  for (const point of points) {
    const dx = Math.abs(candidate.x - point.x)
    if (dx < bestDx) {
      bestDx = dx
      x = point.x
    }
    const dy = Math.abs(candidate.y - point.y)
    if (dy < bestDy) {
      bestDy = dy
      y = point.y
    }
  }

  return { x, y }
}

/** Lichte H/V-snap naar andere muuruiteinden (onafhankelijk per as). */
export function snapToNearbyEndpointAxes(
  walls: Wall[],
  movingRefs: WallEndRef[],
  candidate: Point2D,
  radiusCm = ENDPOINT_SNAP_RADIUS_CM,
): Point2D {
  const movingKeys = new Set(movingRefs.map((ref) => refKey(ref)))
  const points: Point2D[] = []

  for (const wall of walls) {
    for (const end of ['a', 'b'] as const) {
      const key = `${wall.id}:${end}`
      if (movingKeys.has(key)) continue
      points.push(wall[end])
    }
  }

  return snapToNearbyPointAxes(points, candidate, radiusCm)
}

/**
 * Shift bij polygoon-vertex: elke aanliggende ribbe wordt H of V
 * (zelfde idee als muur-eind Shift t.o.v. het andere uiteinde).
 */
export function snapPolygonVertexAxisLock(
  poly: ReadonlyArray<Point2D>,
  index: number,
  candidate: Point2D,
): Point2D {
  if (poly.length < 2 || index < 0 || index >= poly.length) return candidate
  const prev = poly[(index - 1 + poly.length) % poly.length]
  const next = poly[(index + 1) % poly.length]
  const anchors = prev === next || (prev.x === next.x && prev.y === next.y) ? [prev] : [prev, next]
  const horizontalYs: number[] = []
  const verticalXs: number[] = []
  for (const anchor of anchors) {
    const dx = Math.abs(candidate.x - anchor.x)
    const dy = Math.abs(candidate.y - anchor.y)
    if (dx >= dy) horizontalYs.push(anchor.y)
    else verticalXs.push(anchor.x)
  }
  return {
    x: verticalXs.length > 0 ? verticalXs[0] : candidate.x,
    y: horizontalYs.length > 0 ? horizontalYs[0] : candidate.y,
  }
}

const VERTEX_EDGE_ENDPOINT_T = 0.05

function projectOnSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D,
): { dist: number; t: number; projected: Point2D } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) {
    return { dist: distance(p, a), t: 0, projected: { x: a.x, y: a.y } }
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  const projected = { x: a.x + t * dx, y: a.y + t * dy }
  return { dist: distance(p, projected), t, projected }
}

/** Dichtstbijzijnde punt binnen radius, anders null. */
export function closestPointInRadius(
  points: ReadonlyArray<Point2D>,
  candidate: Point2D,
  maxDistCm: number,
): Point2D | null {
  let best: Point2D | null = null
  let bestDist = maxDistCm
  for (const point of points) {
    const dist = distance(candidate, point)
    if (dist <= bestDist) {
      bestDist = dist
      best = { x: point.x, y: point.y }
    }
  }
  return best
}

/** Projectie op het midden van een segment (uiteinden laten vertex-snap winnen). */
export function closestSegmentProjection(
  segments: ReadonlyArray<{ a: Point2D; b: Point2D }>,
  candidate: Point2D,
  maxDistCm: number,
): Point2D | null {
  let best: Point2D | null = null
  let bestDist = maxDistCm
  for (const seg of segments) {
    const { dist, t, projected } = projectOnSegment(candidate, seg.a, seg.b)
    if (t <= VERTEX_EDGE_ENDPOINT_T || t >= 1 - VERTEX_EDGE_ENDPOINT_T) continue
    if (dist <= bestDist) {
      bestDist = dist
      best = projected
    }
  }
  return best
}

export function closedRingSegments(
  ring: ReadonlyArray<Point2D>,
): Array<{ a: Point2D; b: Point2D }> {
  if (ring.length < 2) return []
  const segs: Array<{ a: Point2D; b: Point2D }> = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    segs.push({ a, b })
  }
  if (ring.length === 2) return segs.slice(0, 1)
  return segs
}

export function openPolylineSegments(
  points: ReadonlyArray<Point2D>,
): Array<{ a: Point2D; b: Point2D }> {
  const segs: Array<{ a: Point2D; b: Point2D }> = []
  for (let i = 1; i < points.length; i++) {
    segs.push({ a: points[i - 1], b: points[i] })
  }
  return segs
}

/**
 * Hoek eerst, daarna ribbe. Null = niets binnen radius.
 */
export function snapToPolygonGeometry(
  candidate: Point2D,
  vertices: ReadonlyArray<Point2D>,
  segments: ReadonlyArray<{ a: Point2D; b: Point2D }>,
  radiusCm: number,
): Point2D | null {
  return (
    closestPointInRadius(vertices, candidate, radiusCm) ??
    closestSegmentProjection(segments, candidate, radiusCm)
  )
}

/**
 * Kamer-eindhoek: 8 cm H/V naar andere knopen, daarna knoop-landing.
 * Assen van de startknoop tellen niet mee — anders klapt een smalle kamer dicht.
 */
export function snapRoomDrawEndPoint(
  junctions: ReadonlyArray<Pick<JunctionNode, 'x' | 'y'>>,
  walls: Wall[],
  candidate: Point2D,
  start: Point2D,
): Point2D {
  const xAnchors = junctions.filter((junction) => Math.abs(junction.x - start.x) > 1)
  const yAnchors = junctions.filter((junction) => Math.abs(junction.y - start.y) > 1)
  const axis = {
    x: snapToNearbyPointAxes(xAnchors, candidate, ROOM_DRAW_END_SNAP_CM).x,
    y: snapToNearbyPointAxes(yAnchors, candidate, ROOM_DRAW_END_SNAP_CM).y,
  }
  const junctionSnap = snapPointToJunctions(junctions, axis, ROOM_DRAW_END_SNAP_CM)
  return snapPointToWallCenters(walls, junctionSnap, ROOM_DRAW_SNAP_CM)
}

export function snapPointToJunctions(
  junctions: ReadonlyArray<Pick<JunctionNode, 'x' | 'y'>>,
  point: Point2D,
  maxDistCm: number,
): Point2D {
  let best: Point2D = point
  let bestDist = maxDistCm
  for (const junction of junctions) {
    const dist = distance(point, junction)
    if (dist <= bestDist) {
      bestDist = dist
      best = { x: junction.x, y: junction.y }
    }
  }
  return best
}

/** Soft snap naar hartlijn van een bestaande muur (T-junction landings). */
export function snapPointToWallCenters(
  walls: Wall[],
  point: Point2D,
  maxDistCm: number,
  excludeWallIds?: ReadonlySet<string>,
): Point2D {
  const match = findWallAtPoint(walls, point, maxDistCm, excludeWallIds)
  if (!match) return point
  return { x: match.projected.x, y: match.projected.y }
}

export function snapDrawWallEndpoint(
  start: Point2D,
  candidate: Point2D,
  axisLock: boolean,
): Point2D {
  if (!axisLock) return candidate
  const dx = Math.abs(candidate.x - start.x)
  const dy = Math.abs(candidate.y - start.y)
  if (dx >= dy) return { x: candidate.x, y: start.y }
  return { x: start.x, y: candidate.y }
}
