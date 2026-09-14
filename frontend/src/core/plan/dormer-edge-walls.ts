/**
 * Dakkapel-randmuren: hartlijn op de kindvlak-rand (niet een kamerschot in de kapel).
 * Bind flusht hartlijn naar de buitenface; aanzicht toont dezelfde set.
 */
import {
  isDormerLikeRoof,
  listRidgeSurfacesOnFloor,
  resolveDormerParent,
  ROOF_SAME_POINT_CM,
  ROOF_TOUCH_SLACK_CM,
} from './roof-planes'
import { areCollinearWalls } from './align-wall-junction-balance'
import {
  openingWorldCenter,
  reprojectWallOpenings,
  wallAxisPoint,
  wallDirectionUnit,
  wallFaces,
  wallLeftNormal,
} from './plan-wall-geom'
import type { Floor, FloorSurface, Point2D, Wall } from './types'

function hypot2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

function polyCentroid(poly: readonly Point2D[]): Point2D | null {
  if (poly.length < 3) return null
  let sx = 0
  let sy = 0
  for (const p of poly) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / poly.length, y: sy / poly.length }
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

function wallEdgeSlackCm(wall: Pick<Wall, 'thickness'>): number {
  const half = Number.isFinite(wall.thickness) ? Math.max(0, wall.thickness) * 0.5 : 0
  return ROOF_TOUCH_SLACK_CM + half
}

/** Hartlijn-einden op de kindvlak-rand (niet midden-in, niet een lange gevel die de kapel raakt). */
export function isWallOnDormerEdge(
  wall: Pick<Wall, 'a' | 'b' | 'thickness'>,
  surface: FloorSurface,
): boolean {
  if (surface.poly.length < 3) return false
  const slack = wallEdgeSlackCm(wall)
  return (
    distToPolyEdges(wall.a, surface.poly) <= slack &&
    distToPolyEdges(wall.b, surface.poly) <= slack
  )
}

export function findDormerEdgeSurface(
  wall: Pick<Wall, 'a' | 'b' | 'thickness'>,
  surfaces: ReadonlyArray<FloorSurface>,
): FloorSurface | null {
  let best: FloorSurface | null = null
  let bestDist = Infinity
  for (const surface of surfaces) {
    if (!isDormerLikeRoof(surface, surfaces) || surface.poly.length < 3) continue
    if (!isWallOnDormerEdge(wall, surface)) continue
    const mid = wallAxisPoint(wall, 0.5)
    const dist = distToPolyEdges(mid, surface.poly)
    if (dist >= bestDist) continue
    bestDist = dist
    best = surface
  }
  return best
}

export type DormerEdgeWall = {
  wall: Wall
  dormer: FloorSurface
}

export function listDormerEdgeWalls(floor: Floor | null | undefined): DormerEdgeWall[] {
  if (!floor) return []
  const surfaces = listRidgeSurfacesOnFloor(floor)
  if (surfaces.length === 0) return []
  const out: DormerEdgeWall[] = []
  for (const wall of floor.walls) {
    const dormer = findDormerEdgeSurface(wall, surfaces)
    if (!dormer) continue
    out.push({ wall, dormer })
  }
  return out
}

function samePoint(a: Point2D, b: Point2D, slack = 0.05): boolean {
  return hypot2(a.x, a.y, b.x, b.y) <= slack
}

/** Hartlijn-flush is ½ dikte; las moet die offset nog vinden. */
function weldSlackCm(wall: Pick<Wall, 'thickness'>): number {
  const half = Number.isFinite(wall.thickness) ? Math.max(0, wall.thickness) * 0.5 : 0
  return Math.max(ROOF_SAME_POINT_CM, half + 2)
}

/**
 * Collineair buursegment (zelfde as, gedeelde knoop).
 * Volle-hoogte bind alleen op zo'n gevelketen, niet op een losse wang.
 */
export function hasCollinearContinuation(
  wall: Wall,
  walls: ReadonlyArray<Wall>,
  slackCm = ROOF_SAME_POINT_CM,
): boolean {
  for (const other of walls) {
    if (other.id === wall.id) continue
    if (!areCollinearWalls(wall, other)) continue
    if (
      endsNear(wall.a, other.a, slackCm) ||
      endsNear(wall.a, other.b, slackCm) ||
      endsNear(wall.b, other.a, slackCm) ||
      endsNear(wall.b, other.b, slackCm)
    ) {
      return true
    }
  }
  return false
}

/** Snijpunt van twee oneindige lijnen; null als evenwijdig. */
function unboundedLineHit(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D,
): Point2D | null {
  const hit = segmentLineIntersectionT(a1, a2, b1, b2)
  if (!hit) return null
  return {
    x: a1.x + (a2.x - a1.x) * hit.t,
    y: a1.y + (a2.y - a1.y) * hit.t,
  }
}

