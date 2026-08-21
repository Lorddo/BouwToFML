/**
 * Op welke verdieping hoort een nok: hoogste floor waarvan de voetafdruk
 * het getekende stuk dekt. Handmatig overschrijven via moveRidgeWallsToFloor.
 */
import {
  listRidgeWallsOnFloor,
  setRidgeWallsOnFloor,
  syncRidgeWallGuidsFromDesigns,
} from './ridge-walls'
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

function wallsBounds(
  floor: Floor,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (floor.walls.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const wall of floor.walls) {
    minX = Math.min(minX, wall.a.x, wall.b.x)
    minY = Math.min(minY, wall.a.y, wall.b.y)
    maxX = Math.max(maxX, wall.a.x, wall.b.x)
    maxY = Math.max(maxY, wall.a.y, wall.b.y)
  }
  return { minX, minY, maxX, maxY }
}

export function floorFootprintHitsPoint(floor: Floor, point: Point2D): boolean {
  for (const area of floor.areas ?? []) {
    if (area.poly.length >= 3 && pointInPolygon(point, area.poly)) return true
  }
  const box = wallsBounds(floor)
  if (
    box &&
    point.x >= box.minX &&
    point.x <= box.maxX &&
    point.y >= box.minY &&
    point.y <= box.maxY
  ) {
    return true
  }
  for (const wall of floor.walls) {
    const slack = FOOTPRINT_SLACK_CM + Math.max(0, wall.thickness) / 2
    if (distToSeg(point, wall.a, wall.b) <= slack) return true
  }
  return false
}

/** Midpoint → hoogste floor die hem raakt; anders hoogste floor met muren. */
export function resolveFloorIndexForRidgeSegment(plan: FloorPlan, a: Point2D, b: Point2D): number {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  for (let index = plan.floors.length - 1; index >= 0; index -= 1) {
    const floor = plan.floors[index]
    if (floor && floorFootprintHitsPoint(floor, mid)) return index
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
