/**
 * Stempel-ownership (ronde 2): ná inject, vóór harmonize.
 * Stempelset = 1-op-1 donor-cm én donor-dikte (3D). Detectie-kopieën in corridor weg;
 * detectie snapt/weldt op de stempel — de stempel beweegt niet.
 *
 * @see .cursor/docs/stamp-detectie-dubbele-muren.md §13–§15
 */
import { buildMirrored, resolveHingeAtStart, resolveSwingSign } from './door-swing-symbol'
import { wallDirectionUnit, wallLengthCm } from './fml-wall-geom'
import { isStampOwnedWall } from './stamp-owned'
import { splitWallEndpointExtras } from './wall-endpoint-height'
import type { Opening, Point2D, Wall } from './types'

/** Plaatsfout-slack (cm) — tekenaar handmatig; niet globaal in sanitize. */
export const STAMP_OWN_SLACK_CM = 8

/** Bijna-parallel (graden). */
export const STAMP_OWN_PARALLEL_DEG = 6

/** Reststuk korter dan dit verdwijnt. */
export const STAMP_OWN_MIN_KEEP_CM = 20

/**
 * Alleen donor-bladen (spouw) begrenzen elkaars corridor.
 * As-afstand ≤ dit = collineair gevelstuk → geen min().
 */
export const STAMP_OWN_LEAF_GAP_FLOOR_CM = 5

/**
 * L/T-aansluiting: detectie → stempel.
 * Ruimer dan sanitize weld (0,25) — plaatsfout paar cm.
 */
export const STAMP_OWN_JUNCTION_EPS_CM = 3

/**
 * Victim met overlap-fractie ≥ dit t.o.v. eigen lengte = L10-dubbel van stempel → drop geheel.
 */
export const STAMP_OWN_FULL_DROP_OVERLAP = 0.5

const SPAN_SLACK_CM = 0.05
const MIN_DIR_CM = 1e-9
const COORD_EPS_CM = 1e-9

export type ResolveStampOwnershipResult = {
  walls: Wall[]
  trimmedCount: number
  droppedCount: number
  snappedCount: number
  openingsMoved: number
}

function cloneOpening(opening: Opening): Opening {
  return {
    ...opening,
    mirrored: opening.mirrored
      ? ([opening.mirrored[0], opening.mirrored[1]] as [number, number])
      : undefined,
    extras: opening.extras ? { ...opening.extras } : undefined,
  }
}

function cloneWall(wall: Wall): Wall {
  return {
    ...wall,
    a: { ...wall.a },
    b: { ...wall.b },
    c: wall.c ? { ...wall.c } : wall.c,
    openings: wall.openings.map(cloneOpening),
    extras: wall.extras ? { ...wall.extras } : undefined,
  }
}

function shortGuid(): string {
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')
}

function openingWorldCenter(wall: Pick<Wall, 'a' | 'b'>, t: number): Point2D {
  return {
    x: wall.a.x + t * (wall.b.x - wall.a.x),
    y: wall.a.y + t * (wall.b.y - wall.a.y),
  }
}

function projectT(wall: Pick<Wall, 'a' | 'b'>, point: Point2D): number {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len2 = dx * dx + dy * dy
  if (len2 <= 1e-12) return 0
  const t = ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / len2
  return Math.max(0, Math.min(1, t))
}

function alongFromA(wall: Pick<Wall, 'a' | 'b'>, point: Point2D): number {
  const dir = wallDirectionUnit(wall)
  return (point.x - wall.a.x) * dir.x + (point.y - wall.a.y) * dir.y
}

function pointOnAxis(wall: Pick<Wall, 'a' | 'b'>, alongCm: number): Point2D {
  const dir = wallDirectionUnit(wall)
  return {
    x: wall.a.x + dir.x * alongCm,
    y: wall.a.y + dir.y * alongCm,
  }
}

function angleDegBetween(a: Pick<Wall, 'a' | 'b'>, b: Pick<Wall, 'a' | 'b'>): number {
  const ua = wallDirectionUnit(a)
  const ub = wallDirectionUnit(b)
  const dot = Math.abs(ua.x * ub.x + ua.y * ub.y)
  const clamped = Math.min(1, Math.max(0, dot))
  return (Math.acos(clamped) * 180) / Math.PI
}

