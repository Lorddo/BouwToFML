/**
 * Bind vloer-muren aan dakvlakken: `az`/`bz` per segment (niet per knoop).
 * Optioneel eerst knippen op nok/kil én dakvlak-omtrek, daarna binden.
 */
import { clampOpeningToStory } from './elevation-opening-edit'
import { splitPlanWallAtT } from './elevation-openings'
import { isPointSkyExposedOnFloor } from './ridge-floor'
import { listRidgeWallsOnFloor } from './ridge-walls'
import { listRidgeSurfacesOnFloor, ROOF_SAME_POINT_CM, ROOF_TOUCH_SLACK_CM, ROOF_VERTICAL_Z_SLACK_CM, isDormerLikeRoof, isRoofSurface, resolveDormerParent, followDormerWallsForSurfaceMove } from './roof-planes'
import {
  findDormerEdgeSurface,
  flushKopseDormerWalls,
  hasCollinearContinuation,
  isKopseDormerEdgeWall,
} from './dormer-edge-walls'
import { bindSkylightToRoofs, isSkylightItem } from './skylight-roof'
import type { FloorPlan, FloorSurface, Point2D, Wall } from './types'
import { wallEndpoint3D, type WallEnd } from './wall-endpoint-height'

/** Minimale restlengte na knip (zelfde als editor-split). */
export const BIND_MIN_SPLIT_SEGMENT_CM = 4

export type BindWallsToRoofsOptions = {
  /** Knip muren op nok/kil én dakvlak-omtrek vóór binden (V2). */
  splitCreases?: boolean
  /** Alleen deze muren binden (lokale dakkapel-place). Geen skylights / floor-lift. */
  wallIds?: ReadonlyArray<string>
  /** Auto-bind na dakvlak-edit: sla einden over waar het dak op/nabij de vloer zit. */
  skipNearFloor?: boolean
}

export type BindWallsToRoofsResult = {
  plan: FloorPlan
  boundJunctions: number
  skippedBlocked: number
  skippedUncovered: number
  splits: number
  /** Randmuren van een dakkapel: hartlijn naar buitenface. */
  flushedEdges: number
  /** Dakraam-fixtures gekoppeld aan een dakvlak. */
  boundSkylights: number
  skippedSkylights: number
}

type Point3 = Point2D & { z: number }

function hypot2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

function pointInPolygon(point: Point2D, ring: readonly Point2D[]): boolean {
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
  if (lenSq < 1e-9) return hypot2(point.x, point.y, a.x, a.y)
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq))
  return hypot2(point.x, point.y, a.x + dx * t, a.y + dy * t)
}

function distToPolyEdges(point: Point2D, poly: readonly Point2D[]): number {
  let best = Infinity
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) continue
    best = Math.min(best, distToSeg(point, a, b))
  }
  return best
}

function samePoint(a: Point2D, b: Point2D, slackCm = ROOF_SAME_POINT_CM): boolean {
  return hypot2(a.x, a.y, b.x, b.y) <= slackCm
}

function surfaceRing(surface: FloorSurface): Point2D[] {
  return surface.poly.map((p) => ({ x: p.x, y: p.y }))
}

function surfaceCoversPoint(
  surface: FloorSurface,
  point: Point2D,
  touchSlackCm = ROOF_TOUCH_SLACK_CM,
): boolean {
  const ring = surfaceRing(surface)
  if (ring.length < 3) return false
  if (pointInPolygon(point, ring)) return true
  return distToPolyEdges(point, ring) <= touchSlackCm
}

/** Barycentrische Z in driehoek; null als punt buiten (met lichte slack). */
function zInTriangle(point: Point2D, a: Point3, b: Point3, c: Point3): number | null {
  const v0x = b.x - a.x
  const v0y = b.y - a.y
  const v1x = c.x - a.x
  const v1y = c.y - a.y
  const v2x = point.x - a.x
  const v2y = point.y - a.y
  const den = v0x * v1y - v1x * v0y
  if (Math.abs(den) < 1e-12) return null
  const v = (v2x * v1y - v1x * v2y) / den
  const w = (v0x * v2y - v2x * v0y) / den
  const u = 1 - v - w
  const slack = 0.02
  if (u < -slack || v < -slack || w < -slack) return null
  return a.z * u + b.z * v + c.z * w
}

