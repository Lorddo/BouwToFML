import type { Point2D, Wall } from '@/core/fml/types'
import {
  MIN_WALL_LENGTH_CM,
  ROOM_CORNER_ENDPOINT_EPS_T,
  SEGMENT_PARAM_EPS,
  SEGMENT_POINT_EPS_CM,
  buildJunctions,
  cloneWalls,
  cross2,
  distance,
  pointAtT,
  pointParamOnSegment,
  samePoint,
  splitWallAtPoint,
  type WallPointMatch,
} from './fml-preview-junction-core'

function hasSegmentBetween(
  walls: Wall[],
  a: Point2D,
  b: Point2D,
  epsCm = SEGMENT_POINT_EPS_CM,
): boolean {
  for (const wall of walls) {
    if (
      (samePoint(wall.a, a, epsCm) && samePoint(wall.b, b, epsCm)) ||
      (samePoint(wall.a, b, epsCm) && samePoint(wall.b, a, epsCm))
    ) {
      return true
    }
  }
  return false
}

function segmentIntersectionParams(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D,
  eps = SEGMENT_POINT_EPS_CM,
): { t: number; u: number; point: Point2D } | null {
  const r = { x: a2.x - a1.x, y: a2.y - a1.y }
  const s = { x: b2.x - b1.x, y: b2.y - b1.y }
  const denom = cross2(r.x, r.y, s.x, s.y)
  if (Math.abs(denom) <= eps) return null
  const qp = { x: b1.x - a1.x, y: b1.y - a1.y }
  const t = cross2(qp.x, qp.y, s.x, s.y) / denom
  const u = cross2(qp.x, qp.y, r.x, r.y) / denom
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null
  return {
    t,
    u,
    point: pointAtT(a1, a2, t),
  }
}

/** Shared with wall-slide connector stubs; not part of public barrel API. */
export function splitCrossedWallsAlongSegment(walls: Wall[], a: Point2D, b: Point2D): void {
  let changed = true
  while (changed) {
    changed = false
    for (const wall of [...walls]) {
      const hit = segmentIntersectionParams(a, b, wall.a, wall.b)
      if (!hit) continue
      if (hit.t <= SEGMENT_PARAM_EPS || hit.t >= 1 - SEGMENT_PARAM_EPS) continue
      if (hit.u <= SEGMENT_PARAM_EPS || hit.u >= 1 - SEGMENT_PARAM_EPS) continue
      if (splitWallAtPoint(walls, wall, hit.point, hit.u)) {
        changed = true
        break
      }
    }
  }
}

/**
 * Zelfde effect als tekenen over een muur: interior-kruisingen van `wallId`
 * (en stukken na split) met andere muren worden echte junctions (beide muren splitsen).
 * Shared with wall-slide; not part of public barrel API.
 */
export function materializeCrossingsAlongWall(walls: Wall[], wallId: string): void {
  const involved = new Set<string>([wallId])
  let changed = true
  while (changed) {
    changed = false
    for (const id of [...involved]) {
      const wall = walls.find((item) => item.id === id)
      if (!wall) continue
      for (const other of [...walls]) {
        if (other.id === wall.id) continue
        const hit = segmentIntersectionParams(wall.a, wall.b, other.a, other.b)
        if (!hit) continue
        if (hit.t <= SEGMENT_PARAM_EPS || hit.t >= 1 - SEGMENT_PARAM_EPS) continue
        if (hit.u <= SEGMENT_PARAM_EPS || hit.u >= 1 - SEGMENT_PARAM_EPS) continue

        const wallRef = walls.find((item) => item.id === id)
        if (!wallRef) continue
        const tWall = pointParamOnSegment(wallRef.a, wallRef.b, hit.point, SEGMENT_POINT_EPS_CM)
        if (tWall == null || tWall <= SEGMENT_PARAM_EPS || tWall >= 1 - SEGMENT_PARAM_EPS) {
          continue
        }

        const idsBefore = new Set(walls.map((item) => item.id))
        if (!splitWallAtPoint(walls, wallRef, hit.point, tWall)) continue
        for (const item of walls) {
          if (!idsBefore.has(item.id)) involved.add(item.id)
        }

        const otherRef = walls.find((item) => item.id === other.id)
        if (otherRef) {
          const tOther = pointParamOnSegment(
            otherRef.a,
            otherRef.b,
            hit.point,
            SEGMENT_POINT_EPS_CM,
          )
          if (tOther != null && tOther > SEGMENT_PARAM_EPS && tOther < 1 - SEGMENT_PARAM_EPS) {
            splitWallAtPoint(walls, otherRef, hit.point, tOther)
          }
        }
        changed = true
        break
      }
      if (changed) break
    }
  }
}