function nearlyParallel(a: Pick<Wall, 'a' | 'b'>, b: Pick<Wall, 'a' | 'b'>): boolean {
  return angleDegBetween(a, b) <= STAMP_OWN_PARALLEL_DEG
}

function directionsOppose(a: Pick<Wall, 'a' | 'b'>, b: Pick<Wall, 'a' | 'b'>): boolean {
  const ua = wallDirectionUnit(a)
  const ub = wallDirectionUnit(b)
  return ua.x * ub.x + ua.y * ub.y < 0
}

function distToAxis(wall: Pick<Wall, 'a' | 'b'>, point: Point2D): number {
  const dir = wallDirectionUnit(wall)
  const vx = point.x - wall.a.x
  const vy = point.y - wall.a.y
  return Math.abs(vx * dir.y - vy * dir.x)
}

function projectedSpanOn(
  host: Pick<Wall, 'a' | 'b'>,
  other: Pick<Wall, 'a' | 'b'>,
): { lo: number; hi: number } {
  const s0 = alongFromA(host, other.a)
  const s1 = alongFromA(host, other.b)
  return { lo: Math.min(s0, s1), hi: Math.max(s0, s1) }
}

function ownSpan(wall: Pick<Wall, 'a' | 'b'>): { lo: number; hi: number } {
  return { lo: 0, hi: wallLengthCm(wall) }
}

function spansOverlap(
  a: { lo: number; hi: number },
  b: { lo: number; hi: number },
  slack = SPAN_SLACK_CM,
): boolean {
  return a.lo <= b.hi + slack && b.lo <= a.hi + slack
}

function subtractInterval(
  base: { lo: number; hi: number },
  cut: { lo: number; hi: number },
): Array<{ lo: number; hi: number }> {
  if (!spansOverlap(base, cut, 0)) return [{ ...base }]
  const lo = Math.max(base.lo, cut.lo)
  const hi = Math.min(base.hi, cut.hi)
  const out: Array<{ lo: number; hi: number }> = []
  if (lo > base.lo + SPAN_SLACK_CM) out.push({ lo: base.lo, hi: lo })
  if (hi < base.hi - SPAN_SLACK_CM) out.push({ lo: hi, hi: base.hi })
  return out
}

function intervalLength(span: { lo: number; hi: number }): number {
  return Math.max(0, span.hi - span.lo)
}

/** Lengte van base ∩ cut (union van cuts). */
function overlapLength(
  base: { lo: number; hi: number },
  cuts: Array<{ lo: number; hi: number }>,
): number {
  let total = 0
  for (const cut of cuts) {
    const lo = Math.max(base.lo, cut.lo)
    const hi = Math.min(base.hi, cut.hi)
    if (hi > lo) total += hi - lo
  }
  return total
}

function axisDistance(a: Pick<Wall, 'a' | 'b'>, b: Pick<Wall, 'a' | 'b'>): number {
  const midA = { x: (a.a.x + a.b.x) / 2, y: (a.a.y + a.b.y) / 2 }
  const midB = { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 }
  return (distToAxis(b, midA) + distToAxis(a, midB)) / 2
}

function corridorHalfWidth(stamp: Wall, stamps: readonly Wall[]): number {
  let half = stamp.thickness / 2 + STAMP_OWN_SLACK_CM
  const own = ownSpan(stamp)
  for (const other of stamps) {
    if (other.id === stamp.id) continue
    if (!nearlyParallel(stamp, other)) continue
    const gap = axisDistance(stamp, other)
    if (gap <= STAMP_OWN_LEAF_GAP_FLOOR_CM) continue
    const otherSpan = projectedSpanOn(stamp, other)
    if (!spansOverlap(own, otherSpan, stamp.thickness)) continue
    half = Math.min(half, gap / 2)
  }
  return Math.max(0, half)
}

type StampMeta = { wall: Wall; halfWidth: number }

function stampsCoveringParallel(victim: Wall, stamps: readonly StampMeta[]): StampMeta[] {
  const vSpan = ownSpan(victim)
  const mid = { x: (victim.a.x + victim.b.x) / 2, y: (victim.a.y + victim.b.y) / 2 }
  const out: StampMeta[] = []
  for (const stamp of stamps) {
    if (!nearlyParallel(victim, stamp.wall)) continue
    const dist = distToAxis(stamp.wall, mid)
    if (dist > stamp.halfWidth + COORD_EPS_CM) continue
    const stampOnVictim = projectedSpanOn(victim, stamp.wall)
    if (!spansOverlap(vSpan, stampOnVictim)) continue
    out.push(stamp)
  }
  out.sort((a, b) => distToAxis(a.wall, mid) - distToAxis(b.wall, mid))
  return out
}

