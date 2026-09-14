/**
 * Dakkapel-randmuur in aanzicht: eindpunt langs de plattegrond-as, geklemd op het kindvlak.
 */
import { ELEVATION_RIDGE_MIN_SIZE_CM } from './elevation-ridge-edit'
import type { FacadeElevation } from './facade-elevation'
import {
  clampDormerEndT,
  dormerAxisCoverageT,
  endsNear,
  findDormerEdgeSurface,
  listDormerEdgeWalls,
  wallPointAtT,
} from './dormer-edge-walls'
import { listRidgeSurfacesOnFloor } from './roof-planes'
import { openingWorldCenter, reprojectWallOpenings } from './plan-wall-geom'
import type { FloorPlan, Point2D, Wall } from './types'
import { wallEndpoint3D, type WallEnd } from './wall-endpoint-height'

function projectOnAxis(point: Point2D, origin: Point2D, axis: Point2D): number {
  return (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y
}

function cloneFloorWalls(plan: FloorPlan, floorIndex: number, walls: Wall[]): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor, index) => {
      if (index !== floorIndex) return floor
      return {
        ...floor,
        walls,
        designs: floor.designs?.map((design, di) =>
          di === (floor.activeDesignIndex ?? 0) ? { ...design, walls } : design,
        ),
      }
    }),
  }
}

function withEndXyAndTop(
  wall: Wall,
  end: WallEnd,
  point: Point2D,
  topHCm: number,
  floorHeightCm: number,
): Wall {
  const current = wallEndpoint3D(wall, end, floorHeightCm)
  const other = wallEndpoint3D(wall, end === 'a' ? 'b' : 'a', floorHeightCm)
  const h = Math.max(current.z + 1, Math.round(topHCm))
  const a = end === 'a' ? { z: current.z, h } : other
  const b = end === 'a' ? other : { z: current.z, h }
  const extras = { ...(wall.extras ?? {}) }
  delete extras.az
  delete extras.bz
  const next: Wall = {
    ...wall,
    a: end === 'a' ? { x: point.x, y: point.y } : wall.a,
    b: end === 'b' ? { x: point.x, y: point.y } : wall.b,
    elevation: { a, b },
    extras: Object.keys(extras).length > 0 ? extras : undefined,
  }
  if (wall.openings.length === 0) return next
  const centers = wall.openings.map((opening) => openingWorldCenter(wall, opening.t))
  return { ...next, openings: reprojectWallOpenings(next, centers) }
}

function tForAlongCm(
  wall: Pick<Wall, 'a' | 'b'>,
  alongCm: number,
  origin: Point2D,
  axis: Point2D,
): number | null {
  const xa = projectOnAxis(wall.a, origin, axis)
  const xb = projectOnAxis(wall.b, origin, axis)
  const span = xb - xa
  if (Math.abs(span) < 1e-6) return null
  return (alongCm - xa) / span
}

/**
 * Eén floor-muureind langs de bestaande as; ander eind vast.
 * Andere dakkapel-randmuren op dezelfde hoek volgen (breedte); knieschot niet.
 */
export function applyElevationWallEndAlongPlanAxis(args: {
  plan: FloorPlan
  elevation: Pick<FacadeElevation, 'axis' | 'origin'>
  floorIndex: number
  wallId: string
  end: WallEnd
  alongCm: number
  zCm: number
}): FloorPlan {
  const floor = args.plan.floors[args.floorIndex]
  if (!floor) return args.plan
  const wall = floor.walls.find((item) => item.id === args.wallId)
  if (!wall) return args.plan
  const tRaw = tForAlongCm(wall, args.alongCm, args.elevation.origin, args.elevation.axis)
  if (tRaw == null) return args.plan
  const surfaces = listRidgeSurfacesOnFloor(floor)
  const dormer = findDormerEdgeSurface(wall, surfaces)
  const coverage = dormer ? dormerAxisCoverageT(wall, dormer.poly) : null
  const t = clampDormerEndT({
    wall,
    end: args.end,
    nextT: tRaw,
    coverage,
    minLengthCm: ELEVATION_RIDGE_MIN_SIZE_CM,
  })
  const point = wallPointAtT(wall, t)
  const oldPoint = args.end === 'a' ? wall.a : wall.b
  let walls = floor.walls.map((item) =>
    item.id === wall.id
      ? withEndXyAndTop(item, args.end, point, args.zCm, floor.height)
      : item,
  )
  const edgeIds = new Set(listDormerEdgeWalls({ ...floor, walls }).map((row) => row.wall.id))
  walls = walls.map((item) => {
    if (item.id === wall.id || !edgeIds.has(item.id)) return item
    if (endsNear(item.a, oldPoint)) {
      return withEndXyAndTop(item, 'a', point, args.zCm, floor.height)
    }
    if (endsNear(item.b, oldPoint)) {
      return withEndXyAndTop(item, 'b', point, args.zCm, floor.height)
    }
    return item
  })
  return cloneFloorWalls(args.plan, args.floorIndex, walls)
}
