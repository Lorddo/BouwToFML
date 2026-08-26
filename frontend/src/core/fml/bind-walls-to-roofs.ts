/**
 * Bind vloer-muurknopen aan dakvlakken: zet alleen `az.h`/`bz.h` (hartlijn-Z).
 * Optioneel eerst knippen op nok/kil (crease), daarna binden.
 */
import { clampOpeningToStory } from './elevation-opening-edit'
import { splitPlanWallAtT, type SplitWallAtTFn } from './elevation-openings'
import { isPointSkyExposedOnFloor } from './ridge-floor'
import { listRidgeWallsOnFloor } from './ridge-walls'
import { listRidgeSurfacesOnFloor, ROOF_SAME_POINT_CM, ROOF_TOUCH_SLACK_CM } from './roof-planes'
import type { FloorPlan, FloorSurface, Point2D, Wall } from './types'
import { wallEndpoint3D, type WallEnd } from './wall-endpoint-height'

/** Minimale restlengte na knip (zelfde als editor-split). */
export const BIND_MIN_SPLIT_SEGMENT_CM = 4

export type BindWallsToRoofsOptions = {
  /** Knip muren op nok/kil vóór binden (V2). */
  splitCreases?: boolean
  /** Injecteerbare split (tests / UI); default = geen knip zonder deze fn. */
  splitWalls?: SplitWallAtTFn
}

export type BindWallsToRoofsResult = {
  plan: FloorPlan
  boundJunctions: number
  skippedBlocked: number
  skippedUncovered: number
  splits: number
}

type Point3 = Point2D & { z: number }

type JunctionRef = { wallId: string; end: WallEnd }

type Junction = {
  id: string
  x: number
  y: number
  refs: JunctionRef[]
}

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

function junctionKey(point: Point2D, epsCm = 2): string {
  const q = 1 / epsCm
  return `${Math.round(point.x * q)},${Math.round(point.y * q)}`
}

function stableJunctionId(refs: JunctionRef[]): string {
  return [...refs]
    .sort((a, b) => a.wallId.localeCompare(b.wallId) || a.end.localeCompare(b.end))
    .map((ref) => `${ref.wallId}:${ref.end}`)
    .join('|')
}

/** Hartlijn-knopen van vloer-muren (geen nok). */
export function buildFloorJunctions(walls: ReadonlyArray<Wall>): Junction[] {
  const map = new Map<string, Junction>()
  for (const wall of walls) {
    for (const end of ['a', 'b'] as const) {
      const point = wall[end]
      const key = junctionKey(point)
      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          id: '',
          x: point.x,
          y: point.y,
          refs: [{ wallId: wall.id, end }],
        })
        continue
      }
      existing.refs.push({ wallId: wall.id, end })
      existing.x = (existing.x * (existing.refs.length - 1) + point.x) / existing.refs.length
      existing.y = (existing.y * (existing.refs.length - 1) + point.y) / existing.refs.length
    }
  }
  return Array.from(map.values()).map((junction) => ({
    ...junction,
    id: stableJunctionId(junction.refs),
  }))
}

function surfaceRing(surface: FloorSurface): Point2D[] {
  return surface.poly.map((p) => ({ x: p.x, y: p.y }))
}