export type SampleRoofZOptions = {
  /** Overlap: min (default, bind/legacy) of max. */
  prefer?: 'min' | 'max'
  /** Alleen deze surface-ids samplen. */
  surfaceIds?: ReadonlyArray<string>
  /**
   * Afstand tot poly-rand voor hit (default `ROOF_TOUCH_SLACK_CM`).
   * Dakkapel na flush: hartlijn op buitenface → ½ dikte + slack.
   */
  touchSlackCm?: number
}

/** Dakvlak-Z op XY. Default prefer=min (overlap → laagste). */
export function sampleRoofZAtPoint(
  surfaces: ReadonlyArray<FloorSurface>,
  point: Point2D,
  options?: SampleRoofZOptions,
): number | null {
  const prefer = options?.prefer ?? 'min'
  const touchSlack =
    options?.touchSlackCm != null && Number.isFinite(options.touchSlackCm)
      ? Math.max(0, options.touchSlackCm)
      : ROOF_TOUCH_SLACK_CM
  const idFilter =
    options?.surfaceIds && options.surfaceIds.length > 0
      ? new Set(options.surfaceIds)
      : null
  let best: number | null = null
  for (const surface of surfaces) {
    if (idFilter && !idFilter.has(surface.id)) continue
    if (!surfaceCoversPoint(surface, point, touchSlack)) continue
    const pts: Point3[] = surface.poly.map((p) => ({
      x: p.x,
      y: p.y,
      z: typeof p.z === 'number' && Number.isFinite(p.z) ? p.z : 0,
    }))
    if (pts.length < 3) continue
    let zHit: number | null = null
    for (let i = 1; i < pts.length - 1; i += 1) {
      const a = pts[0]
      const b = pts[i]
      const c = pts[i + 1]
      if (!a || !b || !c) continue
      const z = zInTriangle(point, a, b, c)
      if (z == null) continue
      zHit = zHit == null ? z : Math.min(zHit, z)
    }
    if (zHit == null) {
      let edgeZ: number | null = null
      let edgeDist = touchSlack
      for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i]
        const b = pts[(i + 1) % pts.length]
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const lenSq = dx * dx + dy * dy
        if (lenSq < 1e-9) continue
        const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq))
        const proj = { x: a.x + dx * t, y: a.y + dy * t }
        const dist = hypot2(point.x, point.y, proj.x, proj.y)
        if (dist > edgeDist) continue
        edgeDist = dist
        edgeZ = a.z + (b.z - a.z) * t
      }
      zHit = edgeZ
    }
    if (zHit == null) continue
    best =
      best == null ? zHit : prefer === 'max' ? Math.max(best, zHit) : Math.min(best, zHit)
  }
  return best == null ? null : Math.round(best)
}

/**
 * Plafond-Z voor clear-height: dakkapel wint in zijn voetafdruk, anders plane.
 * Retourneert ook welk surface de hit gaf.
 */
export function sampleCeilingRoofAtPoint(
  surfaces: ReadonlyArray<FloorSurface>,
  point: Point2D,
): { z: number; surfaceId: string; dormer: boolean } | null {
  const dormers = surfaces.filter((s) => isDormerLikeRoof(s, surfaces))
  for (const dormer of dormers) {
    if (!surfaceCoversPoint(dormer, point)) continue
    const z = sampleRoofZAtPoint([dormer], point)
    if (z != null) return { z, surfaceId: dormer.id, dormer: true }
  }
  const planes = surfaces.filter((s) => !isDormerLikeRoof(s, surfaces))
  let best: { z: number; surfaceId: string } | null = null
  for (const plane of planes) {
    if (!surfaceCoversPoint(plane, point)) continue
    const z = sampleRoofZAtPoint([plane], point)
    if (z == null) continue
    if (!best || z < best.z) best = { z, surfaceId: plane.id }
  }
  return best ? { ...best, dormer: false } : null
}

type Crease = { a: Point2D; b: Point2D }

function edgeKey(a: Point2D, b: Point2D): string {
  const ka = `${Math.round(a.x)},${Math.round(a.y)}`
  const kb = `${Math.round(b.x)},${Math.round(b.y)}`
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
}

