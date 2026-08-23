/**
 * Dakvlak-punt snap naar buitenfaces (hoek = snijpunt van twee goten).
 * Geen automatische vlak-generatie — tekenen of aanzicht 2-klik.
 */
import { listDakSnapWalls } from './ridge-floor'
import { ROOF_TOUCH_SLACK_CM } from './roof-planes'
import type { FloorPlan, Point2D, Wall } from './types'
import { parseEndpoint3D } from './wall-endpoint-height'
import {
  listThickPlanWalls,
  planFootprintCentroid,
  snapPointToOuterWallFaces,
  wallOuterFace,
} from './wall-outer-face'

function hypot2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

function pointOnSeg(
  p: Point2D,
  a: Point2D,
  b: Point2D,
): { dist: number; t: number; point: Point2D } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) {
    return { dist: hypot2(p.x, p.y, a.x, a.y), t: 0, point: { x: a.x, y: a.y } }
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  const point = { x: a.x + dx * t, y: a.y + dy * t }
  return { dist: hypot2(p.x, p.y, point.x, point.y), t, point }
}

function wallTopAtEnd(wall: Wall, end: 'a' | 'b', floorHeightCm: number): number {
  const parsed = parseEndpoint3D(end === 'a' ? wall.extras?.az : wall.extras?.bz, floorHeightCm)
  return parsed.h
}

function wallTopAtPoint(wall: Wall, point: Point2D, floorHeightCm: number): number {
  const hit = pointOnSeg(point, wall.a, wall.b)
  const za = wallTopAtEnd(wall, 'a', floorHeightCm)
  const zb = wallTopAtEnd(wall, 'b', floorHeightCm)
  return za + (zb - za) * hit.t
}

/** Snap XY+Z naar buitenfaces; hoek = snijpunt van twee goten (geen hartlijn). */
export function snapRoofVertexToWallFace(params: {
  plan: FloorPlan
  point: Point2D
  maxDist?: number
  floorIndex?: number
}): { x: number; y: number; z: number } | null {
  const maxDist = params.maxDist ?? ROOF_TOUCH_SLACK_CM * 2
  const centroid = planFootprintCentroid(params.plan)
  const walls =
    params.floorIndex != null
      ? listDakSnapWalls(params.plan, params.floorIndex)
      : listThickPlanWalls(params.plan)
  if (walls.length === 0) return null
  const snapped = snapPointToOuterWallFaces(walls, centroid, params.point, maxDist)
  let best: { z: number; dist: number } | null = null
  const floors =
    params.floorIndex != null
      ? [params.plan.floors[params.floorIndex], params.plan.floors[params.floorIndex + 1]].filter(
          (floor): floor is NonNullable<typeof floor> => floor != null,
        )
      : params.plan.floors
  for (const floor of floors) {
    for (const wall of floor.walls) {
      if (!(wall.thickness > 1e-6)) continue
      const face = wallOuterFace(wall, centroid)
      const hit = pointOnSeg(snapped, face.a, face.b)
      if (hit.dist > maxDist + wall.thickness) continue
      if (best && hit.dist >= best.dist) continue
      best = { z: wallTopAtPoint(wall, hit.point, floor.height), dist: hit.dist }
    }
  }
  if (!best) return null
  return { x: snapped.x, y: snapped.y, z: Math.round(best.z) }
}

/** Z van het dichtstbijzijnde buitenface (hoek deelt Z van de nabije goot). */
export function snapRoofVertexZ(params: {
  plan: FloorPlan
  floorIndex: number
  point: Point2D
}): number {
  const face = snapRoofVertexToWallFace({
    plan: params.plan,
    point: params.point,
    floorIndex: params.floorIndex,
  })
  if (face) return face.z
  const floor = params.plan.floors[params.floorIndex]
  return floor ? Math.round(floor.height) : 0
}
