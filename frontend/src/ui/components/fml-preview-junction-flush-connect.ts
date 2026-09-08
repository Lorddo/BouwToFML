/**
 * Keep-axis flush-connect: bij junction-merge as houden + balance op het kortste
 * collineaire segment wanneer de dwars-offset klein is (jog of extensie naar host).
 * Geen diagonaal/chamfer. Ctrl/snap-uit blijft elders; deze module is pure geometrie.
 *
 * Marges (cm):
 * - across ≤ 15 (parallel) of ≤ 25 (ortho / near-ortho jog) — `JUNCTION_BALANCE_*`
 * - parallel ook across ≤ Δt/2 + 1
 * - 45°-chamfer (along én across beide >3 en ratio ~1) → geen flush
 * - extensie: along mag groot zijn zolang across binnen marge blijft
 */
import {
  JUNCTION_BALANCE_JOG_STUB_MAX_CM,
  JUNCTION_BALANCE_STUB_MAX_CM,
} from '@/core/fml/align-wall-junction-balance'
import { FML_WALL_BALANCE_FALLBACK } from '@/core/fml/extraction-to-plan-geom'
import {
  clampWallBalance,
  floorplannerLeftNormal,
  wallDirectionUnit,
  wallLengthCm,
} from '@/core/fml/fml-wall-geom'
import type { FloorArea, Point2D, Wall } from '@/core/fml/types'
import {
  BALANCE_DEFAULT,
  buildJunctions,
  cloneWalls,
  distance,
  JUNCTION_POINT_SNAP_CM,
  mergeJunctions,
  pruneCollapsedWalls,
  stableJunctionId,
  type JunctionNode,
} from './fml-preview-junction-core'
import { openingWorldCenter, reprojectWallOpenings } from './fml-preview-openings'
import { setWallsBalance } from './fml-preview-wall-edit'
import { moveJunctionWithWallJoins } from './fml-preview-wall-slide'

const COLLINEAR_EPS_DEG = 12
/** Extra slack op Δt/2 voor parallelle face-flush. */
const OFFSET_SLACK_CM = 1
const LANDING_EPS_CM = 0.05
/** Beide componenten boven dit → mogelijke 45°-chamfer (ratio-check). */
const CHAMFER_MIN_LEG_CM = 3
/** across/along in (1/r, r) met r=2.5 ⇒ ~22°–68° t.o.v. as = chamfer. */
const CHAMFER_RATIO_MAX = 2.5

type FlushSide = 'plus' | 'minus'