function creaseAlreadyListed(out: ReadonlyArray<Crease>, a: Point2D, b: Point2D): boolean {
  return out.some(
    (c) =>
      (samePoint(c.a, a) && samePoint(c.b, b)) || (samePoint(c.a, b) && samePoint(c.b, a)),
  )
}

/**
 * Dakvlak-randen waarop muren knippen: gedeelde nok/kil, unieke omtrek
 * (dakkapel, goot, kopse kil) + nokbalk-assen.
 */
export function collectRoofCreases(
  surfaces: ReadonlyArray<FloorSurface>,
  ridgeWalls: ReadonlyArray<Wall>,
): Crease[] {
  const edgeCounts = new Map<string, Crease>()
  const shared: Crease[] = []
  for (const surface of surfaces) {
    const poly = surface.poly
    if (poly.length < 2) continue
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      if (!a || !b) continue
      if (hypot2(a.x, a.y, b.x, b.y) < 1) continue
      const key = edgeKey(a, b)
      const prev = edgeCounts.get(key)
      if (prev) {
        shared.push(prev)
        edgeCounts.delete(key)
      } else {
        edgeCounts.set(key, { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } })
      }
    }
  }
  const out = [...shared, ...edgeCounts.values()]
  for (const wall of ridgeWalls) {
    if (hypot2(wall.a.x, wall.a.y, wall.b.x, wall.b.y) < 1) continue
    if (creaseAlreadyListed(out, wall.a, wall.b)) continue
    out.push({ a: { ...wall.a }, b: { ...wall.b } })
  }
  return out
}

function segmentIntersectionT(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D,
): { t: number; u: number } | null {
  const dax = a2.x - a1.x
  const day = a2.y - a1.y
  const dbx = b2.x - b1.x
  const dby = b2.y - b1.y
  const den = dax * dby - day * dbx
  if (Math.abs(den) < 1e-9) return null
  const ox = b1.x - a1.x
  const oy = b1.y - a1.y
  const t = (ox * dby - oy * dbx) / den
  const u = (ox * day - oy * dax) / den
  return { t, u }
}

function wallAxisT(wall: Pick<Wall, 'a' | 'b'>, point: Point2D): number {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return 0
  return ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / len2
}

function wallSplitSlackCm(wall: Pick<Wall, 'thickness'>): number {
  const half = Number.isFinite(wall.thickness) ? Math.max(0, wall.thickness) * 0.5 : 0
  return ROOF_TOUCH_SLACK_CM + half
}

function splitPointOnWall(wall: Pick<Wall, 'a' | 'b'>, t: number): Point2D {
  return {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  }
}

function splitNearWallEnd(wall: Pick<Wall, 'a' | 'b'>, t: number, slackCm: number): boolean {
  const p = splitPointOnWall(wall, t)
  return hypot2(p.x, p.y, wall.a.x, wall.a.y) <= slackCm || hypot2(p.x, p.y, wall.b.x, wall.b.y) <= slackCm
}

function splitAtCreaseEnd(p: Point2D, crease: Crease): boolean {
  return (
    hypot2(p.x, p.y, crease.a.x, crease.a.y) <= ROOF_TOUCH_SLACK_CM ||
    hypot2(p.x, p.y, crease.b.x, crease.b.y) <= ROOF_TOUCH_SLACK_CM
  )
}

