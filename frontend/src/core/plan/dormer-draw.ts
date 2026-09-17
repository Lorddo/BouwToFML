/**
 * Dakkapel-macro: voorzijde + haakse diepte → U-muren + plat kindvlak.
 * Muren op de plattegrond (`role: dormer`); vlak op het Dak-design.
 */
import { bindFloorWallsToRoofs } from './bind-walls-to-roofs'
import { cloneWalls, MIN_WALL_LENGTH_CM } from './junction-core'
import { wallLeftNormal } from './plan-wall-geom'
import { validateRoofOverlap } from './roof-overlap'
import {
  listRidgeSurfacesOnFloor,
  makeRoofSurface,
  resolveDormerParent,
  setRidgeSurfacesOnFloor,
  syncRoofPlaneGuidsFromDesigns,
} from './roof-planes'
import type { FloorPlan, FloorSurface, Point2D, Wall } from './types'
import {
  addSegmentPathWithJunctionBreaks,
  materializeEndpointJoinsAtPoint,
} from './wall-draw-geom'

const DORMER_ROLE = 'dormer' as const

export function isDormerRoleWall(wall: Pick<Wall, 'role'> | null | undefined): boolean {
  return wall?.role === DORMER_ROLE
}

export type DormerFootprint = {
  frontA: Point2D
  frontB: Point2D
  backA: Point2D
  backB: Point2D
  depthCm: number
  kopseBalance: number
  poly: Point2D[]
}

export type DormerDrawArgs = {
  frontA: Point2D
  frontB: Point2D
  depthPoint: Point2D
  thicknessCm: number
  roofZCm: number
  bottomZCm?: number
}

function hypot2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

function unitOrNull(dx: number, dy: number): Point2D | null {
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return null
  return { x: dx / len, y: dy / len }
}

/** Inward = diepte-richting (hover-zijde). Kopse-balance: dikte die kant op, hartlijn = buitenface. */
export function kopseBalanceForInward(
  frontA: Point2D,
  frontB: Point2D,
  inward: Point2D,
): number {
  const n = wallLeftNormal({ a: frontA, b: frontB })
  return n.x * inward.x + n.y * inward.y > 0 ? 1 : 0
}

export function projectDormerFootprint(
  frontA: Point2D,
  frontB: Point2D,
  depthPoint: Point2D,
): DormerFootprint | null {
  const frontLen = hypot2(frontA.x, frontA.y, frontB.x, frontB.y)
  if (frontLen < MIN_WALL_LENGTH_CM) return null
  const left = wallLeftNormal({ a: frontA, b: frontB })
  const signed =
    (depthPoint.x - frontA.x) * left.x + (depthPoint.y - frontA.y) * left.y
  if (Math.abs(signed) < MIN_WALL_LENGTH_CM) return null
  const inward = signed > 0 ? left : { x: -left.x, y: -left.y }
  const depthCm = Math.abs(signed)
  const backA = { x: frontA.x + inward.x * depthCm, y: frontA.y + inward.y * depthCm }
  const backB = { x: frontB.x + inward.x * depthCm, y: frontB.y + inward.y * depthCm }
  return {
    frontA: { x: frontA.x, y: frontA.y },
    frontB: { x: frontB.x, y: frontB.y },
    backA,
    backB,
    depthCm,
    kopseBalance: kopseBalanceForInward(frontA, frontB, inward),
    poly: [
      { x: frontA.x, y: frontA.y },
      { x: frontB.x, y: frontB.y },
      { x: backB.x, y: backB.y },
      { x: backA.x, y: backA.y },
    ],
  }
}

/** Kindvlak op de buitenfaces: wang T/2 naar buiten, kopse blijft de getekende voorzijde. */
export function dormerOuterPolyFromFootprint(
  footprint: DormerFootprint,
  thicknessCm: number,
): Point2D[] {
  const half = Math.max(0, thicknessCm) * 0.5
  const frontU = unitOrNull(
    footprint.frontB.x - footprint.frontA.x,
    footprint.frontB.y - footprint.frontA.y,
  )
  if (!frontU || half < 1e-9) return footprint.poly.map((p) => ({ x: p.x, y: p.y }))
  const leftOut = { x: -frontU.x, y: -frontU.y }
  const rightOut = frontU
  return [
    { x: footprint.frontA.x + leftOut.x * half, y: footprint.frontA.y + leftOut.y * half },
    { x: footprint.frontB.x + rightOut.x * half, y: footprint.frontB.y + rightOut.y * half },
    { x: footprint.backB.x + rightOut.x * half, y: footprint.backB.y + rightOut.y * half },
    { x: footprint.backA.x + leftOut.x * half, y: footprint.backA.y + leftOut.y * half },
  ]
}

/** Hartlijn-lengte van de voorzijde bij getypte binnenmaat (wangen 0,5). */
export function dormerFrontCenterlineFromInner(innerCm: number, wangThicknessCm: number): number {
  const half = Math.max(0, wangThicknessCm) * 0.5
  return Math.abs(innerCm) + half + half
}