function wallAngleDeg(wall: Wall): number {
  return (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI
}

function undirectedAngleDiffDeg(a: number, b: number): number {
  let diff = Math.abs(a - b) % 180
  if (diff > 90) diff = 180 - diff
  return diff
}

function areParallelWalls(a: Wall, b: Wall): boolean {
  return undirectedAngleDiffDeg(wallAngleDeg(a), wallAngleDeg(b)) <= COLLINEAR_EPS_DEG
}

function areOrthogonalWalls(a: Wall, b: Wall): boolean {
  return undirectedAngleDiffDeg(wallAngleDeg(a), wallAngleDeg(b)) >= 90 - COLLINEAR_EPS_DEG
}

function wallsAtNode(
  walls: ReadonlyArray<Wall>,
  node: JunctionNode,
  options?: { includeCenterlineHits?: boolean },
): Wall[] {
  const out: Wall[] = []
  const seen = new Set<string>()
  for (const ref of node.refs) {
    if (seen.has(ref.wallId)) continue
    seen.add(ref.wallId)
    const wall = walls.find((item) => item.id === ref.wallId)
    if (wall) out.push(wall)
  }
  if (options?.includeCenterlineHits !== true) return out

  // Ook muren waarvan de hartlijn door/nabij de knoop loopt (T op host zonder eigen eind).
  const point = { x: node.x, y: node.y }
  for (const wall of walls) {
    if (seen.has(wall.id)) continue
    const ab = { x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y }
    const lenSq = ab.x * ab.x + ab.y * ab.y
    if (lenSq < 1e-9) continue
    const t = ((point.x - wall.a.x) * ab.x + (point.y - wall.a.y) * ab.y) / lenSq
    if (t < -0.02 || t > 1.02) continue
    const proj = { x: wall.a.x + t * ab.x, y: wall.a.y + t * ab.y }
    if (distance(point, proj) <= 2) {
      seen.add(wall.id)
      out.push(wall)
    }
  }
  return out
}

/** Muur is bijna H of V (≤12°); schuine muren krijgen geen auto-flush. */
function isNearAxisAligned(wall: Wall): boolean {
  const angle = ((wallAngleDeg(wall) % 180) + 180) % 180
  const toH = Math.min(angle, 180 - angle)
  const toV = Math.abs(angle - 90)
  return Math.min(toH, toV) <= COLLINEAR_EPS_DEG
}

function wallIsVertical(wall: Wall): boolean {
  return Math.abs(wall.b.x - wall.a.x) < Math.abs(wall.b.y - wall.a.y)
}

function axisValueOfWall(wall: Wall): number {
  return wallIsVertical(wall) ? (wall.a.x + wall.b.x) / 2 : (wall.a.y + wall.b.y) / 2
}

function crossAxisComponent(normal: Point2D, vertical: boolean): number {
  return vertical ? normal.x : normal.y
}

function faceCrossCoord(wall: Wall, side: FlushSide, balance = wall.balance): number {
  const cl = axisValueOfWall(wall)
  const vertical = wallIsVertical(wall)
  const c = crossAxisComponent(floorplannerLeftNormal(wallDirectionUnit(wall)), vertical)
  const thickness = wall.thickness
  const b = clampWallBalance(balance ?? FML_WALL_BALANCE_FALLBACK)
  if (side === 'plus') return cl + c * (thickness * b)
  return cl - c * (thickness * (1 - b))
}

/** Flush-connect: 2 decimalen (Floorplanner), géén export-stappen 0/0.25/0.5/0.75/1. */
function roundFlushBalance(value: number): number {
  return Math.round(clampWallBalance(value) * 100) / 100
}

/**
 * Balance zodat een face op flushCross landt.
 * `interiorWorldSign`: +1 = ruimte naar +X (V) / +Y (H); kiest plus/minus via **deze** muur a→b.
 */
function balanceForWorldFlushFace(
  wall: Wall,
  flushCross: number,
  maxShiftCm: number,
  interiorWorldSign?: number,
): number {
  const cl = axisValueOfWall(wall)
  const vertical = wallIsVertical(wall)
  const c = crossAxisComponent(floorplannerLeftNormal(wallDirectionUnit(wall)), vertical)
  const thickness = wall.thickness
  if (!(thickness > 1e-9) || Math.abs(c) < 1e-12) return FML_WALL_BALANCE_FALLBACK

  const delta = flushCross - cl
  const fromPlus = clampWallBalance(delta / (c * thickness))
  const fromMinus = clampWallBalance(1 + delta / (c * thickness))
  const errPlus = Math.abs(faceCrossCoord(wall, 'plus', fromPlus) - flushCross)
  const errMinus = Math.abs(faceCrossCoord(wall, 'minus', fromMinus) - flushCross)

  // Plus-face van déze muur ligt in wereldrichting sign(c). Map ruimte-kant → plus/minus.
  let next: number
  if (interiorWorldSign != null && Math.abs(interiorWorldSign) > 1e-9) {
    const preferPlus = interiorWorldSign * c >= 0
    next = preferPlus ? fromPlus : fromMinus
  } else {
    next = errPlus <= errMinus ? fromPlus : fromMinus
  }

  if (maxShiftCm > 0 && thickness > 0) {
    const maxDeltaB = Math.min(0.5, maxShiftCm / thickness)
    next = Math.min(0.5 + maxDeltaB, Math.max(0.5 - maxDeltaB, next))
  }
  return roundFlushBalance(next)
}

function projectPointOnAxis(point: Point2D, origin: Point2D, dir: Point2D): Point2D {
  const t = (point.x - origin.x) * dir.x + (point.y - origin.y) * dir.y
  return { x: origin.x + t * dir.x, y: origin.y + t * dir.y }
}

function lineIntersection(
  originA: Point2D,
  dirA: Point2D,
  originB: Point2D,
  dirB: Point2D,
): Point2D | null {
  const cross = dirA.x * dirB.y - dirA.y * dirB.x
  if (Math.abs(cross) < 1e-12) return null
  const dx = originB.x - originA.x
  const dy = originB.y - originA.y
  const t = (dx * dirB.y - dy * dirB.x) / cross
  return { x: originA.x + t * dirA.x, y: originA.y + t * dirA.y }
}

interface FlushPair {
  wallS: Wall
  wallT: Wall
  parallel: boolean
  ortho: boolean
  distCm: number
  alongCm: number
  acrossCm: number
}

function analyzeFlushPair(
  wallS: Wall,
  wallT: Wall,
  source: Point2D,
  target: Point2D,
): FlushPair | null {
  const parallel = areParallelWalls(wallS, wallT)
  const ortho = areOrthogonalWalls(wallS, wallT)
  if (!parallel && !ortho) return null

  const st = { x: target.x - source.x, y: target.y - source.y }
  const distCm = Math.hypot(st.x, st.y)
  const dirS = wallDirectionUnit(wallS)
  const alongCm = Math.abs(st.x * dirS.x + st.y * dirS.y)
  const acrossCm = Math.abs(st.x * dirS.y - st.y * dirS.x)
  return { wallS, wallT, parallel, ortho, distCm, alongCm, acrossCm }
}

function pickFlushPair(
  walls: ReadonlyArray<Wall>,
  source: JunctionNode,
  target: JunctionNode,
): FlushPair | null {
  const sourceWalls = wallsAtNode(walls, source)
  const targetWalls = wallsAtNode(walls, target, { includeCenterlineHits: true })
  if (sourceWalls.length === 0 || targetWalls.length === 0) return null

  let best: FlushPair | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const wallS of sourceWalls) {
    for (const wallT of targetWalls) {
      if (wallS.id === wallT.id) continue
      const pair = analyzeFlushPair(wallS, wallT, source, target)
      if (!pair) continue
      // Prefer kleine dwars-offset (extensie of jog); ortho iets boven parallel.
      const score = pair.acrossCm * 10 + pair.distCm * 0.01 + (pair.ortho ? 0 : 1)
      if (score < bestScore) {
        bestScore = score
        best = pair
      }
    }
  }
  return best
}