/**
 * Opening van bron naar host; flip mirrored bij tegengestelde a→b.
 * `t` uit wereld-projectie.
 */
export function transferOpeningToStampWall(opening: Opening, from: Wall, to: Wall): Opening {
  const center = openingWorldCenter(from, opening.t)
  const next = cloneOpening(opening)
  next.t = projectT(to, center)
  if (!directionsOppose(from, to)) return next

  const hingeAtStart = resolveHingeAtStart(opening.mirrored)
  const swingRight = resolveSwingSign(opening.mirrored) === 1
  next.mirrored = buildMirrored(!hingeAtStart, !swingRight)
  return next
}

function findStampHostForOpening(center: Point2D, stamps: readonly StampMeta[]): StampMeta | null {
  let best: StampMeta | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const stamp of stamps) {
    const t = projectT(stamp.wall, center)
    const on = openingWorldCenter(stamp.wall, t)
    const along = alongFromA(stamp.wall, center)
    const span = ownSpan(stamp.wall)
    if (along < span.lo - SPAN_SLACK_CM || along > span.hi + SPAN_SLACK_CM) continue
    const dist = Math.hypot(center.x - on.x, center.y - on.y)
    if (dist < bestDist) {
      bestDist = dist
      best = stamp
    }
  }
  return best
}

function pieceFromAlong(wall: Wall, lo: number, hi: number, thickness?: number): Wall | null {
  if (hi - lo < STAMP_OWN_MIN_KEEP_CM) return null
  const a = pointOnAxis(wall, lo)
  const b = pointOnAxis(wall, hi)
  const len = wallLengthCm(wall)
  const t0 = len > MIN_DIR_CM ? lo / len : 0
  const t1 = len > MIN_DIR_CM ? hi / len : 1
  const centers = wall.openings.map((o) => openingWorldCenter(wall, o.t))
  const openings: Opening[] = []
  for (let i = 0; i < wall.openings.length; i += 1) {
    const along = alongFromA(wall, centers[i])
    if (along < lo - SPAN_SLACK_CM || along > hi + SPAN_SLACK_CM) continue
    openings.push({
      ...cloneOpening(wall.openings[i]),
      t: projectT({ a, b }, centers[i]),
    })
  }
  const midT = (t0 + t1) / 2
  const { firstExtras, secondExtras } = splitWallEndpointExtras(wall, midT)
  const extras =
    firstExtras && secondExtras
      ? { ...firstExtras, bz: secondExtras.bz }
      : wall.extras
        ? { ...wall.extras }
        : undefined
  return {
    ...wall,
    id: `${wall.id}-own-${shortGuid()}`,
    a,
    b,
    thickness: thickness ?? wall.thickness,
    openings,
    extras,
  }
}

function moveAllOpeningsToStamp(
  victim: Wall,
  primary: StampMeta,
  stamps: readonly StampMeta[],
): number {
  let moved = 0
  for (const opening of victim.openings) {
    const center = openingWorldCenter(victim, opening.t)
    const host = findStampHostForOpening(center, stamps) ?? primary
    host.wall.openings.push(transferOpeningToStampWall(opening, victim, host.wall))
    moved += 1
  }
  return moved
}