/** Eind schuift over de eigen as tot de nieuwe kopse-lijn — muur blijft recht. */
function weldEndToLine(wall: Wall, end: 'a' | 'b', lineA: Point2D, lineB: Point2D): Wall {
  const other = end === 'a' ? wall.b : wall.a
  const hit = unboundedLineHit(wall.a, wall.b, lineA, lineB)
  if (!hit) return wall
  if (hypot2(hit.x, hit.y, other.x, other.y) < 4) return wall
  if (samePoint(hit, wall[end])) return wall
  return withEndXy(wall, end, hit)
}

/**
 * Hartlijn naar de huidige buitenface; dikte naar binnen (a→b).
 * Baksteen blijft staan. Buiten = van de kindvlak-centroid af.
 */
export function flushDormerEdgeWallOutward(wall: Wall, dormer: FloorSurface): Wall {
  const centroid = polyCentroid(dormer.poly)
  if (!centroid) return wall
  const mid = wallAxisPoint(wall, 0.5)
  const ix = centroid.x - mid.x
  const iy = centroid.y - mid.y
  const iLen = Math.hypot(ix, iy)
  if (iLen < 1e-9) return wall
  const inward = { x: ix / iLen, y: iy / iLen }
  const n = wallLeftNormal(wall)
  const leftIsInward = n.x * inward.x + n.y * inward.y > 0
  const faces = wallFaces(wall)
  const outer = leftIsInward ? faces.right : faces.left
  const nextBalance = leftIsInward ? 1 : 0
  const already =
    Math.abs((wall.balance ?? 0.5) - nextBalance) < 1e-6 &&
    samePoint(wall.a, outer.a) &&
    samePoint(wall.b, outer.b)
  if (already) return wall
  const next: Wall = {
    ...wall,
    a: { x: outer.a.x, y: outer.a.y },
    b: { x: outer.b.x, y: outer.b.y },
    balance: nextBalance,
  }
  if (wall.openings.length === 0) return next
  const centers = wall.openings.map((opening) => openingWorldCenter(wall, opening.t))
  return { ...next, openings: reprojectWallOpenings(next, centers) }
}

function withEndXy(wall: Wall, end: 'a' | 'b', point: Point2D): Wall {
  const next: Wall = {
    ...wall,
    a: end === 'a' ? { x: point.x, y: point.y } : wall.a,
    b: end === 'b' ? { x: point.x, y: point.y } : wall.b,
  }
  if (wall.openings.length === 0) return next
  const centers = wall.openings.map((opening) => openingWorldCenter(wall, opening.t))
  return { ...next, openings: reprojectWallOpenings(next, centers) }
}

function parentOfDormer(
  dormer: FloorSurface,
  surfaces: ReadonlyArray<FloorSurface>,
): FloorSurface | null {
  const id = dormer.roofParentId?.trim()
  if (id) {
    const named = surfaces.find((surface) => surface.id === id)
    if (named) return named
  }
  return resolveDormerParent(dormer, surfaces, dormer.id)
}

/** Ouder-helling: laagste-Z → hoogste-Z van de poly (goot → nok). */
export function roofSlopeDir(surface: FloorSurface): Point2D | null {
  let loZ = Infinity
  let hiZ = -Infinity
  let loCount = 0
  let hiCount = 0
  let loX = 0
  let loY = 0
  let hiX = 0
  let hiY = 0
  for (const p of surface.poly) {
    const z = typeof p.z === 'number' && Number.isFinite(p.z) ? p.z : 0
    if (z < loZ - 0.5) {
      loZ = z
      loCount = 1
      loX = p.x
      loY = p.y
    } else if (Math.abs(z - loZ) <= 0.5) {
      loCount += 1
      loX += p.x
      loY += p.y
    }
    if (z > hiZ + 0.5) {
      hiZ = z
      hiCount = 1
      hiX = p.x
      hiY = p.y
    } else if (Math.abs(z - hiZ) <= 0.5) {
      hiCount += 1
      hiX += p.x
      hiY += p.y
    }
  }
  if (loCount === 0 || hiCount === 0 || hiZ - loZ < 1) return null
  const dx = hiX / hiCount - loX / loCount
  const dy = hiY / hiCount - loY / loCount
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null
  return { x: dx / len, y: dy / len }
}

/** Kopse = dwars op ouder-helling (of een opening: voorkant met raam). */
export function isKopseDormerEdgeWall(
  wall: Wall,
  dormer: FloorSurface,
  surfaces: ReadonlyArray<FloorSurface>,
): boolean {
  if (!isWallOnDormerEdge(wall, dormer)) return false
  if (wall.openings.length > 0) return true
  const parent = parentOfDormer(dormer, surfaces)
  const slope = parent ? roofSlopeDir(parent) : null
  if (!slope) return false
  const dir = wallDirectionUnit(wall)
  return Math.abs(dir.x * slope.x + dir.y * slope.y) < 0.5
}

/**
 * Alleen kopse hartlijn naar buitenface. Wangen op 0.5.
 * Hoeken van aangesloten muren (wang) schuiven mee — knoop blijft heel.
 */