/**
 * 45°-achtige stub: beide benen relevant en vergelijkbaar → bewuste diagonaal, geen flush.
 * Extensie (across << along) en zuivere jog (along << across) blijven OK.
 */
function isChamferStub(pair: FlushPair): boolean {
  if (pair.acrossCm < CHAMFER_MIN_LEG_CM || pair.alongCm < CHAMFER_MIN_LEG_CM) return false
  const ratio = pair.acrossCm / pair.alongCm
  return ratio > 1 / CHAMFER_RATIO_MAX && ratio < CHAMFER_RATIO_MAX
}

function maxAcrossCm(pair: FlushPair): number {
  return pair.ortho ? JUNCTION_BALANCE_JOG_STUB_MAX_CM : JUNCTION_BALANCE_STUB_MAX_CM
}

function clOffsetCm(pair: FlushPair): number {
  if (pair.parallel) {
    return Math.abs(axisValueOfWall(pair.wallS) - axisValueOfWall(pair.wallT))
  }
  return pair.acrossCm
}

function planCentroid(walls: ReadonlyArray<Wall>): Point2D {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const wall of walls) {
    minX = Math.min(minX, wall.a.x, wall.b.x)
    minY = Math.min(minY, wall.a.y, wall.b.y)
    maxX = Math.max(maxX, wall.a.x, wall.b.x)
    maxY = Math.max(maxY, wall.a.y, wall.b.y)
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0 }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

