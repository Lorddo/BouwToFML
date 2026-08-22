/**
 * Snapshot-generator: dakvlakken uit geveltops + dichtstbijzijnde nok / volgende vloer.
 * Leeg > fout. Geen verzonnen helling. Herschrijft geen gevel-az/bz.
 */
import { listElevationFacadeGroups } from './facade-groups'
import { readFloorStack, slabThicknessCm } from './floor-stack'
import { listDakSnapWalls, wallIsSkyExposed } from './ridge-floor'
import { listRidgeWallsOnFloor } from './ridge-walls'
import {
  listThickPlanWalls,
  planFootprintCentroid,
  snapPointToOuterWallFaces,
  wallOuterFace,
} from './wall-outer-face'
import {
  ROOF_ORIGIN_MANUAL,
  ROOF_SAME_POINT_CM,
  ROOF_TOUCH_SLACK_CM,
  ROOF_VERTICAL_XY_SLACK_CM,
  ROOF_VERTICAL_Z_SLACK_CM,
  listRidgeSurfacesOnFloor,
  makeRoofSurface,
  roofSurfaceOrigin,
  setRidgeSurfacesOnFloor,
  syncRoofPlaneGuidsFromDesigns,
} from './roof-planes'
import type { Floor, FloorPlan, FloorSurface, Point2D, Wall } from './types'
import { parseEndpoint3D } from './wall-endpoint-height'

type Point3 = Point2D & { z: number }

type TargetSeg = {
  id: string
  kind: 'ridge' | 'next'
  a: Point3
  b: Point3
  midZ: number
}

type Hit = {
  target: TargetSeg
  point: Point3
  dist: number
}

const AREA_MIN_CM2 = 2500
const MIN_EAVE_RUN_CM = 40
const EAVE_JOIN_CM = 12
const EAVE_COLLINEAR_DOT = 0.96

function shortGuid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function hypot2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

