/**
 * Buitenface van een muur t.o.v. de gebouw-centroid.
 * Dakvlakken liggen/snappen hier — niet op de hartlijn.
 * Hoek = snijpunt van twee buitenfaces (niet face-eind + hartlijn).
 */
import { wallEndpointKey, wallFaces, type WallFaceSegment } from './fml-wall-geom'
import type { Floor, FloorPlan, Point2D, Wall } from './types'

export const OUTER_FACE_SNAP_CM = 15

type OuterFace = WallFaceSegment & { thickness: number }

function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function planFootprintCentroid(plan: FloorPlan | null | undefined): Point2D {
  if (!plan) return { x: 0, y: 0 }
  let sx = 0
  let sy = 0
  let n = 0
  for (const floor of plan.floors) {
    for (const area of floor.areas ?? []) {
      for (const point of area.poly) {
        sx += point.x
        sy += point.y
        n += 1
      }
    }
  }
  if (n > 0) return { x: sx / n, y: sy / n }
  for (const floor of plan.floors) {
    for (const wall of floor.walls) {
      sx += wall.a.x + wall.b.x
      sy += wall.a.y + wall.b.y
      n += 2
    }
  }
  return n > 0 ? { x: sx / n, y: sy / n } : { x: 0, y: 0 }
}

export function floorFootprintCentroid(floor: Floor | null | undefined): Point2D {
  if (!floor) return { x: 0, y: 0 }
  let sx = 0
  let sy = 0
  let n = 0
  for (const area of floor.areas ?? []) {
    for (const point of area.poly) {
      sx += point.x
      sy += point.y
      n += 1
    }
  }
  if (n > 0) return { x: sx / n, y: sy / n }
  for (const wall of floor.walls) {
    sx += wall.a.x + wall.b.x
    sy += wall.a.y + wall.b.y
    n += 2
  }
  return n > 0 ? { x: sx / n, y: sy / n } : { x: 0, y: 0 }
}

/** Face verder van de centroid = buitenkant. Nok/0-dikte blijft hartlijn. */
export function wallOuterFace(
  wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>,
  centroid: Point2D,
): WallFaceSegment {
  if (!(wall.thickness > 1e-6)) return { a: wall.a, b: wall.b }
  const { left, right } = wallFaces(wall)
  const leftMid = midpoint(left.a, left.b)
  const rightMid = midpoint(right.a, right.b)
  return dist(leftMid, centroid) >= dist(rightMid, centroid) ? left : right
}

export function wallInnerFace(
  wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>,
  centroid: Point2D,
): WallFaceSegment {
  if (!(wall.thickness > 1e-6)) return { a: wall.a, b: wall.b }
  const { left, right } = wallFaces(wall)
  const leftMid = midpoint(left.a, left.b)
  const rightMid = midpoint(right.a, right.b)
  return dist(leftMid, centroid) >= dist(rightMid, centroid) ? right : left
}

function projectOnLine(
  point: Point2D,
  a: Point2D,
  b: Point2D,
): { t: number; projected: Point2D; dist: number; len: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) {
    return { t: 0, projected: { x: a.x, y: a.y }, dist: dist(point, a), len: 0 }
  }
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (len * len)
  const projected = { x: a.x + dx * t, y: a.y + dy * t }
  return { t, projected, dist: dist(point, projected), len }
}

function tInPaddedRange(t: number, padAlong: number, len: number): boolean {
  if (len < 1e-9) return Math.abs(t) <= 1
  const padT = padAlong / len
  return t >= -padT && t <= 1 + padT
}

function lineIntersection(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D,
): { point: Point2D; tA: number; tB: number } | null {
  const dax = a2.x - a1.x
  const day = a2.y - a1.y
  const dbx = b2.x - b1.x
  const dby = b2.y - b1.y
  const denom = dax * dby - day * dbx
  if (Math.abs(denom) < 1e-9) return null
  const tA = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom
  const tB = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / denom
  return { point: { x: a1.x + dax * tA, y: a1.y + day * tA }, tA, tB }
}

export function listThickPlanWalls(plan: FloorPlan | null | undefined): Wall[] {
  if (!plan) return []
  return plan.floors.flatMap((floor) => floor.walls.filter((wall) => wall.thickness > 1e-6))
}