function isWallCollinearWithSegment(wall: Wall, a: Point2D, b: Point2D): boolean {
  const segVec = { x: b.x - a.x, y: b.y - a.y }
  const wallVec = { x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y }
  const segLen = Math.hypot(segVec.x, segVec.y)
  const wallLen = Math.hypot(wallVec.x, wallVec.y)
  if (segLen < 1e-9 || wallLen < 1e-9) return false
  const cross = Math.abs(cross2(segVec.x, segVec.y, wallVec.x, wallVec.y))
  return cross <= SEGMENT_POINT_EPS_CM * Math.max(segLen, wallLen)
}

/** Shared with wall-slide connector stubs; not part of public barrel API. */
export function splitCarrierWallsAtJunctionsOnSegment(walls: Wall[], a: Point2D, b: Point2D): void {
  let changed = true
  while (changed) {
    changed = false
    const hits = buildJunctions(walls)
      .map((junction) => {
        const t = pointParamOnSegment(a, b, { x: junction.x, y: junction.y }, SEGMENT_POINT_EPS_CM)
        if (t == null || t <= SEGMENT_PARAM_EPS || t >= 1 - SEGMENT_PARAM_EPS) return null
        return { t, point: { x: junction.x, y: junction.y } }
      })
      .filter((item): item is { t: number; point: Point2D } => item != null)
      .sort((left, right) => left.t - right.t)
    if (hits.length === 0) return

    for (const hit of hits) {
      for (const wall of [...walls]) {
        if (!isWallCollinearWithSegment(wall, a, b)) continue
        const tWall = pointParamOnSegment(wall.a, wall.b, hit.point, SEGMENT_POINT_EPS_CM)
        if (tWall == null || tWall <= SEGMENT_PARAM_EPS || tWall >= 1 - SEGMENT_PARAM_EPS) continue
        if (splitWallAtPoint(walls, wall, hit.point, tWall)) {
          changed = true
          break
        }
      }
      if (changed) break
    }
  }
}

function collectSegmentBreakpoints(walls: Wall[], a: Point2D, b: Point2D): Point2D[] {
  const tValues: number[] = [0, 1]
  const junctions = buildJunctions(walls)
  for (const junction of junctions) {
    const t = pointParamOnSegment(a, b, { x: junction.x, y: junction.y }, SEGMENT_POINT_EPS_CM)
    if (t == null) continue
    if (t <= SEGMENT_PARAM_EPS || t >= 1 - SEGMENT_PARAM_EPS) continue
    if (tValues.some((existing) => Math.abs(existing - t) <= SEGMENT_PARAM_EPS)) continue
    tValues.push(t)
  }
  tValues.sort((left, right) => left - right)
  return tValues.map((t) => pointAtT(a, b, t))
}

/** Shared with wall-slide connector stubs; not part of public barrel API. */
export function addSegmentPathWithJunctionBreaks(
  walls: Wall[],
  a: Point2D,
  b: Point2D,
  options: {
    thickness: number
    balance?: number
    idPrefix: string
    minLengthCm: number
    /** Optionele az/bz (+ overige extras) voor nieuwe segmenten. */
    endpointExtras?: Wall['extras']
  },
): string[] {
  splitCrossedWallsAlongSegment(walls, a, b)
  const points = collectSegmentBreakpoints(walls, a, b)
  const addedIds: string[] = []
  for (let idx = 0; idx + 1 < points.length; idx += 1) {
    const p1 = points[idx]
    const p2 = points[idx + 1]
    if (distance(p1, p2) < options.minLengthCm) continue
    if (hasSegmentBetween(walls, p1, p2)) continue
    const wallId = `${options.idPrefix}-${crypto.randomUUID().slice(0, 8)}`
    walls.push({
      id: wallId,
      a: { x: p1.x, y: p1.y },
      b: { x: p2.x, y: p2.y },
      thickness: options.thickness,
      balance: options.balance,
      openings: [],
      extras: options.endpointExtras ? { ...options.endpointExtras } : undefined,
    })
    addedIds.push(wallId)
  }
  return addedIds
}

export function addWallSegment(
  walls: Wall[],
  a: Point2D,
  b: Point2D,
  thicknessCm: number,
  floorHeightCm?: number,
): { walls: Wall[]; wallId: string; wallIds: string[] } | null {
  if (distance(a, b) < MIN_WALL_LENGTH_CM) return null
  const next = cloneWalls(walls)
  const thickness = Math.max(1, Math.min(200, Math.round(thicknessCm)))
  const endpoint =
    floorHeightCm != null && Number.isFinite(floorHeightCm) && floorHeightCm > 0
      ? { z: 0, h: Math.round(floorHeightCm) }
      : null
  const wallIds = addSegmentPathWithJunctionBreaks(next, a, b, {
    thickness,
    idPrefix: 'wall',
    minLengthCm: MIN_WALL_LENGTH_CM,
    endpointExtras: endpoint ? { az: endpoint, bz: { ...endpoint } } : undefined,
  })
  if (wallIds.length === 0) return null
  return { walls: next, wallId: wallIds[0], wallIds }
}