function surfaceCoversPoint(surface: FloorSurface, point: Point2D): boolean {
  const ring = surfaceRing(surface)
  if (ring.length < 3) return false
  if (pointInPolygon(point, ring)) return true
  return distToPolyEdges(point, ring) <= ROOF_TOUCH_SLACK_CM
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

/** Laagste dakvlak-Z op XY (overlap → min). */
export function sampleRoofZAtPoint(
  surfaces: ReadonlyArray<FloorSurface>,
  point: Point2D,
): number | null {
  let best: number | null = null
  for (const surface of surfaces) {
    if (!surfaceCoversPoint(surface, point)) continue
    const pts: Point3[] = surface.poly.map((p) => ({
      x: p.x,
      y: p.y,
      z: typeof p.z === 'number' && Number.isFinite(p.z) ? p.z : 0,
    }))
    if (pts.length < 3) continue
    let zHit: number | null = null
    // Fan-triangulatie vanaf vertex 0.
    for (let i = 1; i < pts.length - 1; i += 1) {
      const a = pts[0]
      const b = pts[i]
      const c = pts[i + 1]
      if (!a || !b || !c) continue
      const z = zInTriangle(point, a, b, c)
      if (z == null) continue
      zHit = zHit == null ? z : Math.min(zHit, z)
    }
    // Rand: dichtste rand → lineaire Z.
    if (zHit == null) {
      let edgeZ: number | null = null
      let edgeDist = ROOF_TOUCH_SLACK_CM
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
    best = best == null ? zHit : Math.min(best, zHit)
  }
  return best == null ? null : Math.round(best)
}

type Crease = { a: Point2D; b: Point2D }

function edgeKey(a: Point2D, b: Point2D): string {
  const ka = `${Math.round(a.x)},${Math.round(a.y)}`
  const kb = `${Math.round(b.x)},${Math.round(b.y)}`
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
}

/** Gedeelde dakvlak-randen (nok/kil) + nokbalk-assen. */
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
  const out = [...shared]
  for (const wall of ridgeWalls) {
    if (hypot2(wall.a.x, wall.a.y, wall.b.x, wall.b.y) < 1) continue
    // Skip als al als shared edge aanwezig.
    const already = out.some(
      (c) =>
        (samePoint(c.a, wall.a) && samePoint(c.b, wall.b)) ||
        (samePoint(c.a, wall.b) && samePoint(c.b, wall.a)),
    )
    if (already) continue
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

function findCreaseSplitT(wall: Wall, creases: ReadonlyArray<Crease>): number | null {
  const len = hypot2(wall.a.x, wall.a.y, wall.b.x, wall.b.y)
  if (len < BIND_MIN_SPLIT_SEGMENT_CM * 2) return null
  const tMin = BIND_MIN_SPLIT_SEGMENT_CM / len
  const tMax = 1 - tMin
  let bestT: number | null = null
  let bestDistToMid = Infinity
  for (const crease of creases) {
    const hit = segmentIntersectionT(wall.a, wall.b, crease.a, crease.b)
    if (!hit) continue
    if (hit.t < tMin || hit.t > tMax) continue
    if (hit.u < -0.05 || hit.u > 1.05) continue
    const distMid = Math.abs(hit.t - 0.5)
    if (distMid >= bestDistToMid) continue
    bestDistToMid = distMid
    bestT = hit.t
  }
  return bestT
}

function splitFloorOnCreases(
  plan: FloorPlan,
  floorIndex: number,
  creases: ReadonlyArray<Crease>,
  splitWalls: SplitWallAtTFn,
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
      const result = splitPlanWallAtT(next, wall.id, t, splitWalls)
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

function cloneExtras(extras: Wall['extras']): NonNullable<Wall['extras']> {
  return { ...(extras ?? {}) }
}

/** Absolute muurtop `h` op één eind; `z` blijft. */
function withWallEndpointTopH(
  wall: Wall,
  end: WallEnd,
  topHCm: number,
  floorHeightCm: number,
): Wall {
  const key = end === 'a' ? 'az' : 'bz'
  const current = wallEndpoint3D(wall, end, floorHeightCm)
  const h = Math.max(current.z + 1, Math.round(topHCm))
  const extras = cloneExtras(wall.extras)
  extras[key] = { z: current.z, h }
  const otherKey = end === 'a' ? 'bz' : 'az'
  if (extras[otherKey] == null) {
    extras[otherKey] = wallEndpoint3D(wall, end === 'a' ? 'b' : 'a', floorHeightCm)
  }
  return { ...wall, extras }
}

/** Alle wall-ends op één knoop: absolute bovenkant; bodem `z` behouden. */
function setJunctionTopH(
  walls: Wall[],
  refs: ReadonlyArray<JunctionRef>,
  topHCm: number,
  floorHeightCm: number,
): Wall[] {
  if (refs.length === 0) return walls
  const byWall = new Map<string, WallEnd[]>()
  for (const ref of refs) {
    const list = byWall.get(ref.wallId) ?? []
    list.push(ref.end)
    byWall.set(ref.wallId, list)
  }
  let changed = false
  const next = walls.map((wall) => {
    const ends = byWall.get(wall.id)
    if (!ends || ends.length === 0) return wall
    changed = true
    let updated = wall
    for (const end of ends) {
      updated = withWallEndpointTopH(updated, end, topHCm, floorHeightCm)
    }
    return updated
  })
  return changed ? next : walls
}

/**
 * Zet knoop-bovenkanten van één verdieping op dakvlak-Z (hartlijn).
 * Skip: verboden gebied (floor+1) en knopen zonder dakvlak.
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
  }
  const floor = plan.floors[floorIndex]
  if (!floor) return empty

  const surfaces = listRidgeSurfacesOnFloor(floor)
  if (surfaces.length === 0) return empty

  let working = plan
  let splits = 0
  if (options?.splitCreases === true && options.splitWalls) {
    const creases = collectRoofCreases(surfaces, listRidgeWallsOnFloor(floor))
    if (creases.length > 0) {
      const splitResult = splitFloorOnCreases(working, floorIndex, creases, options.splitWalls)
      working = splitResult.plan
      splits = splitResult.splits
    }
  }

  const targetFloor = working.floors[floorIndex]
  if (!targetFloor) return { ...empty, plan: working, splits }

  const junctions = buildFloorJunctions(targetFloor.walls)
  let boundJunctions = 0
  let skippedBlocked = 0
  let skippedUncovered = 0
  let walls = targetFloor.walls
  const floorHeightCm = targetFloor.height
  const touchedWallIds = new Set<string>()

  for (const junction of junctions) {
    const point = { x: junction.x, y: junction.y }
    if (!isPointSkyExposedOnFloor(working, floorIndex, point)) {
      skippedBlocked += 1
      continue
    }
    const z = sampleRoofZAtPoint(surfaces, point)
    if (z == null) {
      skippedUncovered += 1
      continue
    }
    const topHCm = Math.max(1, Math.round(z))
    // Skip no-op als alle ends al op die bovenkant zitten.
    let needsWrite = false
    for (const ref of junction.refs) {
      const wall = walls.find((item) => item.id === ref.wallId)
      if (!wall) continue
      const end = wallEndpoint3D(wall, ref.end, floorHeightCm)
      if (Math.abs(end.h - topHCm) > 0.05) {
        needsWrite = true
        break
      }
    }
    if (!needsWrite) continue
    walls = setJunctionTopH(walls, junction.refs, topHCm, floorHeightCm)
    for (const ref of junction.refs) touchedWallIds.add(ref.wallId)
    boundJunctions += 1
  }

  if (touchedWallIds.size > 0) {
    walls = walls.map((wall) => {
      if (!touchedWallIds.has(wall.id)) return wall
      return {
        ...wall,
        openings: wall.openings.map((opening) => clampOpeningToStory(opening, wall, floorHeightCm)),
      }
    })
    working = mapFloorWalls(working, floorIndex, () => walls)
  }

  // Floorplanner + aanzicht: floor.height ≥ hoogste muurtop (az/bz ongemoeid).
  const boundFloor = working.floors[floorIndex]
  if (boundFloor && (boundJunctions > 0 || splits > 0)) {
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
  }
}

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