function pointInAreaPoly(point: Point2D, poly: ReadonlyArray<Point2D>): boolean {
  if (poly.length < 3) return false
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-15) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function areaHitCount(areas: ReadonlyArray<FloorArea> | undefined, point: Point2D): number {
  if (!areas || areas.length === 0) return 0
  let count = 0
  for (const area of areas) {
    if (area.poly.length >= 3 && pointInAreaPoly(point, area.poly)) count += 1
  }
  return count
}

/**
 * Wereld-teken op de dwars-as naar de ruimte: −1 = −X/−Y, +1 = +X/+Y.
 * Eerst area-probes op de te balanceren muur (en anker); anders plan-centroid.
 * Plus/minus van Floorplanner volgt daarna via leftNormal(a→b) per muur.
 */
function interiorWorldCrossSign(
  probeWalls: ReadonlyArray<Wall>,
  allWalls: ReadonlyArray<Wall>,
  areas: ReadonlyArray<FloorArea> | undefined,
): number {
  for (const wall of probeWalls) {
    const vertical = wallIsVertical(wall)
    const cl = axisValueOfWall(wall)
    const mid = {
      x: (wall.a.x + wall.b.x) / 2,
      y: (wall.a.y + wall.b.y) / 2,
    }
    // Voorbij de dikste face + marge (area-rand ligt vaak op de buitenface).
    const probe = Math.max(wall.thickness * 0.5 + 8, 30)
    const minusPt = vertical ? { x: cl - probe, y: mid.y } : { x: mid.x, y: cl - probe }
    const plusPt = vertical ? { x: cl + probe, y: mid.y } : { x: mid.x, y: cl + probe }
    const hitsMinus = areaHitCount(areas, minusPt)
    const hitsPlus = areaHitCount(areas, plusPt)
    if (hitsMinus !== hitsPlus) {
      return hitsPlus > hitsMinus ? 1 : -1
    }
  }

  const anchor = probeWalls[0]
  if (!anchor) return -1
  const vertical = wallIsVertical(anchor)
  const cl = axisValueOfWall(anchor)
  const centroid = planCentroid(allWalls)
  const cross = vertical ? centroid.x : centroid.y
  const delta = cross - cl
  if (Math.abs(delta) < 1e-6) return -1
  return delta > 0 ? 1 : -1
}

/** Face van anker aan de ruimtekant (wereld), met a→b van het anker. */
function interiorFlushCross(anchor: Wall, interiorWorldSign: number): number {
  const vertical = wallIsVertical(anchor)
  const c = crossAxisComponent(floorplannerLeftNormal(wallDirectionUnit(anchor)), vertical)
  const side: FlushSide = interiorWorldSign * c >= 0 ? 'plus' : 'minus'
  return faceCrossCoord(anchor, side, anchor.balance ?? BALANCE_DEFAULT)
}

/**
 * True als connect keep-axis mag (jog of extensie met kleine dwars-offset).
 * Ctrl-pad roept dit niet aan (snapDisabled).
 */
export function isFlushOnlyJunctionConnect(
  walls: ReadonlyArray<Wall>,
  source: JunctionNode,
  target: JunctionNode,
): boolean {
  if (source.id === target.id) return false
  const pair = pickFlushPair(walls, source, target)
  if (!pair) return false
  // Bestaande schuine muur: geen auto-flush (diagonaal mag).
  if (!isNearAxisAligned(pair.wallS) || !isNearAxisAligned(pair.wallT)) return false
  if (isChamferStub(pair)) return false

  // Alleen de dwars-offset telt — along mag groot zijn (verlengen naar host).
  if (pair.acrossCm > maxAcrossCm(pair)) return false

  // Parallel: offset moet balance-baar zijn (≤ Δt/2). Ortho: as-landing vangt de offset.
  if (pair.parallel) {
    const deltaT = Math.abs(pair.wallS.thickness - pair.wallT.thickness)
    if (clOffsetCm(pair) > deltaT * 0.5 + OFFSET_SLACK_CM) return false
  }

  return true
}