function sameXy(a: Point2D, b: Point2D, slack = ROOF_SAME_POINT_CM): boolean {
  return hypot2(a.x, a.y, b.x, b.y) <= slack
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

function segDistance(a1: Point2D, b1: Point2D, a2: Point2D, b2: Point2D): number {
  return Math.min(
    pointOnSeg(a1, a2, b2).dist,
    pointOnSeg(b1, a2, b2).dist,
    pointOnSeg(a2, a1, b1).dist,
    pointOnSeg(b2, a1, b1).dist,
  )
}

function lerpZ(a: Point3, b: Point3, t: number): number {
  return a.z + (b.z - a.z) * t
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

function facadeWallsOnFloor(plan: FloorPlan, floor: Floor, floorIndex: number): Wall[] {
  const ids = new Set(listElevationFacadeGroups(plan).flatMap((group) => group.wallGuids))
  const source = ids.size > 0 ? floor.walls.filter((wall) => ids.has(wall.id)) : floor.walls
  return source.filter((wall) => wallIsSkyExposed(plan, floorIndex, wall))
}

function ridgeTargetsOnFloor(floor: Floor, floorHeightCm: number): TargetSeg[] {
  return listRidgeWallsOnFloor(floor).map((wall) => {
    const az = parseEndpoint3D(wall.extras?.az, floorHeightCm)
    const bz = parseEndpoint3D(wall.extras?.bz, floorHeightCm)
    const a = { x: wall.a.x, y: wall.a.y, z: az.h }
    const b = { x: wall.b.x, y: wall.b.y, z: bz.h }
    return { id: `ridge:${wall.id}`, kind: 'ridge' as const, a, b, midZ: (a.z + b.z) / 2 }
  })
}

function nextFloorTargets(plan: FloorPlan, floorIndex: number): TargetSeg[] {
  const next = plan.floors[floorIndex + 1]
  const current = plan.floors[floorIndex]
  if (!next || !current) return []
  const stack = readFloorStack(plan)
  const z = current.height + slabThicknessCm(stack, next.level)
  return next.walls
    .filter((wall) => hypot2(wall.a.x, wall.a.y, wall.b.x, wall.b.y) > 1)
    .map((wall) => {
      const a = { x: wall.a.x, y: wall.a.y, z }
      const b = { x: wall.b.x, y: wall.b.y, z }
      return { id: `next:${wall.id}`, kind: 'next' as const, a, b, midZ: z }
    })
}

function maxSearchCm(points: Point2D[]): number {
  if (points.length === 0) return 1
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return Math.max(1, hypot2(minX, minY, maxX, maxY))
}

function nearestHit(point: Point2D, targets: TargetSeg[], maxDist: number): Hit | null {
  let best: Hit | null = null
  for (const target of targets) {
    const hit = pointOnSeg(point, target.a, target.b)
    if (hit.dist > maxDist) continue
    if (best && hit.dist >= best.dist) continue
    best = {
      target,
      dist: hit.dist,
      point: { x: hit.point.x, y: hit.point.y, z: lerpZ(target.a, target.b, hit.t) },
    }
  }
  return best
}

function isNearVertical(eave: Point3, hit: Hit): boolean {
  const xy = hypot2(eave.x, eave.y, hit.point.x, hit.point.y)
  const dz = Math.abs(eave.z - hit.point.z)
  return xy <= ROOF_VERTICAL_XY_SLACK_CM && dz <= ROOF_VERTICAL_Z_SLACK_CM
}

function polyArea2(poly: Point2D[]): number {
  let area = 0
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) continue
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2
}

function uniquePoly(poly: Array<Point2D & { z?: number }>): Array<Point2D & { z?: number }> {
  const out: Array<Point2D & { z?: number }> = []
  for (const point of poly) {
    const last = out[out.length - 1]
    if (last && sameXy(last, point)) continue
    out.push(point)
  }
  if (out.length >= 2 && sameXy(out[0], out[out.length - 1])) out.pop()
  return out
}

function emitSurface(poly: Array<Point2D & { z?: number }>): FloorSurface | null {
  const cleaned = uniquePoly(poly)
  if (cleaned.length < 3) return null
  if (polyArea2(cleaned) < AREA_MIN_CM2) return null
  return makeRoofSurface({
    id: `roof-${shortGuid()}`,
    poly: cleaned,
    origin: 'generated',
  })
}

type EaveRun = { a: Point3; b: Point3; walls: Wall[] }

function chainEaveRuns(
  walls: readonly Wall[],
  centroid: Point2D,
  floorHeightCm: number,
): EaveRun[] {
  type Seg = { wall: Wall; a: Point3; b: Point3; dir: Point2D; used: boolean }
  const segs: Seg[] = []
  for (const wall of walls) {
    const outer = wallOuterFace(wall, centroid)
    const dx = outer.b.x - outer.a.x
    const dy = outer.b.y - outer.a.y
    const len = Math.hypot(dx, dy)
    if (len < 1) continue
    segs.push({
      wall,
      a: { x: outer.a.x, y: outer.a.y, z: wallTopAtEnd(wall, 'a', floorHeightCm) },
      b: { x: outer.b.x, y: outer.b.y, z: wallTopAtEnd(wall, 'b', floorHeightCm) },
      dir: { x: dx / len, y: dy / len },
      used: false,
    })
  }
  const runs: EaveRun[] = []
  for (const start of segs) {
    if (start.used) continue
    start.used = true
    let a = start.a
    let b = start.b
    const dir = start.dir
    const runWalls = [start.wall]
    let grew = true
    while (grew) {
      grew = false
      for (const other of segs) {
        if (other.used) continue
        if (Math.abs(dir.x * other.dir.x + dir.y * other.dir.y) < EAVE_COLLINEAR_DOT) continue
        if (sameXy(b, other.a, EAVE_JOIN_CM)) {
          other.used = true
          b = other.b
          runWalls.push(other.wall)
          grew = true
        } else if (sameXy(b, other.b, EAVE_JOIN_CM)) {
          other.used = true
          b = other.a
          runWalls.push(other.wall)
          grew = true
        } else if (sameXy(a, other.b, EAVE_JOIN_CM)) {
          other.used = true
          a = other.a
          runWalls.push(other.wall)
          grew = true
        } else if (sameXy(a, other.a, EAVE_JOIN_CM)) {
          other.used = true
          a = other.b
          runWalls.push(other.wall)
          grew = true
        }
      }
    }
    if (hypot2(a.x, a.y, b.x, b.y) < MIN_EAVE_RUN_CM) continue
    runs.push({ a, b, walls: runWalls })
  }
  return runs
}

function loftEave(
  a: Point3,
  b: Point3,
  targets: TargetSeg[],
  maxDist: number,
): FloorSurface | null {
  const hitA = nearestHit(a, targets, maxDist)
  const hitB = nearestHit(b, targets, maxDist)
  if (!hitA || !hitB) return null
  if (isNearVertical(a, hitA) && isNearVertical(b, hitB)) return null
  if (sameXy(hitA.point, hitB.point)) {
    return emitSurface([a, b, hitA.point])
  }
  if (
    hitA.target.id.split(':').slice(0, 2).join(':') !==
    hitB.target.id.split(':').slice(0, 2).join(':')
  ) {
    if (hitA.target.kind !== hitB.target.kind && hitA.target.id !== hitB.target.id) {
      return emitSurface([a, b, hitB.point, hitA.point])
    }
  }
  return emitSurface([a, b, hitB.point, hitA.point])
}

function loftRidgeToHigher(
  source: TargetSeg,
  higher: TargetSeg[],
  maxDist: number,
): FloorSurface | null {
  const hitA = nearestHit(source.a, higher, maxDist)
  const hitB = nearestHit(source.b, higher, maxDist)
  if (!hitA || !hitB) return null
  if (isNearVertical(source.a, hitA) && isNearVertical(source.b, hitB)) return null
  if (sameXy(hitA.point, hitB.point)) {
    return emitSurface([source.a, source.b, hitA.point])
  }
  return emitSurface([source.a, source.b, hitB.point, hitA.point])
}

/** Genereer dakvlakken voor één verdieping (vervangt niet; alleen lijst). */
export function generateRoofPlanesForFloor(plan: FloorPlan, floorIndex: number): FloorSurface[] {
  const floor = plan.floors[floorIndex]
  if (!floor) return []
  const facades = facadeWallsOnFloor(plan, floor, floorIndex)
  if (facades.length === 0) return []
  const centroid = planFootprintCentroid(plan)
  const ridges = ridgeTargetsOnFloor(floor, floor.height)
  const next = nextFloorTargets(plan, floorIndex)
  const eaveTargets = [...ridges, ...next]
  const searchPoints = [
    ...facades.flatMap((wall) => [wall.a, wall.b]),
    ...eaveTargets.flatMap((seg) => [seg.a, seg.b]),
  ]
  const maxDist = maxSearchCm(searchPoints)
  const out: FloorSurface[] = []

  for (const run of chainEaveRuns(facades, centroid, floor.height)) {
    if (
      ridges.some((ridge) =>
        run.walls.some(
          (wall) => segDistance(ridge.a, ridge.b, wall.a, wall.b) <= ROOF_TOUCH_SLACK_CM,
        ),
      )
    ) {
      continue
    }
    const surface = loftEave(run.a, run.b, eaveTargets, maxDist)
    if (surface) out.push(surface)
  }

  for (const ridge of ridges) {
    const higher = ridges.filter(
      (other) => other.id !== ridge.id && other.midZ > ridge.midZ + ROOF_VERTICAL_Z_SLACK_CM,
    )
    if (higher.length === 0) continue
    const surface = loftRidgeToHigher(ridge, higher, maxDist)
    if (surface) out.push(surface)
  }

  return out
}

/** Vervang generated; houd manual. Schrijft naar het Dak-design. */
export function applyGeneratedRoofPlanes(plan: FloorPlan, floorIndex: number): FloorPlan {
  const floor = plan.floors[floorIndex]
  if (!floor) return plan
  const generated = generateRoofPlanesForFloor(plan, floorIndex)
  const kept = listRidgeSurfacesOnFloor(floor).filter(
    (surface) => roofSurfaceOrigin(surface) === ROOF_ORIGIN_MANUAL,
  )
  const nextFloor = setRidgeSurfacesOnFloor(floor, [...kept, ...generated])
  const nextPlan: FloorPlan = {
    ...plan,
    floors: plan.floors.map((entry, index) => (index === floorIndex ? nextFloor : entry)),
  }
  syncRoofPlaneGuidsFromDesigns(nextPlan)
  return nextPlan
}

export function countGeneratedRoofPlanes(
  plan: FloorPlan | null | undefined,
  floorIndex: number,
): number {
  if (!plan) return 0
  const floor = plan.floors[floorIndex]
  return listRidgeSurfacesOnFloor(floor).filter(
    (surface) => roofSurfaceOrigin(surface) === 'generated',
  ).length
}

export function countGeneratedRoofPlanesOnPlan(plan: FloorPlan | null | undefined): number {
  if (!plan) return 0
  return plan.floors.reduce((sum, _, index) => sum + countGeneratedRoofPlanes(plan, index), 0)
}

/** Alle verdiepingen: BG met gevels+nok telt, hogere floors zonder groep blijven leeg. */
export function applyGeneratedRoofPlanesForPlan(plan: FloorPlan): FloorPlan {
  let next = plan
  for (let index = 0; index < plan.floors.length; index += 1) {
    next = applyGeneratedRoofPlanes(next, index)
  }
  return next
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