function findCreaseSplitT(wall: Wall, creases: ReadonlyArray<Crease>): number | null {
  const len = hypot2(wall.a.x, wall.a.y, wall.b.x, wall.b.y)
  if (len < BIND_MIN_SPLIT_SEGMENT_CM * 2) return null
  const tMin = BIND_MIN_SPLIT_SEGMENT_CM / len
  const tMax = 1 - tMin
  const faceSlack = wallSplitSlackCm(wall)
  let bestT: number | null = null
  let bestDistToMid = Infinity
  const consider = (t: number) => {
    if (t < tMin || t > tMax) return
    const distMid = Math.abs(t - 0.5)
    if (distMid >= bestDistToMid) return
    bestDistToMid = distMid
    bestT = t
  }
  for (const crease of creases) {
    const hit = segmentIntersectionT(wall.a, wall.b, crease.a, crease.b)
    if (hit && hit.u >= -0.05 && hit.u <= 1.05) {
      const p = splitPointOnWall(wall, hit.t)
      // T-las (dakvlak-hoek / flush-stub): niet de nok die door de gevel gaat.
      const teeAtEnd = splitAtCreaseEnd(p, crease) && splitNearWallEnd(wall, hit.t, faceSlack)
      if (!teeAtEnd) consider(hit.t)
    }
    // Dakvlak-hoek op de hartlijn (omtrek op de buitenface, geen kruising).
    if (distToSeg(crease.a, wall.a, wall.b) <= faceSlack) {
      const t = wallAxisT(wall, crease.a)
      if (!splitNearWallEnd(wall, t, faceSlack)) consider(t)
    }
    if (distToSeg(crease.b, wall.a, wall.b) <= faceSlack) {
      const t = wallAxisT(wall, crease.b)
      if (!splitNearWallEnd(wall, t, faceSlack)) consider(t)
    }
  }
  return bestT
}

function splitFloorOnCreases(
  plan: FloorPlan,
  floorIndex: number,
  creases: ReadonlyArray<Crease>,
): { plan: FloorPlan; splits: number } {
  let next = plan
  let splits = 0
  // Herhaal tot stabiel (muur kan meerdere creases kruisen).
  for (let pass = 0; pass < 32; pass += 1) {
    const floor = next.floors[floorIndex]
    if (!floor) break
    let didSplit = false
    for (const wall of floor.walls) {
      if (!(wall.thickness > 1e-6)) continue
      const t = findCreaseSplitT(wall, creases)
      if (t == null) continue
      const result = splitPlanWallAtT(next, wall.id, t)
      if (!result) continue
      next = result.plan
      splits += 1
      didSplit = true
      break
    }
    if (!didSplit) break
  }
  return { plan: next, splits }
}