/**
 * Buitenhoeken van een floor: snijpunt van twee buitenfaces bij een knoop.
 * Face-einden alleen liggen op de hartlijn-hoek en geven een schuin knikje.
 */
export function listFloorOuterFaceCorners(floor: Floor | null | undefined): Point2D[] {
  if (!floor) return []
  const walls = floor.walls.filter((wall) => wall.thickness > 1e-6)
  if (walls.length < 2) return []
  const centroid = floorFootprintCentroid(floor)
  const atJunction = new Map<string, Wall[]>()
  for (const wall of walls) {
    for (const end of [wall.a, wall.b]) {
      const key = wallEndpointKey(end)
      const group = atJunction.get(key)
      if (group) group.push(wall)
      else atJunction.set(key, [wall])
    }
  }
  const corners: Point2D[] = []
  const seen = new Set<string>()
  for (const group of atJunction.values()) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]
        const b = group[j]
        const fa = wallOuterFace(a, centroid)
        const fb = wallOuterFace(b, centroid)
        const hit = lineIntersection(fa.a, fa.b, fb.a, fb.b)
        if (!hit) continue
        const padA = a.thickness
        const padB = b.thickness
        if (!tInPaddedRange(hit.tA, padA, dist(fa.a, fa.b))) continue
        if (!tInPaddedRange(hit.tB, padB, dist(fb.a, fb.b))) continue
        const key = wallEndpointKey(hit.point)
        if (seen.has(key)) continue
        seen.add(key)
        corners.push(hit.point)
      }
    }
  }
  return corners
}

/**
 * Soft snap naar buitenfaces. Twee nabije faces → hun snijpunt (buitenhoek).
 * Eén face → projectie op die goot. Geen binnenface/hartlijn.
 */
export function snapPointToOuterWallFaces(
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>>,
  centroid: Point2D,
  point: Point2D,
  radiusCm = OUTER_FACE_SNAP_CM,
): Point2D {
  if (radiusCm <= 0 || walls.length === 0) return point
  const faces: OuterFace[] = []
  for (const wall of walls) {
    if (!(wall.thickness > 1e-6)) continue
    faces.push({ ...wallOuterFace(wall, centroid), thickness: wall.thickness })
  }
  if (faces.length === 0) return point

  const near: OuterFace[] = []
  for (const face of faces) {
    const pad = radiusCm + face.thickness
    const hit = projectOnLine(point, face.a, face.b)
    if (hit.dist > pad) continue
    if (!tInPaddedRange(hit.t, pad, hit.len)) continue
    near.push(face)
  }

  let bestCorner: Point2D | null = null
  let bestCornerDist = Infinity
  for (let i = 0; i < near.length; i += 1) {
    for (let j = i + 1; j < near.length; j += 1) {
      const a = near[i]
      const b = near[j]
      const hit = lineIntersection(a.a, a.b, b.a, b.b)
      if (!hit) continue
      const padA = radiusCm + a.thickness
      const padB = radiusCm + b.thickness
      if (!tInPaddedRange(hit.tA, padA, dist(a.a, a.b))) continue
      if (!tInPaddedRange(hit.tB, padB, dist(b.a, b.b))) continue
      const cornerDist = dist(point, hit.point)
      if (cornerDist > Math.max(padA, padB)) continue
      if (cornerDist >= bestCornerDist) continue
      bestCornerDist = cornerDist
      bestCorner = hit.point
    }
  }
  if (bestCorner) return bestCorner

  let bestFace: Point2D | null = null
  let bestFaceDist = Infinity
  for (const face of near) {
    const hit = projectOnLine(point, face.a, face.b)
    const clampedT = Math.max(0, Math.min(1, hit.t))
    const projected =
      hit.len < 1e-9
        ? face.a
        : {
            x: face.a.x + (face.b.x - face.a.x) * clampedT,
            y: face.a.y + (face.b.y - face.a.y) * clampedT,
          }
    const d = dist(point, projected)
    if (d >= bestFaceDist) continue
    bestFaceDist = d
    bestFace = projected
  }
  return bestFace ?? point
}