function trimVictimAgainstStamps(
  victim: Wall,
  covering: readonly StampMeta[],
  stamps: readonly StampMeta[],
): { kept: Wall[]; openingsMoved: number } {
  const base = ownSpan(victim)
  const cuts = covering.map((s) => projectedSpanOn(victim, s.wall))
  const overlap = overlapLength(base, cuts)
  const victimLen = intervalLength(base)
  const primary = covering[0]

  // Meestal dezelfde muur als de stempel → drop geheel (voorkomt e* op verkeerde dikte).
  if (victimLen > MIN_DIR_CM && overlap / victimLen >= STAMP_OWN_FULL_DROP_OVERLAP) {
    return {
      kept: [],
      openingsMoved: moveAllOpeningsToStamp(victim, primary, stamps),
    }
  }

  let remainders = [base]
  for (const cut of cuts) {
    const next: Array<{ lo: number; hi: number }> = []
    for (const rem of remainders) {
      next.push(...subtractInterval(rem, cut))
    }
    remainders = next
  }

  const kept: Wall[] = []
  for (const rem of remainders) {
    // Collineaire voortzetting buiten stempel: stempeldikte (Q-2).
    const piece = pieceFromAlong(victim, rem.lo, rem.hi, primary.wall.thickness)
    if (!piece) continue
    if (remainders.length === 1 && rem.lo <= SPAN_SLACK_CM && rem.hi >= base.hi - SPAN_SLACK_CM) {
      piece.id = victim.id
    }
    kept.push(piece)
  }

  let openingsMoved = 0
  for (const opening of victim.openings) {
    const center = openingWorldCenter(victim, opening.t)
    const along = alongFromA(victim, center)
    const stayed = kept.some((p) => {
      const lo = alongFromA(victim, p.a)
      const hi = alongFromA(victim, p.b)
      const a = Math.min(lo, hi)
      const b = Math.max(lo, hi)
      return along >= a - SPAN_SLACK_CM && along <= b + SPAN_SLACK_CM
    })
    if (stayed) continue
    const host = findStampHostForOpening(center, stamps) ?? primary
    host.wall.openings.push(transferOpeningToStampWall(opening, victim, host.wall))
    openingsMoved += 1
  }

  return { kept, openingsMoved }
}

/** Detectie-eindpunt → snijpunt met stempelhartlijn. Stempel beweegt niet. */
function snapWallToStamps(wall: Wall, stamps: readonly StampMeta[]): boolean {
  const prevA = { ...wall.a }
  const prevB = { ...wall.b }
  const centers = wall.openings.map((o) => openingWorldCenter({ a: prevA, b: prevB }, o.t))

  let snapped = false
  for (const end of ['a', 'b'] as const) {
    const point = end === 'a' ? prevA : prevB
    let best: { hit: Point2D; dist: number } | null = null
    for (const stamp of stamps) {
      if (nearlyParallel({ a: prevA, b: prevB }, stamp.wall)) continue
      const dist = distToAxis(stamp.wall, point)
      const reach = Math.max(stamp.halfWidth, STAMP_OWN_JUNCTION_EPS_CM)
      if (dist > reach + COORD_EPS_CM) continue
      const along = alongFromA(stamp.wall, point)
      const span = ownSpan(stamp.wall)
      if (along < span.lo - reach || along > span.hi + reach) continue
      const hit = lineIntersection(prevA, prevB, stamp.wall.a, stamp.wall.b)
      if (!hit) continue
      const hitAlong = alongFromA(stamp.wall, hit)
      if (hitAlong < span.lo - reach || hitAlong > span.hi + reach) continue
      if (!best || dist < best.dist) best = { hit, dist }
    }
    if (best) {
      wall[end] = { ...best.hit }
      snapped = true
    }
  }

  if (snapped && wall.openings.length > 0) {
    wall.openings = wall.openings.map((opening, i) => ({
      ...opening,
      t: projectT(wall, centers[i]),
    }))
  }
  return snapped
}

/**
 * Weld ≤ JUNCTION_EPS: alleen non-stamp endpoints naar stamp-punt.
 * Stamp a/b blijven ongewijzigd (3D).
 */
function weldDetectionOntoStampEndpoints(walls: Wall[]): number {
  const eps = STAMP_OWN_JUNCTION_EPS_CM
  type Ep = { wallIndex: number; end: 'a' | 'b'; x: number; y: number; stamp: boolean }
  const endpoints: Ep[] = []
  for (let i = 0; i < walls.length; i += 1) {
    const w = walls[i]
    const stamp = isStampOwnedWall(w)
    endpoints.push({ wallIndex: i, end: 'a', x: w.a.x, y: w.a.y, stamp })
    endpoints.push({ wallIndex: i, end: 'b', x: w.b.x, y: w.b.y, stamp })
  }

  let welded = 0
  for (let i = 0; i < endpoints.length; i += 1) {
    const stampEp = endpoints[i]
    if (!stampEp.stamp) continue
    const target = { x: stampEp.x, y: stampEp.y }
    for (let j = 0; j < endpoints.length; j += 1) {
      if (i === j) continue
      const other = endpoints[j]
      if (other.stamp) continue
      if (other.wallIndex === stampEp.wallIndex) continue
      const d = Math.hypot(other.x - target.x, other.y - target.y)
      if (d > eps) continue
      const wall = walls[other.wallIndex]
      const prev = wall[other.end]
      if (
        Math.abs(prev.x - target.x) <= COORD_EPS_CM &&
        Math.abs(prev.y - target.y) <= COORD_EPS_CM
      ) {
        continue
      }
      wall[other.end] = { ...target }
      other.x = target.x
      other.y = target.y
      welded += 1
    }
  }
  return welded
}