export function flushKopseDormerWalls(
  walls: Wall[],
  surfaces: ReadonlyArray<FloorSurface>,
): { walls: Wall[]; flushed: number } {
  const kopseIds = walls
    .filter((wall) => {
      const dormer = findDormerEdgeSurface(wall, surfaces)
      return dormer != null && isKopseDormerEdgeWall(wall, dormer, surfaces)
    })
    .map((wall) => wall.id)
  let next = walls
  let flushed = 0
  for (const id of kopseIds) {
    const wall = next.find((item) => item.id === id)
    if (!wall) continue
    const dormer = findDormerEdgeSurface(wall, surfaces)
    if (!dormer) continue
    const flushedWall = flushDormerEdgeWallOutward(wall, dormer)
    const oldA = wall.a
    const oldB = wall.b
    const slack = weldSlackCm(flushedWall)
    let changed = flushedWall !== wall
    next = next.map((item) => {
      if (item.id === id) return flushedWall
      let out = item
      const aNear =
        endsNear(item.a, oldA, slack) ||
        endsNear(item.a, oldB, slack) ||
        endsNear(item.a, flushedWall.a, slack) ||
        endsNear(item.a, flushedWall.b, slack)
      const bNear =
        endsNear(item.b, oldA, slack) ||
        endsNear(item.b, oldB, slack) ||
        endsNear(item.b, flushedWall.a, slack) ||
        endsNear(item.b, flushedWall.b, slack)
      if (aNear) out = weldEndToLine(out, 'a', flushedWall.a, flushedWall.b)
      if (bNear) out = weldEndToLine(out, 'b', flushedWall.a, flushedWall.b)
      if (out !== item) changed = true
      return out
    })
    if (changed) flushed += 1
  }
  return { walls: next, flushed }
}

export function unboundedWallT(wall: Pick<Wall, 'a' | 'b'>, point: Point2D): number {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return 0
  return ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / len2
}

function distToInfiniteLine(wall: Pick<Wall, 'a' | 'b'>, point: Point2D): number {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return hypot2(point.x, point.y, wall.a.x, wall.a.y)
  const t = ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / (len * len)
  return hypot2(point.x, point.y, wall.a.x + dx * t, wall.a.y + dy * t)
}

function segmentLineIntersectionT(
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

/** t-interval van de muur-as dat de kindvlak-rand raakt (onbegrensd t). */
export function dormerAxisCoverageT(
  wall: Pick<Wall, 'a' | 'b'>,
  poly: readonly Point2D[],
  slackCm = ROOF_TOUCH_SLACK_CM,
): { tMin: number; tMax: number } | null {
  if (poly.length < 2) return null
  const hits: number[] = []
  for (const vertex of poly) {
    if (distToInfiniteLine(wall, vertex) > slackCm) continue
    hits.push(unboundedWallT(wall, vertex))
  }
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) continue
    const hit = segmentLineIntersectionT(wall.a, wall.b, a, b)
    if (!hit) continue
    if (hit.u < -0.05 || hit.u > 1.05) continue
    hits.push(hit.t)
  }
  if (hits.length === 0) return null
  return { tMin: Math.min(...hits), tMax: Math.max(...hits) }
}

/**
 * Klem t van het versleepte eind op het kindvlak.
 * Al buiten: niet naar binnen trekken, alleen verder naar buiten blokkeren.
 */
export function clampDormerEndT(args: {
  wall: Pick<Wall, 'a' | 'b'>
  end: 'a' | 'b'
  nextT: number
  coverage: { tMin: number; tMax: number } | null
  minLengthCm?: number
}): number {
  const len = hypot2(args.wall.a.x, args.wall.a.y, args.wall.b.x, args.wall.b.y)
  const otherT = args.end === 'a' ? 1 : 0
  const currentT = args.end === 'a' ? 0 : 1
  let t = args.nextT
  const minLen = args.minLengthCm ?? 4
  const minDt = len > 1e-9 ? minLen / len : 0
  if (args.coverage) {
    const { tMin, tMax } = args.coverage
    const lo = Math.min(tMin, tMax)
    const hi = Math.max(tMin, tMax)
    if (currentT < lo - 1e-6) {
      t = Math.min(t, currentT)
    } else if (currentT > hi + 1e-6) {
      t = Math.max(t, currentT)
    } else {
      t = Math.max(lo, Math.min(hi, t))
    }
  }
  if (minDt > 0) {
    if (t > otherT - minDt && t < otherT + minDt) {
      t = t >= otherT ? otherT + minDt : otherT - minDt
    }
  }
  return t
}

export function wallPointAtT(wall: Pick<Wall, 'a' | 'b'>, t: number): Point2D {
  return {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  }
}

export function endsNear(a: Point2D, b: Point2D, slackCm = ROOF_SAME_POINT_CM): boolean {
  return hypot2(a.x, a.y, b.x, b.y) <= slackCm
}