/**
 * Landing op as van de vastgehouden (source) muur: snijpunt met host of projectie van T.
 */
export function flushConnectLanding(
  walls: ReadonlyArray<Wall>,
  source: JunctionNode,
  target: JunctionNode,
): Point2D | null {
  const pair = pickFlushPair(walls, source, target)
  if (!pair) return null

  const dirS = wallDirectionUnit(pair.wallS)
  const originS = { x: source.x, y: source.y }

  if (pair.ortho) {
    const dirT = wallDirectionUnit(pair.wallT)
    const hit = lineIntersection(originS, dirS, { x: target.x, y: target.y }, dirT)
    if (hit) return hit
    return projectPointOnAxis(target, originS, dirS)
  }

  return projectPointOnAxis(target, originS, dirS)
}

function findJunctionByRefs(
  junctions: JunctionNode[],
  refs: JunctionNode['refs'],
): JunctionNode | null {
  const id = stableJunctionId(refs)
  return junctions.find((junction) => junction.id === id) ?? null
}

function findJunctionNear(
  junctions: JunctionNode[],
  point: Point2D,
  epsCm = 2,
): JunctionNode | null {
  let best: JunctionNode | null = null
  let bestDist = epsCm
  for (const junction of junctions) {
    const dist = distance(point, junction)
    if (dist <= bestDist) {
      best = junction
      bestDist = dist
    }
  }
  return best
}

/**
 * Balance op het kortste collineaire segment (dikte ≠ anker).
 * Anker (langste) blijft; flush-face = ruimtekant (areas, anders centroid);
 * plus/minus via a→b van de muur die we tweaken.
 */
function applyShortestCollinearBalanceFlush(
  walls: Wall[],
  landing: Point2D,
  involvedIds: ReadonlySet<string>,
  areas?: ReadonlyArray<FloorArea>,
): Wall[] {
  const nearLanding = walls.filter(
    (wall) =>
      distance(wall.a, landing) <= 2 || distance(wall.b, landing) <= 2 || involvedIds.has(wall.id),
  )
  if (nearLanding.length < 2) return walls

  const parent = nearLanding.map((_, index) => index)
  const find = (index: number): number => {
    let root = index
    while (parent[root] !== root) root = parent[root]
    let current = index
    while (current !== root) {
      const next = parent[current]
      parent[current] = root
      current = next
    }
    return root
  }
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  for (let i = 0; i < nearLanding.length; i += 1) {
    for (let j = i + 1; j < nearLanding.length; j += 1) {
      // Collinear = parallel én op dezelfde as (niet alleen zelfde richting).
      if (!areParallelWalls(nearLanding[i], nearLanding[j])) continue
      if (Math.abs(axisValueOfWall(nearLanding[i]) - axisValueOfWall(nearLanding[j])) > 1) {
        continue
      }
      union(i, j)
    }
  }

  const groups = new Map<number, Wall[]>()
  for (let i = 0; i < nearLanding.length; i += 1) {
    const root = find(i)
    const bucket = groups.get(root) ?? []
    bucket.push(nearLanding[i])
    groups.set(root, bucket)
  }

  let next = walls
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const thicknesses = group.map((wall) => wall.thickness)
    const minT = Math.min(...thicknesses)
    const maxT = Math.max(...thicknesses)
    if (Math.abs(maxT - minT) <= 0.05) continue

    // Anker = langste hartlijn (blijft balance); bij gelijke lengte de dunnere (0.5).
    let anchor = group[0]
    for (const wall of group) {
      const aLen = wallLengthCm(anchor)
      const wLen = wallLengthCm(wall)
      if (
        wLen > aLen + 0.01 ||
        (Math.abs(wLen - aLen) <= 0.01 && wall.thickness < anchor.thickness)
      ) {
        anchor = wall
      }
    }

    // Kortste met andere dikte → balance naar anker-binnenface.
    let shortest: Wall | null = null
    for (const wall of group) {
      if (wall.id === anchor.id) continue
      if (Math.abs(wall.thickness - anchor.thickness) <= 0.05) continue
      if (!shortest || wallLengthCm(wall) < wallLengthCm(shortest)) shortest = wall
    }
    if (!shortest) continue

    // Ruimtekant: eerst de te balanceren muur, dan anker (areas); anders centroid.
    const interiorSign = interiorWorldCrossSign([shortest, anchor], walls, areas)
    const flushCross = interiorFlushCross(anchor, interiorSign)
    const deltaT = Math.abs(shortest.thickness - anchor.thickness)
    const balance = balanceForWorldFlushFace(shortest, flushCross, deltaT * 0.5, interiorSign)
    next = setWallsBalance(next, [shortest.id], balance)
  }
  return next
}