function lineIntersection(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): Point2D | null {
  const dax = a2.x - a1.x
  const day = a2.y - a1.y
  const dbx = b2.x - b1.x
  const dby = b2.y - b1.y
  const denom = dax * dby - day * dbx
  if (Math.abs(denom) < 1e-12) return null
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom
  return { x: a1.x + t * dax, y: a1.y + t * day }
}

/** Herstel donor a/b/thickness na passes — stampOwned mag niet verschuiven/herschalen. */
function freezeStampGeometry(
  walls: Wall[],
  frozen: ReadonlyMap<string, { a: Point2D; b: Point2D; thickness: number }>,
): void {
  for (const wall of walls) {
    if (!isStampOwnedWall(wall)) continue
    const src = frozen.get(wall.id)
    if (!src) continue
    wall.a = { ...src.a }
    wall.b = { ...src.b }
    wall.thickness = src.thickness
  }
}

/**
 * Resolve detectie↔stempel overlap in FML-cm.
 * stampOwned geometrie+dikte blijven donor; openings kunnen op stamp landen.
 */
export function resolveStampOwnership(walls: readonly Wall[]): ResolveStampOwnershipResult {
  const cloned = walls.map(cloneWall)
  const stampWalls = cloned.filter(isStampOwnedWall)
  if (stampWalls.length === 0) {
    return {
      walls: cloned,
      trimmedCount: 0,
      droppedCount: 0,
      snappedCount: 0,
      openingsMoved: 0,
    }
  }

  const frozen = new Map(
    stampWalls.map((w) => [w.id, { a: { ...w.a }, b: { ...w.b }, thickness: w.thickness }]),
  )

  const stamps: StampMeta[] = stampWalls.map((wall) => ({
    wall,
    halfWidth: corridorHalfWidth(wall, stampWalls),
  }))

  const others = cloned.filter((w) => !isStampOwnedWall(w))
  const nextOthers: Wall[] = []
  let trimmedCount = 0
  let droppedCount = 0
  let openingsMoved = 0

  for (const victim of others) {
    const covering = stampsCoveringParallel(victim, stamps)
    if (covering.length === 0) {
      nextOthers.push(victim)
      continue
    }
    const { kept, openingsMoved: moved } = trimVictimAgainstStamps(victim, covering, stamps)
    openingsMoved += moved
    if (kept.length === 0) {
      droppedCount += 1
    } else if (
      kept.length !== 1 ||
      wallLengthCm(kept[0]) + SPAN_SLACK_CM < wallLengthCm(victim) ||
      Math.abs(kept[0].thickness - victim.thickness) > COORD_EPS_CM
    ) {
      trimmedCount += 1
      nextOthers.push(...kept)
    } else {
      nextOthers.push(...kept)
    }
  }

  let snappedCount = 0
  for (const wall of nextOthers) {
    if (snapWallToStamps(wall, stamps)) snappedCount += 1
  }

  const stampIds = new Set(stampWalls.map((w) => w.id))
  const result: Wall[] = []
  for (const wall of cloned) {
    if (stampIds.has(wall.id)) result.push(wall)
  }
  result.push(...nextOthers)

  const filtered = result.filter((w) => wallLengthCm(w) > SPAN_SLACK_CM)
  weldDetectionOntoStampEndpoints(filtered)
  freezeStampGeometry(filtered, frozen)

  return {
    walls: filtered,
    trimmedCount,
    droppedCount,
    snappedCount,
    openingsMoved,
  }
}

/** Plan-helper: ownership op floor 0 (workspace generate). */
export function resolveStampOwnershipOnFloor(
  plan: { floors: Array<{ walls: Wall[] }> },
  floorIndex = 0,
): typeof plan & { floors: Array<{ walls: Wall[] }> } {
  const floor = plan.floors[floorIndex]
  if (!floor) return plan
  const resolved = resolveStampOwnership(floor.walls)
  return {
    ...plan,
    floors: plan.floors.map((f, i) => (i === floorIndex ? { ...f, walls: resolved.walls } : f)),
  }
}
