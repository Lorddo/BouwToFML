/**
 * Dakkapel-macro: voorzijde + haakse diepte → U-muren + plat kindvlak.
 * Muren op de plattegrond (`role: dormer`); vlak op het Dak-design.
 */
import { bindFloorWallsToRoofs } from './bind-walls-to-roofs'
import { inheritFacadeGroupsAfterWallsChanged } from './facade-groups'
import { cloneWalls, MIN_WALL_LENGTH_CM, samePoint } from './junction-core'
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
import { dormerOuterPolyFromWalls } from './dormer-follow-roof'
import {
  addSegmentPathWithJunctionBreaks,
  materializeEndpointJoinsAtPoint,
} from './wall-draw-geom'

const DORMER_ROLE = 'dormer' as const

/** Snap + insnijden op bestaande muren (voorzijde en wang). */
export const DORMER_WALL_SNAP_CM = 5

/** Na snap liggen hoeken op de host; knip alleen nog lokaal. */
const DORMER_SPLIT_TOL_CM = 1

const PARALLEL_DOT = 0.99

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
  /** 0 = geen muur-snap. Default 5 cm. */
  snapCm?: number
}

function hypot2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

function unitOrNull(dx: number, dy: number): Point2D | null {
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return null
  return { x: dx / len, y: dy / len }
}

function distToSeg(p: Point2D, a: Point2D, b: Point2D): { dist: number; t: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return { dist: hypot2(p.x, p.y, a.x, a.y), t: 0 }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return { dist: hypot2(p.x, p.y, a.x + t * dx, a.y + t * dy), t }
}