/**
 * Keep-axis connect (alleen junction-drag merge):
 * 1. Landing op as van de vastgehouden (source) muur
 * 2. Doel-hoek: parallelle muren **geheel** mee verschuiven (geen stub / geen diagonaal);
 *    orthogonale einden alleen op de junction
 * 3. Source-eind naar dezelfde landing
 * 4. Balance op kortste collineaire dikte-wissel, binnenkant-voorkeur
 */
export function connectJunctionsKeepAxis(
  walls: Wall[],
  source: JunctionNode,
  target: JunctionNode,
  areas?: ReadonlyArray<FloorArea>,
): Wall[] {
  const pair = pickFlushPair(walls, source, target)
  const landing = flushConnectLanding(walls, source, target)
  if (!pair || !landing) return walls

  const delta = { x: landing.x - target.x, y: landing.y - target.y }
  const involved = new Set(source.refs.map((ref) => ref.wallId))
  for (const ref of target.refs) involved.add(ref.wallId)

  const next = cloneWalls(walls)
  const parallelIds = new Set<string>()
  const farEndsBefore: Point2D[] = []

  // Doel-junction: parallel aan held-as → hele segment; anders alleen junction-eind.
  for (const ref of target.refs) {
    const wall = next.find((item) => item.id === ref.wallId)
    if (!wall) continue
    if (areParallelWalls(wall, pair.wallS)) {
      parallelIds.add(wall.id)
      const other = ref.end === 'a' ? wall.b : wall.a
      farEndsBefore.push({ x: other.x, y: other.y })
    } else {
      const centers = wall.openings.map((opening) => openingWorldCenter(wall, opening.t))
      wall[ref.end] = { x: landing.x, y: landing.y }
      wall.openings = reprojectWallOpenings(wall, centers)
    }
  }

  for (const id of parallelIds) {
    const wall = next.find((item) => item.id === id)
    if (!wall) continue
    const centers = wall.openings.map((opening) => openingWorldCenter(wall, opening.t))
    wall.a = { x: wall.a.x + delta.x, y: wall.a.y + delta.y }
    wall.b = { x: wall.b.x + delta.x, y: wall.b.y + delta.y }
    wall.openings = reprojectWallOpenings(wall, centers)
  }

  // Ver-eind van verschoven parallelle muren: orthogonale einden daar ook mee.
  for (const far of farEndsBefore) {
    for (const wall of next) {
      if (parallelIds.has(wall.id)) continue
      for (const end of ['a', 'b'] as const) {
        if (distance(wall[end], far) > 2) continue
        const centers = wall.openings.map((opening) => openingWorldCenter(wall, opening.t))
        wall[end] = { x: wall[end].x + delta.x, y: wall[end].y + delta.y }
        wall.openings = reprojectWallOpenings(wall, centers)
      }
    }
  }

  let result = pruneCollapsedWalls(next)

  // Source-eind naar landing (verlengen / aankoppelen).
  const afterShift = buildJunctions(result)
  const sourceNow =
    findJunctionByRefs(afterShift, source.refs) ??
    findJunctionNear(afterShift, { x: source.x, y: source.y }, 30)
  if (sourceNow && distance(sourceNow, landing) > LANDING_EPS_CM) {
    result = moveJunctionWithWallJoins(result, sourceNow, landing)
  }

  result = applyShortestCollinearBalanceFlush(result, landing, involved, areas)
  return result
}