function mapFloorWalls(
  plan: FloorPlan,
  floorIndex: number,
  mapWalls: (walls: Wall[]) => Wall[],
): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor, index) => {
      if (index !== floorIndex) return floor
      const walls = mapWalls(floor.walls)
      if (walls === floor.walls) return floor
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

/** Absolute muurtop `h` op één eind; `z` blijft. */
function withWallEndpointTopH(
  wall: Wall,
  end: WallEnd,
  topHCm: number,
  floorHeightCm: number,
): Wall {
  const current = wallEndpoint3D(wall, end, floorHeightCm)
  const h = Math.max(current.z + 1, Math.round(topHCm))
  const other = wallEndpoint3D(wall, end === 'a' ? 'b' : 'a', floorHeightCm)
  const a = end === 'a' ? { z: current.z, h } : other
  const b = end === 'a' ? other : { z: current.z, h }
  const extras = { ...(wall.extras ?? {}) }
  delete extras.az
  delete extras.bz
  return {
    ...wall,
    elevation: { a, b },
    extras: Object.keys(extras).length > 0 ? extras : undefined,
  }
}

/** Absolute bodem `z` + top `h` op één eind (dakkapel-fitting). */
function withWallEndpointAbsolute(
  wall: Wall,
  end: WallEnd,
  bottomZCm: number,
  topHCm: number,
  floorHeightCm: number,
): Wall {
  const z = Math.max(0, Math.round(bottomZCm))
  const h = Math.max(z + 1, Math.round(topHCm))
  const other = wallEndpoint3D(wall, end === 'a' ? 'b' : 'a', floorHeightCm)
  const a = end === 'a' ? { z, h } : other
  const b = end === 'a' ? other : { z, h }
  const extras = { ...(wall.extras ?? {}) }
  delete extras.az
  delete extras.bz
  return {
    ...wall,
    elevation: { a, b },
    extras: Object.keys(extras).length > 0 ? extras : undefined,
  }
}

function parentOfNested(
  child: FloorSurface,
  surfaces: ReadonlyArray<FloorSurface>,
): FloorSurface | null {
  const id = child.roofParentId?.trim()
  if (id) {
    const named = surfaces.find((surface) => surface.id === id)
    if (named) return named
  }
  return resolveDormerParent(child, surfaces, child.id)
}

function endAlreadyAt(
  wall: Wall,
  end: WallEnd,
  bottomZCm: number,
  topHCm: number,
  floorHeightCm: number,
): boolean {
  const cur = wallEndpoint3D(wall, end, floorHeightCm)
  const z = Math.max(0, Math.round(bottomZCm))
  const h = Math.max(z + 1, Math.round(topHCm))
  return Math.abs(cur.z - z) < 0.51 && Math.abs(cur.h - h) < 0.51
}

function dormerEdgeSampleSlackCm(wall: Pick<Wall, 'thickness'>): number {
  const half = Number.isFinite(wall.thickness) ? Math.max(0, wall.thickness) * 0.5 : 0
  return ROOF_TOUCH_SLACK_CM + half
}

function bindOneWallToRoofs(
  wall: Wall,
  walls: ReadonlyArray<Wall>,
  surfaces: ReadonlyArray<FloorSurface>,
  plan: FloorPlan,
  floorIndex: number,
  floorHeightCm: number,
  skipNearFloor = false,
): { wall: Wall; bound: boolean; blocked: number; uncovered: number } {
  const planes = surfaces.filter((s) => !isDormerLikeRoof(s, surfaces))
  const edge = findDormerEdgeSurface(wall, surfaces)
  const kopse = edge != null && isKopseDormerEdgeWall(wall, edge, surfaces)
  const wang = edge != null && !kopse
  const parent = edge ? parentOfNested(edge, surfaces) : null
  const edgeSlack = edge ? dormerEdgeSampleSlackCm(wall) : ROOF_TOUCH_SLACK_CM
  const wangFullHeight =
    wang &&
    hasCollinearContinuation(
      wall,
      walls.filter((other) => findDormerEdgeSurface(other, surfaces)?.id !== edge.id),
    )
  let next = wall
  let bound = false
  let blocked = 0
  let uncovered = 0
  for (const end of ['a', 'b'] as const) {
    const point = wall[end]
    if (!isPointSkyExposedOnFloor(plan, floorIndex, point)) {
      blocked += 1
      continue
    }
    if (kopse && edge) {
      const childZ = sampleRoofZAtPoint([edge], point, { touchSlackCm: edgeSlack })
      const parentZ = parent
        ? sampleRoofZAtPoint([parent], point, { touchSlackCm: edgeSlack })
        : sampleRoofZAtPoint(planes, point, { touchSlackCm: edgeSlack })
      if (childZ == null || parentZ == null) {
        uncovered += 1
        continue
      }
      if (endAlreadyAt(next, end, parentZ, childZ, floorHeightCm)) continue
      next = withWallEndpointAbsolute(next, end, parentZ, childZ, floorHeightCm)
      bound = true
      continue
    }
    if (wang && edge) {
      const childZ = sampleRoofZAtPoint([edge], point, { touchSlackCm: edgeSlack })
      if (childZ == null) {
        uncovered += 1
        continue
      }
      if (wangFullHeight) {
        if (endAlreadyAt(next, end, 0, childZ, floorHeightCm)) continue
        next = withWallEndpointAbsolute(next, end, 0, childZ, floorHeightCm)
        bound = true
        continue
      }
      const parentZ = parent
        ? sampleRoofZAtPoint([parent], point, { touchSlackCm: edgeSlack })
        : sampleRoofZAtPoint(planes, point, { touchSlackCm: edgeSlack })
      if (parentZ == null) {
        uncovered += 1
        continue
      }
      if (endAlreadyAt(next, end, parentZ, childZ, floorHeightCm)) continue
      next = withWallEndpointAbsolute(next, end, parentZ, childZ, floorHeightCm)
      bound = true
      continue
    }
    const z = sampleRoofZAtPoint(planes, point)
    if (z == null) {
      uncovered += 1
      continue
    }
    if (skipNearFloor && z <= ROOF_VERTICAL_Z_SLACK_CM) {
      uncovered += 1
      continue
    }
    const current = wallEndpoint3D(next, end, floorHeightCm)
    const h = Math.max(current.z + 1, Math.round(z))
    if (Math.abs(current.h - h) < 0.51) continue
    next = withWallEndpointTopH(next, end, z, floorHeightCm)
    bound = true
  }
  return { wall: next, bound, blocked, uncovered }
}

/**
 * Zet muur-einden van één verdieping op dakvlak-Z (per segment, niet per knoop).
 * Skip: verboden gebied (floor+1) en einden zonder dakvlak.
 */
export function bindFloorWallsToRoofs(
  plan: FloorPlan,
  floorIndex: number,
  options?: BindWallsToRoofsOptions,
): BindWallsToRoofsResult {
  const empty: BindWallsToRoofsResult = {
    plan,
    boundJunctions: 0,
    skippedBlocked: 0,
    skippedUncovered: 0,
    splits: 0,
    flushedEdges: 0,
    boundSkylights: 0,
    skippedSkylights: 0,
  }
  const floor = plan.floors[floorIndex]
  if (!floor) return empty

  const surfaces = listRidgeSurfacesOnFloor(floor)
  if (surfaces.length === 0) return empty

  const onlyWallIds =
    options?.wallIds && options.wallIds.length > 0 ? new Set(options.wallIds) : null
  const localOnly = onlyWallIds != null

  let working = plan
  let splits = 0
  if (options?.splitCreases === true && !localOnly) {
    const creases = collectRoofCreases(surfaces, listRidgeWallsOnFloor(floor))
    if (creases.length > 0) {
      const splitResult = splitFloorOnCreases(working, floorIndex, creases)
      working = splitResult.plan
      splits = splitResult.splits
    }
  }

  const targetFloor = working.floors[floorIndex]
  if (!targetFloor) return { ...empty, plan: working, splits }

  let boundJunctions = 0
  let skippedBlocked = 0
  let skippedUncovered = 0
  let walls = targetFloor.walls
  const floorHeightCm = targetFloor.height
  const touchedWallIds = new Set<string>()

  walls = walls.map((wall) => {
    if (onlyWallIds && !onlyWallIds.has(wall.id)) return wall
    if (!(wall.thickness > 1e-6)) return wall
    const result = bindOneWallToRoofs(
      wall,
      walls,
      surfaces,
      working,
      floorIndex,
      floorHeightCm,
      options?.skipNearFloor === true,
    )
    skippedBlocked += result.blocked
    skippedUncovered += result.uncovered
    if (!result.bound) return wall
    boundJunctions += 1
    touchedWallIds.add(wall.id)
    return result.wall
  })

  if (touchedWallIds.size > 0) {
    walls = walls.map((wall) => {
      if (!touchedWallIds.has(wall.id)) return wall
      return {
        ...wall,
        openings: wall.openings.map((opening) => clampOpeningToStory(opening, wall, floorHeightCm)),
      }
    })
  }

  const flushed = localOnly
    ? { walls, flushed: 0 }
    : flushKopseDormerWalls(walls, surfaces)
  walls = flushed.walls
  const flushedEdges = flushed.flushed
  if (touchedWallIds.size > 0 || flushedEdges > 0) {
    working = mapFloorWalls(working, floorIndex, () => walls)
  }

  let boundSkylights = 0
  let skippedSkylights = 0
  const skylightFloor = working.floors[floorIndex]
  if (!localOnly && skylightFloor?.items?.some((item) => isSkylightItem(item))) {
    const nextItems = (skylightFloor.items ?? []).map((item) => {
      if (!isSkylightItem(item)) return item
      const result = bindSkylightToRoofs(item, surfaces, working, floorIndex)
      if (!result.ok) {
        skippedSkylights += 1
        return item
      }
      boundSkylights += 1
      return result.item
    })
    working = {
      ...working,
      floors: working.floors.map((floor, index) =>
        index === floorIndex ? { ...floor, items: nextItems } : floor,
      ),
    }
  }

  // Floorplanner: floor.height ≥ hoogste muurtop — alleen op de bovenste
  // verdieping. Erboven stapelt het aanzicht op story-height (plaat+height);
  // een nok/aanbouw-dak mag 1e/2e niet optillen.
  const boundFloor = working.floors[floorIndex]
  const hasFloorAbove = working.floors[floorIndex + 1] != null
  if (
    !localOnly &&
    boundFloor &&
    !hasFloorAbove &&
    (boundJunctions > 0 || splits > 0 || boundSkylights > 0)
  ) {
    let maxTop = boundFloor.height
    for (const wall of boundFloor.walls) {
      for (const end of ['a', 'b'] as const) {
        maxTop = Math.max(maxTop, wallEndpoint3D(wall, end, boundFloor.height).h)
      }
    }
    for (const wall of listRidgeWallsOnFloor(boundFloor)) {
      for (const end of ['a', 'b'] as const) {
        maxTop = Math.max(maxTop, wallEndpoint3D(wall, end, boundFloor.height).h)
      }
    }
    const nextHeight = Math.max(boundFloor.height, Math.round(maxTop))
    if (nextHeight !== boundFloor.height) {
      working = {
        ...working,
        floors: working.floors.map((floor, index) =>
          index === floorIndex ? { ...floor, height: nextHeight } : floor,
        ),
      }
    }
  }

  return {
    plan: working,
    boundJunctions,
    skippedBlocked,
    skippedUncovered,
    splits,
    flushedEdges,
    boundSkylights,
    skippedSkylights,
  }
}

/**
 * Alleen de randmuren van één dakkapel-vlak opnieuw op dak-Z zetten
 * (kopse: ouder→kind; wang: dak-tot-dak). Zelfde recept als «Muren aan dak»,
 * zonder crease-split / floor-height tillen.
 */
export function bindDormerEdgeWallsToRoof(plan: FloorPlan, surfaceId: string): FloorPlan {
  const id = surfaceId.trim()
  if (!id) return plan
  for (let floorIndex = 0; floorIndex < plan.floors.length; floorIndex += 1) {
    const floor = plan.floors[floorIndex]
    if (!floor) continue
    const surfaces = listRidgeSurfacesOnFloor(floor)
    const surface = surfaces.find((entry) => entry.id === id)
    if (!surface || !isDormerLikeRoof(surface, surfaces)) continue
    const wallIds = floor.walls
      .filter((wall) => findDormerEdgeSurface(wall, surfaces)?.id === id)
      .map((wall) => wall.id)
    if (wallIds.length === 0) return plan
    return bindFloorWallsToRoofs(plan, floorIndex, { wallIds }).plan
  }
  return plan
}

function floorIndexOfRoofSurface(plan: FloorPlan, surfaceId: string): number {
  const id = surfaceId.trim()
  if (!id) return -1
  return plan.floors.findIndex((floor) =>
    listRidgeSurfacesOnFloor(floor).some((surface) => surface.id === id),
  )
}

/**
 * Na dakvlak-edit: hoogtes binden. Dakkapel schuift ook de randmuren in XY;
 * hoofddak laat de gevels staan (alleen `az`/`bz`).
 */
export function syncDormerAssemblyAfterRoofEdit(
  plan: FloorPlan,
  surfaceId: string,
  oldPoly?: ReadonlyArray<Point2D & { z?: number }>,
): FloorPlan {
  const withXy =
    oldPoly && oldPoly.length > 0
      ? followDormerWallsForSurfaceMove(plan, surfaceId, oldPoly)
      : plan
  const floorIndex = floorIndexOfRoofSurface(withXy, surfaceId)
  if (floorIndex < 0) return withXy
  const surfaces = listRidgeSurfacesOnFloor(withXy.floors[floorIndex])
  const surface = surfaces.find((entry) => entry.id === surfaceId.trim())
  if (!surface || !isRoofSurface(surface)) return withXy
  if (isDormerLikeRoof(surface, surfaces)) {
    return bindDormerEdgeWallsToRoof(withXy, surfaceId)
  }
  return bindFloorWallsToRoofs(withXy, floorIndex, { skipNearFloor: true }).plan
}

export const syncWallsAfterRoofEdit = syncDormerAssemblyAfterRoofEdit

/** Floors met minstens één dakvlak (voor UI-keuze). */
export function listFloorsWithRoofPlanes(
  plan: FloorPlan | null | undefined,
): Array<{ floorIndex: number; name: string }> {
  if (!plan) return []
  const out: Array<{ floorIndex: number; name: string }> = []
  plan.floors.forEach((floor, floorIndex) => {
    if (listRidgeSurfacesOnFloor(floor).length === 0) return
    out.push({
      floorIndex,
      name: floor.name?.trim() || `Floor ${floorIndex}`,
    })
  })
  return out
}
