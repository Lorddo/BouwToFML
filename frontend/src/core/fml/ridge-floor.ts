/**
 * Op welke verdieping hoort een nok: hoogste floor waarvan de echte
 * voetafdruk het stuk dekt én die niet door een hogere floor wordt bedekt.
 * Handmatig overschrijven via moveRidgeWallsToFloor.
 */
import { wallFaces } from './fml-wall-geom'
import {
  listRidgeWallsOnFloor,
  setRidgeWallsOnFloor,
  syncRidgeWallGuidsFromDesigns,
} from './ridge-walls'
import { listFloorOuterFaceCorners } from './wall-outer-face'
import type { Floor, FloorPlan, Point2D, Wall } from './types'

const FOOTPRINT_SLACK_CM = 40

function pointInPolygon(point: Point2D, ring: Point2D[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (!a || !b) continue
    const intersect =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + 1e-15) + a.x
    if (intersect) inside = !inside
  }
  return inside
}

function distToSeg(point: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return Math.hypot(point.x - a.x, point.y - a.y)
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq))
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t))
}

function cross2(origin: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
}

function convexHull(points: readonly Point2D[]): Point2D[] {
  const sorted = points
    .map((point) => ({ x: point.x, y: point.y }))
    .sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length <= 2) return sorted
  const lower: Point2D[] = []
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross2(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop()
    }
    lower.push(point)
  }
  const upper: Point2D[] = []
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i]
    while (
      upper.length >= 2 &&
      cross2(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop()
    }
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

function floorHullRing(floor: Floor): Point2D[] | null {
  const pts: Point2D[] = []
  for (const wall of floor.walls) {
    if (!(wall.thickness > 1e-6)) continue
    pts.push(wall.a, wall.b)
  }
  if (pts.length < 3) return null
  const hull = convexHull(pts)
  return hull.length >= 3 ? hull : null
}

/** Buitencontour: hoeken = snijpunt van buitenfaces, niet face-eind (geen knikje). */
function floorOuterHullRing(floor: Floor): Point2D[] | null {
  const corners = listFloorOuterFaceCorners(floor)
  const pts = corners.length >= 3 ? corners : collectFaceEndpoints(floor)
  if (pts.length < 3) return null
  const hull = convexHull(pts)
  return hull.length >= 3 ? hull : null
}

function collectFaceEndpoints(floor: Floor): Point2D[] {
  const pts: Point2D[] = []
  for (const wall of floor.walls) {
    if (!(wall.thickness > 1e-6)) continue
    const { left, right } = wallFaces(wall)
    pts.push(left.a, left.b, right.a, right.b)
  }
  return pts
}

export function floorFootprintHitsPoint(floor: Floor, point: Point2D): boolean {
  if (floorInteriorHitsPoint(floor, point)) return true
  for (const wall of floor.walls) {
    const slack = FOOTPRINT_SLACK_CM + Math.max(0, wall.thickness) / 2
    if (distToSeg(point, wall.a, wall.b) <= slack) return true
  }
  return false
}

/** Binnen areas/omtrek — geen muurslack. Gevelvlakken blijven buiten. */
export function floorInteriorHitsPoint(floor: Floor, point: Point2D): boolean {
  for (const area of floor.areas ?? []) {
    if (area.poly.length >= 3 && pointInPolygon(point, area.poly)) return true
  }
  const ring = floorHullRing(floor)
  return ring != null && pointInPolygon(point, ring)
}

export function isPointSkyExposedOnFloor(
  plan: FloorPlan,
  floorIndex: number,
  point: Point2D,
): boolean {
  const floor = plan.floors[floorIndex]
  if (!floor || !floorFootprintHitsPoint(floor, point)) return false
  const next = plan.floors[floorIndex + 1]
  if (next && floorInteriorHitsPoint(next, point)) return false
  return true
}

export function wallIsSkyExposed(plan: FloorPlan, floorIndex: number, wall: Wall): boolean {
  const next = plan.floors[floorIndex + 1]
  if (!next) return true
  const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
  return !floorFootprintHitsPoint(next, mid)
}

export function listSkyExposedWalls(plan: FloorPlan, floorIndex: number): Wall[] {
  const floor = plan.floors[floorIndex]
  if (!floor) return []
  return floor.walls.filter(
    (wall) => wall.thickness > 1e-6 && wallIsSkyExposed(plan, floorIndex, wall),
  )
}

/** Buitenkant van de floor erboven — één vlak (convex hull) voor de Dak-tab. */
export function listBlockedRoofRings(plan: FloorPlan, floorIndex: number): Point2D[][] {
  const next = plan.floors[floorIndex + 1]
  if (!next) return []
  const ring = floorOuterHullRing(next)
  return ring ? [ring] : []
}

/** Buitenmuur: minstens één face valt buiten het interieur. */
function wallIsEnvelope(floor: Floor, wall: Wall): boolean {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return false
  const nx = -dy / len
  const ny = dx / len
  const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
  const half = Math.max(0, wall.thickness) / 2 + 2
  const left = { x: mid.x + nx * half, y: mid.y + ny * half }
  const right = { x: mid.x - nx * half, y: mid.y - ny * half }
  return !floorInteriorHitsPoint(floor, left) || !floorInteriorHitsPoint(floor, right)
}

/** Actieve floor-afdruk + gevel van de floor erboven (dal/goot, geen binnenwanden). */
export function listDakSnapWalls(plan: FloorPlan, floorIndex: number): Wall[] {
  const exposed = listSkyExposedWalls(plan, floorIndex)
  const next = plan.floors[floorIndex + 1]
  if (!next) return exposed
  const seen = new Set(exposed.map((wall) => wall.id))
  const extra = next.walls.filter(
    (wall) => wall.thickness > 1e-6 && !seen.has(wall.id) && wallIsEnvelope(next, wall),
  )
  return [...exposed, ...extra]
}

/** Midpoint → hoogste onbedekte floor; anders hoogste floor met muren. */
export function resolveFloorIndexForRidgeSegment(plan: FloorPlan, a: Point2D, b: Point2D): number {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  for (let index = plan.floors.length - 1; index >= 0; index -= 1) {
    if (isPointSkyExposedOnFloor(plan, index, mid)) return index
  }
  for (let index = plan.floors.length - 1; index >= 0; index -= 1) {
    if ((plan.floors[index]?.walls.length ?? 0) > 0) return index
  }
  return Math.max(0, plan.floors.length - 1)
}

export function findFloorIndexForRidgeWall(
  plan: FloorPlan | null | undefined,
  wallId: string,
): number {
  if (!plan) return -1
  const id = wallId.trim()
  if (!id) return -1
  return plan.floors.findIndex((floor) =>
    listRidgeWallsOnFloor(floor).some((wall) => wall.id === id),
  )
}

export function writeRidgeWallsOnPlan(
  plan: FloorPlan,
  walls: Wall[],
  newWallFloorIndex: number,
): FloorPlan {
  const owners = new Map<string, number>()
  plan.floors.forEach((floor, index) => {
    for (const wall of listRidgeWallsOnFloor(floor)) owners.set(wall.id, index)
  })
  const fallback = Math.max(0, Math.min(newWallFloorIndex, Math.max(0, plan.floors.length - 1)))
  const grouped: Wall[][] = plan.floors.map(() => [])
  for (const wall of walls) {
    const index = owners.get(wall.id) ?? fallback
    grouped[index]?.push(wall)
  }
  const floors = plan.floors.map((floor, index) =>
    setRidgeWallsOnFloor(floor, grouped[index] ?? []),
  )
  const next = { ...plan, floors }
  syncRidgeWallGuidsFromDesigns(next)
  return next
}

export function moveRidgeWallsToFloor(
  plan: FloorPlan,
  wallIds: readonly string[],
  targetFloorIndex: number,
): FloorPlan {
  const idSet = new Set(wallIds.map((id) => id.trim()).filter(Boolean))
  if (idSet.size === 0) return plan
  const target = Math.max(0, Math.min(targetFloorIndex, Math.max(0, plan.floors.length - 1)))
  const moving: Wall[] = []
  const kept = plan.floors.map((floor) => {
    const current = listRidgeWallsOnFloor(floor)
    const stay: Wall[] = []
    for (const wall of current) {
      if (idSet.has(wall.id)) moving.push(wall)
      else stay.push(wall)
    }
    return stay
  })
  if (moving.length === 0) return plan
  kept[target] = [...(kept[target] ?? []), ...moving]
  const floors = plan.floors.map((floor, index) => setRidgeWallsOnFloor(floor, kept[index] ?? []))
  const next = { ...plan, floors }
  syncRidgeWallGuidsFromDesigns(next)
  return next
}
