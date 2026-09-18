import type { Floor, FloorPlan, Point2D, Wall } from '@/core/plan/types'
import { isPointSkyExposedOnFloor, listDakSnapWalls } from '@/core/plan/ridge-floor'
import { listRidgeWallsOnFloor } from '@/core/plan/ridge-walls'
import { listRidgeSurfacesOnFloor } from '@/core/plan/roof-planes'
import { floorFootprintCentroid, listFloorOuterFaceCorners } from '@/core/plan/wall-outer-face'
import {
  isOnDakBoundary,
  snapDakDrawPoint,
  snapToNearestDakBoundary,
} from './plan-canvas-wall-face-snap'

function dakOuterCorners(plan: FloorPlan, floorIndex: number): Point2D[] {
  return [
    ...listFloorOuterFaceCorners(plan.floors[floorIndex]),
    ...listFloorOuterFaceCorners(plan.floors[floorIndex + 1]),
  ]
}

/** Polygoonringen van dakvlakken op een floor (optioneel één id uitsluiten tijdens sleep). */
export function dakRoofRingsFromFloor(
  floor: Floor | null | undefined,
  excludeSurfaceId?: string | null,
): Point2D[][] {
  const rings: Point2D[][] = []
  for (const surface of listRidgeSurfacesOnFloor(floor)) {
    if (excludeSurfaceId && surface.id === excludeSurfaceId) continue
    if (!surface.poly || surface.poly.length < 2) continue
    rings.push(surface.poly.map((p) => ({ x: p.x, y: p.y })))
  }
  return rings
}

export function clampDakAllowedPoint(
  plan: FloorPlan,
  floorIndex: number,
  point: Point2D,
  excludeSurfaceId?: string | null,
): Point2D {
  if (isPointSkyExposedOnFloor(plan, floorIndex, point)) return point
  return (
    snapToNearestDakBoundary(
      listDakSnapWalls(plan, floorIndex),
      listRidgeWallsOnFloor(plan.floors[floorIndex]),
      point,
      dakRoofRingsFromFloor(plan.floors[floorIndex], excludeSurfaceId),
    ) ?? point
  )
}

export function isAllowedDakDrawPoint(
  plan: FloorPlan,
  floorIndex: number,
  point: Point2D,
  excludeSurfaceId?: string | null,
): boolean {
  if (isPointSkyExposedOnFloor(plan, floorIndex, point)) return true
  return isOnDakBoundary(
    listDakSnapWalls(plan, floorIndex),
    listRidgeWallsOnFloor(plan.floors[floorIndex]),
    point,
    dakRoofRingsFromFloor(plan.floors[floorIndex], excludeSurfaceId),
  )
}

export function resolveRidgeDrawPoint(
  cm: Point2D,
  opts: {
    plan: FloorPlan | null
    floorIndex: number
    walls: ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>>
    axisAnchor?: Point2D
    lockAxis: boolean
    snapDisabled?: boolean
  },
): Point2D {
  const floor = opts.plan?.floors[opts.floorIndex]
  const snapped = snapDakDrawPoint(cm, {
    walls: opts.walls,
    ridges: listRidgeWallsOnFloor(floor),
    roofRings: dakRoofRingsFromFloor(floor),
    axisAnchor: opts.axisAnchor,
    lockAxis: opts.lockAxis,
    snapDisabled: opts.snapDisabled === true,
  })
  if (!opts.plan) return snapped
  return clampDakAllowedPoint(opts.plan, opts.floorIndex, snapped)
}

export function resolveDakSurfacePoint(
  cm: Point2D,
  opts: {
    plan: FloorPlan
    floorIndex: number
    axisAnchor?: Point2D
    extraAxisPoints?: Point2D[]
    lockAxis: boolean
    excludeSurfaceId?: string | null
  },
): Point2D {
  const floor = opts.plan.floors[opts.floorIndex]
  const extra = opts.extraAxisPoints ?? []
  const isFirst = extra.length === 0 && !opts.axisAnchor
  const next = snapDakDrawPoint(cm, {
    walls: listDakSnapWalls(opts.plan, opts.floorIndex),
    ridges: listRidgeWallsOnFloor(floor),
    roofRings: dakRoofRingsFromFloor(floor, opts.excludeSurfaceId),
    extraCorners: [...dakOuterCorners(opts.plan, opts.floorIndex), ...extra],
    axisAnchor: opts.axisAnchor,
    lockAxis: opts.lockAxis,
    preferOuterFaces: isFirst,
    centroid: isFirst ? floorFootprintCentroid(floor) : undefined,
  })
  return clampDakAllowedPoint(opts.plan, opts.floorIndex, next, opts.excludeSurfaceId)
}