function projectOnSeg(p: Point2D, a: Point2D, b: Point2D): Point2D {
  const { t } = distToSeg(p, a, b)
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function unboundedT(a: Point2D, b: Point2D, p: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return 0
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
}

function distToInfiniteLine(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return hypot2(p.x, p.y, a.x, a.y)
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len
}

function projectOnInfiniteLine(p: Point2D, a: Point2D, b: Point2D): Point2D {
  const t = unboundedT(a, b, p)
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** Hartlijn-snap, inclusief muuruiteinden (anders dan T-only `findWallAtPoint`). */
export function snapPointToDormerWall(
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b'>>,
  point: Point2D,
  snapCm = DORMER_WALL_SNAP_CM,
): Point2D {
  let best = point
  let bestD = snapCm
  for (const wall of walls) {
    const hit = distToSeg(point, wall.a, wall.b)
    if (hit.dist <= bestD) {
      bestD = hit.dist
      best = projectOnSeg(point, wall.a, wall.b)
    }
  }
  return best
}

function findCollinearHost(
  walls: ReadonlyArray<Wall>,
  a: Point2D,
  b: Point2D,
  snapCm: number,
): Wall | null {
  const segU = unitOrNull(b.x - a.x, b.y - a.y)
  if (!segU) return null
  let best: Wall | null = null
  let bestD = snapCm
  for (const wall of walls) {
    const wU = unitOrNull(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
    if (!wU) continue
    if (Math.abs(wU.x * segU.x + wU.y * segU.y) < PARALLEL_DOT) continue
    const d = Math.max(distToInfiniteLine(a, wall.a, wall.b), distToInfiniteLine(b, wall.a, wall.b))
    if (d > snapCm + 1e-9) continue
    const tA = unboundedT(wall.a, wall.b, a)
    const tB = unboundedT(wall.a, wall.b, b)
    if (Math.max(tA, tB) < -0.01 || Math.min(tA, tB) > 1.01) continue
    if (d < bestD - 1e-9) {
      bestD = d
      best = wall
    }
  }
  return best
}

function snapFootprintPass(
  walls: ReadonlyArray<Wall>,
  footprint: DormerFootprint,
  snapCm: number,
): DormerFootprint {
  let frontA = footprint.frontA
  let frontB = footprint.frontB
  const frontHost = findCollinearHost(walls, frontA, frontB, snapCm)
  if (frontHost) {
    frontA = projectOnInfiniteLine(frontA, frontHost.a, frontHost.b)
    frontB = projectOnInfiniteLine(frontB, frontHost.a, frontHost.b)
  } else {
    frontA = snapPointToDormerWall(walls, frontA, snapCm)
    frontB = snapPointToDormerWall(walls, frontB, snapCm)
  }
  const inward = unitOrNull(
    footprint.backA.x - footprint.frontA.x,
    footprint.backA.y - footprint.frontA.y,
  )
  if (!inward) return footprint
  let backA = {
    x: frontA.x + inward.x * footprint.depthCm,
    y: frontA.y + inward.y * footprint.depthCm,
  }
  let backB = {
    x: frontB.x + inward.x * footprint.depthCm,
    y: frontB.y + inward.y * footprint.depthCm,
  }
  const wangAHost = findCollinearHost(walls, frontA, backA, snapCm)
  if (wangAHost) {
    frontA = projectOnInfiniteLine(frontA, wangAHost.a, wangAHost.b)
    backA = projectOnInfiniteLine(backA, wangAHost.a, wangAHost.b)
  }
  const wangBHost = findCollinearHost(walls, frontB, backB, snapCm)
  if (wangBHost) {
    frontB = projectOnInfiniteLine(frontB, wangBHost.a, wangBHost.b)
    backB = projectOnInfiniteLine(backB, wangBHost.a, wangBHost.b)
  }
  const midBack = { x: (backA.x + backB.x) / 2, y: (backA.y + backB.y) / 2 }
  return projectDormerFootprint(frontA, frontB, midBack) ?? footprint
}

/** Voorzijde en wang op een nabije bestaande muur (≤5 cm); daarna weer haaks. */
export function snapDormerFootprintToWalls(
  walls: ReadonlyArray<Wall>,
  footprint: DormerFootprint,
  snapCm = DORMER_WALL_SNAP_CM,
): DormerFootprint {
  if (snapCm <= 0 || walls.length === 0) return footprint
  let next = footprint
  for (let pass = 0; pass < 2; pass += 1) {
    next = snapFootprintPass(walls, next, snapCm)
  }
  return next
}

function existingSegment(walls: readonly Wall[], a: Point2D, b: Point2D): Wall | undefined {
  return walls.find(
    (wall) =>
      (samePoint(wall.a, a) && samePoint(wall.b, b)) ||
      (samePoint(wall.a, b) && samePoint(wall.b, a)),
  )
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
  options: { thicknessCm: number; roofZCm: number; bottomZCm?: number; snapCm?: number },
): { walls: Wall[]; wallIds: string[]; footprint: DormerFootprint } {
  const next = cloneWalls(walls)
  const snapCm = options.snapCm ?? DORMER_WALL_SNAP_CM
  const fp = snapDormerFootprintToWalls(next, footprint, snapCm)
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
  const corners = [fp.frontA, fp.frontB, fp.backA, fp.backB]
  for (const point of corners) {
    materializeEndpointJoinsAtPoint(next, point, { toleranceCm: DORMER_SPLIT_TOL_CM })
  }
  const usedIds: string[] = []
  const legs: Array<{ a: Point2D; b: Point2D; balance: number }> = [
    { a: fp.frontA, b: fp.frontB, balance: fp.kopseBalance },
    { a: fp.frontA, b: fp.backA, balance: 0.5 },
    { a: fp.frontB, b: fp.backB, balance: 0.5 },
  ]
  for (const leg of legs) {
    const reused = existingSegment(next, leg.a, leg.b)
    if (reused) {
      usedIds.push(reused.id)
      continue
    }
    usedIds.push(
      ...addSegmentPathWithJunctionBreaks(next, leg.a, leg.b, {
        ...common,
        balance: leg.balance,
      }),
    )
  }
  const exclude = new Set(usedIds)
  for (const point of corners) {
    materializeEndpointJoinsAtPoint(next, point, {
      excludeWallIds: exclude,
      toleranceCm: DORMER_SPLIT_TOL_CM,
    })
  }
  return { walls: next, wallIds: usedIds, footprint: fp }
}

export function applyDormerDrawToPlan(
  plan: FloorPlan,
  floorIndex: number,
  args: DormerDrawArgs,
): { plan: FloorPlan; wallIds: string[]; surfaceId: string } | null {
  const floor = plan.floors[floorIndex]
  if (!floor) return null
  const raw = projectDormerFootprint(args.frontA, args.frontB, args.depthPoint)
  if (!raw) return null
  const beforeWalls = floor.walls
  const added = addDormerWalls(floor.walls, raw, {
    thicknessCm: args.thicknessCm,
    roofZCm: args.roofZCm,
    bottomZCm: args.bottomZCm,
    snapCm: args.snapCm,
  })
  if (added.wallIds.length === 0) return null
  const footprint = added.footprint

  let nextFloor = { ...floor, walls: added.walls }
  const existing = listRidgeSurfacesOnFloor(nextFloor)
  const seed = dormerOuterPolyFromFootprint(footprint, args.thicknessCm)
  const outer = dormerOuterPolyFromWalls(added.walls, { poly: seed }) ?? seed
  const poly = outer.map((p) => ({
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
  inheritFacadeGroupsAfterWallsChanged(
    next,
    beforeWalls,
    next.floors[floorIndex]?.walls ?? added.walls,
  )
  return { plan: next, wallIds: added.wallIds, surfaceId }
}