export function findWallAtPoint(
  walls: Wall[],
  point: Point2D,
  toleranceCm = 1.5,
  excludeWallIds?: ReadonlySet<string>,
): WallPointMatch | null {
  let best: WallPointMatch | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const wall of walls) {
    if (excludeWallIds?.has(wall.id)) continue
    const t = pointParamOnSegment(wall.a, wall.b, point, toleranceCm)
    if (t == null) continue
    if (t <= ROOM_CORNER_ENDPOINT_EPS_T || t >= 1 - ROOM_CORNER_ENDPOINT_EPS_T) continue
    const projected = {
      x: wall.a.x + (wall.b.x - wall.a.x) * t,
      y: wall.a.y + (wall.b.y - wall.a.y) * t,
    }
    const dist = distance(point, projected)
    if (dist > toleranceCm || dist >= bestDistance) continue
    bestDistance = dist
    best = {
      wallId: wall.id,
      wall,
      t,
      projected,
      distanceCm: dist,
    }
  }
  return best
}

/**
 * Als `point` op het binnenste van een muur ligt, split die muur (T-junction).
 * Shared with wall-slide / junction-move; not part of public barrel API.
 */
export function materializeEndpointJoinsAtPoint(
  walls: Wall[],
  point: Point2D,
  options?: {
    excludeWallIds?: ReadonlySet<string>
    toleranceCm?: number
    /** Voorkom parallelle dubbele muren na collinear relink/slide. */
    skipCollinearWith?: { a: Point2D; b: Point2D }
  },
): void {
  const toleranceCm = options?.toleranceCm ?? SEGMENT_POINT_EPS_CM * 4
  let changed = true
  while (changed) {
    changed = false
    for (const wall of [...walls]) {
      if (options?.excludeWallIds?.has(wall.id)) continue
      if (
        options?.skipCollinearWith &&
        isWallCollinearWithSegment(wall, options.skipCollinearWith.a, options.skipCollinearWith.b)
      ) {
        continue
      }
      const t = pointParamOnSegment(wall.a, wall.b, point, toleranceCm)
      if (t == null || t <= SEGMENT_PARAM_EPS || t >= 1 - SEGMENT_PARAM_EPS) continue
      const projected = pointAtT(wall.a, wall.b, t)
      if (distance(point, projected) > toleranceCm) continue
      if (splitWallAtPoint(walls, wall, projected, t)) {
        changed = true
        break
      }
    }
  }
}

/**
 * Voegt een rechthoekige kamer toe als 4 verbonden muren.
 * Als een hoek op een bestaande muur valt, splitst die muur op het raakpunt
 * zodat de nieuwe hoek op een echte junction landt.
 */
export function addRoomRect(
  walls: Wall[],
  corners: readonly Point2D[],
  thicknessCm: number,
  floorHeightCm?: number,
): { walls: Wall[]; wallIds: string[] } | null {
  if (corners.length !== 4) return null
  const next = cloneWalls(walls)
  const snappedCorners = corners.map((corner) => ({ x: corner.x, y: corner.y }))
  let changed = false
  const endpoint =
    floorHeightCm != null && Number.isFinite(floorHeightCm) && floorHeightCm > 0
      ? { z: 0, h: Math.round(floorHeightCm) }
      : null
  const endpointExtras = endpoint ? { az: endpoint, bz: { ...endpoint } } : undefined

  for (let idx = 0; idx < snappedCorners.length; idx += 1) {
    const corner = snappedCorners[idx]
    const match = findWallAtPoint(next, corner)
    if (!match) continue
    snappedCorners[idx] = { ...match.projected }
    const hostWall = next.find((item) => item.id === match.wallId)
    if (!hostWall) continue
    if (splitWallAtPoint(next, hostWall, match.projected, match.t)) {
      changed = true
    }
  }

  const addedIds: string[] = []
  for (let idx = 0; idx < snappedCorners.length; idx += 1) {
    const a = snappedCorners[idx]
    const b = snappedCorners[(idx + 1) % snappedCorners.length]
    const edgeIds = addSegmentPathWithJunctionBreaks(next, a, b, {
      thickness: Math.max(1, Math.min(200, Math.round(thicknessCm))),
      idPrefix: 'wall',
      minLengthCm: MIN_WALL_LENGTH_CM,
      endpointExtras,
    })
    if (edgeIds.length > 0) changed = true
    addedIds.push(...edgeIds)
  }

  if (!changed) return null
  return { walls: next, wallIds: addedIds }
}