export function pointAlong(from: Point2D, toward: Point2D, lengthCm: number): Point2D {
  const u = unitOrNull(toward.x - from.x, toward.y - from.y)
  if (!u) return { x: from.x, y: from.y }
  return { x: from.x + u.x * lengthCm, y: from.y + u.y * lengthCm }
}

/** Punt op `depthCm` haaks op de voorzijde, zelfde kant als `toward` (negatief = andere kant). */
export function dormerDepthPoint(
  frontA: Point2D,
  frontB: Point2D,
  toward: Point2D,
  depthCm: number,
): Point2D {
  const left = wallLeftNormal({ a: frontA, b: frontB })
  const mid = { x: (frontA.x + frontB.x) / 2, y: (frontA.y + frontB.y) / 2 }
  const signed = (toward.x - frontA.x) * left.x + (toward.y - frontA.y) * left.y
  const inward = signed < 0 ? { x: -left.x, y: -left.y } : left
  const dir = depthCm < 0 ? { x: -inward.x, y: -inward.y } : inward
  const len = Math.abs(depthCm)
  return { x: mid.x + dir.x * len, y: mid.y + dir.y * len }
}

function wallDrawEndpoint(topHCm: number, bottomZCm: number): { z: number; h: number } {
  const z = Math.max(0, Math.round(bottomZCm))
  const h = Math.max(z + 1, Math.round(topHCm))
  return { z, h }
}

export function addDormerWalls(
  walls: Wall[],
  footprint: DormerFootprint,
  options: { thicknessCm: number; roofZCm: number; bottomZCm?: number },
): { walls: Wall[]; wallIds: string[] } {
  const next = cloneWalls(walls)
  const thickness = Math.max(1, Math.min(200, Math.round(options.thicknessCm)))
  const bottomZCm = options.bottomZCm ?? 0
  const endpoint = wallDrawEndpoint(options.roofZCm, bottomZCm)
  const endpointExtras = { az: endpoint, bz: { ...endpoint } }
  const common = {
    thickness,
    role: DORMER_ROLE,
    idPrefix: 'wall' as const,
    minLengthCm: MIN_WALL_LENGTH_CM,
    endpointExtras,
  }
  const addedIds: string[] = []
  addedIds.push(
    ...addSegmentPathWithJunctionBreaks(next, footprint.frontA, footprint.frontB, {
      ...common,
      balance: footprint.kopseBalance,
    }),
  )
  addedIds.push(
    ...addSegmentPathWithJunctionBreaks(next, footprint.frontA, footprint.backA, {
      ...common,
      balance: 0.5,
    }),
  )
  addedIds.push(
    ...addSegmentPathWithJunctionBreaks(next, footprint.frontB, footprint.backB, {
      ...common,
      balance: 0.5,
    }),
  )
  const exclude = new Set(addedIds)
  for (const point of [footprint.frontA, footprint.frontB, footprint.backA, footprint.backB]) {
    materializeEndpointJoinsAtPoint(next, point, { excludeWallIds: exclude, toleranceCm: 1 })
  }
  return { walls: next, wallIds: addedIds }
}

export function applyDormerDrawToPlan(
  plan: FloorPlan,
  floorIndex: number,
  args: DormerDrawArgs,
): { plan: FloorPlan; wallIds: string[]; surfaceId: string } | null {
  const floor = plan.floors[floorIndex]
  if (!floor) return null
  const footprint = projectDormerFootprint(args.frontA, args.frontB, args.depthPoint)
  if (!footprint) return null
  const added = addDormerWalls(floor.walls, footprint, {
    thicknessCm: args.thicknessCm,
    roofZCm: args.roofZCm,
    bottomZCm: args.bottomZCm,
  })
  if (added.wallIds.length === 0) return null

  let nextFloor = { ...floor, walls: added.walls }
  const existing = listRidgeSurfacesOnFloor(nextFloor)
  const poly = dormerOuterPolyFromFootprint(footprint, args.thicknessCm).map((p) => ({
    ...p,
    z: args.roofZCm,
  }))
  const parent = resolveDormerParent({ poly }, existing)
  const surfaceId = `surface-${crypto.randomUUID().slice(0, 8)}`
  const surface: FloorSurface = makeRoofSurface({
    id: surfaceId,
    origin: 'manual',
    roofKind: 'dormer',
    roofParentId: parent?.id,
    poly,
  })
  if (validateRoofOverlap(surface, existing)) return null
  nextFloor = setRidgeSurfacesOnFloor(nextFloor, [...existing, surface])
  let next: FloorPlan = {
    ...plan,
    floors: plan.floors.map((entry, index) => (index === floorIndex ? nextFloor : entry)),
  }
  syncRoofPlaneGuidsFromDesigns(next)
  next = bindFloorWallsToRoofs(next, floorIndex, { wallIds: added.wallIds }).plan
  return { plan: next, wallIds: added.wallIds, surfaceId }
}