/**
 * Effectieve afstand voor merge-hit: bij flush-only de afstand tot de as-landing.
 */
export function flushAwareMergeDistance(
  walls: ReadonlyArray<Wall>,
  source: JunctionNode,
  target: JunctionNode,
  position: Point2D,
): number | null {
  if (!isFlushOnlyJunctionConnect(walls, source, target)) return null
  const landing = flushConnectLanding(walls, source, target)
  if (!landing) return null
  return Math.min(distance(position, target), distance(position, landing))
}

/**
 * Keep-axis wanneer flush-only; anders klassieke junction-merge naar T.xy.
 */
export function mergeJunctionsAware(
  walls: Wall[],
  source: JunctionNode,
  target: JunctionNode,
  areas?: ReadonlyArray<FloorArea>,
): Wall[] {
  if (source.id === target.id) return walls
  if (isFlushOnlyJunctionConnect(walls, source, target)) {
    return connectJunctionsKeepAxis(walls, source, target, areas)
  }
  return mergeJunctions(walls, source, target)
}

/**
 * Zoek merge-doel; bij flush-only telt nabijheid tot as-landing óf tot T
 * (binnen junction-snap, zodat extensie vanaf ~15 cm ook commit).
 */
export function findMergeTargetFlushAware(
  junctions: JunctionNode[],
  sourceRefs: JunctionNode['refs'],
  position: Point2D,
  walls: ReadonlyArray<Wall>,
  mergeRadiusCm = 3,
  sourcePosition?: Point2D,
): JunctionNode | null {
  const sourceId = stableJunctionId(sourceRefs)
  const sourceNode: JunctionNode = {
    id: sourceId,
    refs: sourceRefs,
    x: sourcePosition?.x ?? position.x,
    y: sourcePosition?.y ?? position.y,
  }

  let best: JunctionNode | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const junction of junctions) {
    if (junction.id === sourceId) continue

    if (isFlushOnlyJunctionConnect(walls, sourceNode, junction)) {
      const landing = flushConnectLanding(walls, sourceNode, junction)
      if (!landing) continue
      const distLanding = distance(position, landing)
      const distT = distance(position, junction)
      // Na snap: op landing. Zonder snap maar dicht bij T: toch keep-axis commit.
      const hit = Math.min(distLanding, distT)
      const radius = Math.max(mergeRadiusCm, JUNCTION_POINT_SNAP_CM)
      if (hit <= radius && hit < bestDist) {
        best = junction
        bestDist = hit
      }
      continue
    }

    const dist = distance(position, junction)
    if (dist <= mergeRadiusCm && dist < bestDist) {
      best = junction
      bestDist = dist
    }
  }
  return best
}

/** Snap-punt: bij flush-only de as-landing i.p.v. T.xy. */
export function snapPointToJunctionsFlushAware(
  junctions: ReadonlyArray<JunctionNode>,
  point: Point2D,
  maxDistCm: number,
  walls: ReadonlyArray<Wall>,
  source: JunctionNode,
): Point2D {
  let bestPoint: Point2D = point
  let bestDist = maxDistCm
  for (const junction of junctions) {
    if (junction.id === source.id) continue
    // Beoordeel flush t.o.v. originele bronpositie (as), niet de pointer.
    if (isFlushOnlyJunctionConnect(walls, source, junction)) {
      const landing = flushConnectLanding(walls, source, junction)
      if (!landing) continue
      const dist = Math.min(distance(point, junction), distance(point, landing))
      if (dist <= bestDist) {
        bestDist = dist
        bestPoint = landing
      }
      continue
    }
    const dist = distance(point, junction)
    if (dist <= bestDist) {
      bestDist = dist
      bestPoint = { x: junction.x, y: junction.y }
    }
  }
  return bestPoint
}
