import type { FloorArea, Point2D, Wall } from './types'
import { wallFaces, wallLeftNormal } from './plan-wall-geom'
import { pointInPoly } from './vertex-hit'

const EPS = 1e-9
const PROBE_CM = 2
const PARALLEL_DOT_MIN = 0.98
/** Absolute ondergrens overlap langs de muur-as (cm). */
const EDGE_OVERLAP_MIN_CM = 1
/**
 * Sterke overlap = minstens dit deel van ons segment (anders koof/stub).
 * Geen sterke kandidaat → fallback op grootste overlap.
 */
const STRONG_OVERLAP_FRAC = 0.35
/** Minimale tegenface-lengte bij knoop-span (cm); korter = koof. */
const POINT_FACE_MIN_CM = 80

export type RoomInteriorPick = {
  /** Binnenmaat face -> tegenoverliggende rand (cm). */
  interiorCm: number
  /** Unit richting de gekozen kamer in (vanaf de muur). */
  intoUnit: Point2D
  /** Start van de maatlijn (mid overlap met tegenface); anders face-mid. */
  spanOrigin?: Point2D
}

type ThickWall = Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>
type AreaPoly = Pick<FloorArea, 'poly'>

type ParallelHit = {
  distCm: number
  overlapCm: number
  edgeLenCm: number
  /** Mid van de overlap langs wallAxis, als punt op de herkomst-face. */
  spanOrigin: Point2D
}

function normalize(v: Point2D): Point2D | null {
  const len = Math.hypot(v.x, v.y)
  if (len < EPS) return null
  return { x: v.x / len, y: v.y / len }
}

function mid(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function faceAlongAxis(face: { a: Point2D; b: Point2D }, axis: Point2D): { lo: number; hi: number } {
  const pa = face.a.x * axis.x + face.a.y * axis.y
  const pb = face.b.x * axis.x + face.b.y * axis.y
  return { lo: Math.min(pa, pb), hi: Math.max(pa, pb) }
}

function overlapLenCm(
  a: { lo: number; hi: number },
  b: { lo: number; hi: number },
): number {
  return Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo)
}

function strongOverlapMinCm(wallSpan: { lo: number; hi: number }): number {
  const wallLen = Math.max(0, wallSpan.hi - wallSpan.lo)
  return Math.max(EDGE_OVERLAP_MIN_CM, wallLen * STRONG_OVERLAP_FRAC)
}

/** Sterke overlap eerst (geen koof); daarna dichtstbij; bij gelijk: langste rand. */
function pickBestParallelHit(hits: ParallelHit[], wallSpan: { lo: number; hi: number }): ParallelHit | null {
  if (hits.length === 0) return null
  const strongMin = strongOverlapMinCm(wallSpan)
  const strong = hits.filter((h) => h.overlapCm + EPS >= strongMin)
  const pool = strong.length > 0 ? strong : hits
  let best: ParallelHit | null = null
  for (const hit of pool) {
    if (!best) {
      best = hit
      continue
    }
    if (hit.distCm + EPS < best.distCm) {
      best = hit
      continue
    }
    if (Math.abs(hit.distCm - best.distCm) <= EPS) {
      if (hit.overlapCm > best.overlapCm + EPS) {
        best = hit
        continue
      }
      if (Math.abs(hit.overlapCm - best.overlapCm) <= EPS && hit.edgeLenCm > best.edgeLenCm) {
        best = hit
      }
    }
  }
  return best
}

function spanOriginOnFace(
  faceMid: Point2D,
  wallAxis: Point2D,
  wallSpan: { lo: number; hi: number },
  overlapLo: number,
  overlapHi: number,
): Point2D {
  const faceMidAlong = (wallSpan.lo + wallSpan.hi) / 2
  const overlapMid = (overlapLo + overlapHi) / 2
  const d = overlapMid - faceMidAlong
  return {
    x: faceMid.x + wallAxis.x * d,
    y: faceMid.y + wallAxis.y * d,
  }
}

/**
 * Evenwijdige poly-randen aan intoUnit-zijde; kiest de grootste overlap
 * met ons segment (geen korte koof).
 */
function bestParallelEdgeHit(
  poly: ReadonlyArray<Point2D>,
  origin: Point2D,
  intoUnit: Point2D,
  wallAxis: Point2D,
  wallSpan: { lo: number; hi: number },
  faceMid: Point2D,
): ParallelHit | null {
  const hits: ParallelHit[] = []
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) continue
    const ex = b.x - a.x
    const ey = b.y - a.y
    const elen = Math.hypot(ex, ey)
    if (elen < EPS) continue
    const eu = { x: ex / elen, y: ey / elen }
    // Evenwijdig aan muur = loodrecht op intoUnit.
    if (Math.abs(eu.x * intoUnit.x + eu.y * intoUnit.y) > 1 - PARALLEL_DOT_MIN) continue
    if (Math.abs(eu.x * wallAxis.x + eu.y * wallAxis.y) < PARALLEL_DOT_MIN) continue

    const edgeSpan = faceAlongAxis({ a, b }, wallAxis)
    const overlap = overlapLenCm(wallSpan, edgeSpan)
    if (overlap < EDGE_OVERLAP_MIN_CM) continue

    const nx = -eu.y
    const ny = eu.x
    const denom = intoUnit.x * nx + intoUnit.y * ny
    if (Math.abs(denom) < EPS) continue
    const s = ((a.x - origin.x) * nx + (a.y - origin.y) * ny) / denom
    if (s <= PROBE_CM * 0.25) continue

    const overlapLo = Math.max(wallSpan.lo, edgeSpan.lo)
    const overlapHi = Math.min(wallSpan.hi, edgeSpan.hi)
    hits.push({
      distCm: s,
      overlapCm: overlap,
      edgeLenCm: elen,
      spanOrigin: spanOriginOnFace(faceMid, wallAxis, wallSpan, overlapLo, overlapHi),
    })
  }
  return pickBestParallelHit(hits, wallSpan)
}

function pickAreaAt(areas: ReadonlyArray<AreaPoly>, point: Point2D): AreaPoly | null {
  for (const area of areas) {
    if (area.poly.length >= 3 && pointInPoly(point, area.poly)) return area
  }
  return null
}

function interiorFromArea(
  wall: ThickWall,
  area: AreaPoly,
  intoUnit: Point2D,
): ParallelHit | null {
  const n = wallLeftNormal(wall)
  const faces = wallFaces(wall)
  const useLeft = intoUnit.x * n.x + intoUnit.y * n.y >= 0
  const face = useLeft ? faces.left : faces.right
  const faceMid = mid(face.a, face.b)
  const axis = normalize({ x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y })
  if (!axis) return null
  const wallSpan = faceAlongAxis(face, axis)
  return bestParallelEdgeHit(area.poly, faceMid, intoUnit, axis, wallSpan, faceMid)
}

function interiorFromOppositeWall(
  wall: ThickWall,
  walls: ReadonlyArray<ThickWall>,
  intoUnit: Point2D,
): ParallelHit | null {
  const n = wallLeftNormal(wall)
  const faces = wallFaces(wall)
  const useLeft = intoUnit.x * n.x + intoUnit.y * n.y >= 0
  const face = useLeft ? faces.left : faces.right
  const faceMid = mid(face.a, face.b)
  const axis = normalize({ x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y })
  if (!axis) return null
  const wallSpan = faceAlongAxis(face, axis)

  const hits: ParallelHit[] = []
  for (const other of walls) {
    if (other === wall) continue
    const oAxis = normalize({ x: other.b.x - other.a.x, y: other.b.y - other.a.y })
    if (!oAxis) continue
    if (Math.abs(oAxis.x * axis.x + oAxis.y * axis.y) < PARALLEL_DOT_MIN) continue
    const oFaces = wallFaces(other)
    for (const cand of [oFaces.left, oFaces.right]) {
      const cMid = mid(cand.a, cand.b)
      const along = (cMid.x - faceMid.x) * intoUnit.x + (cMid.y - faceMid.y) * intoUnit.y
      if (along <= PROBE_CM * 0.25) continue
      const span = faceAlongAxis(cand, axis)
      const overlap = overlapLenCm(wallSpan, span)
      if (overlap < EDGE_OVERLAP_MIN_CM) continue
      const edgeLen = Math.hypot(cand.b.x - cand.a.x, cand.b.y - cand.a.y)
      const overlapLo = Math.max(wallSpan.lo, span.lo)
      const overlapHi = Math.min(wallSpan.hi, span.hi)
      hits.push({
        distCm: along,
        overlapCm: overlap,
        edgeLenCm: edgeLen,
        spanOrigin: spanOriginOnFace(faceMid, axis, wallSpan, overlapLo, overlapHi),
      })
    }
  }
  return pickBestParallelHit(hits, wallSpan)
}

/**
 * Binnenmaat aan de zijde van intoDir (hover). Geen kamer daar -> andere zijde.
 * Geen enkele kamer -> optioneel evenwijdige tegenmuur; anders null (oude delta).
 * Tegenface = grootste overlap met ons segment (niet korte koof).
 */
export function pickRoomInteriorCm(
  wall: ThickWall,
  areas: ReadonlyArray<AreaPoly>,
  intoDir: Point2D,
  walls: ReadonlyArray<ThickWall> = [],
): RoomInteriorPick | null {
  const primary = normalize(intoDir)
  if (!primary) return null
  const n = wallLeftNormal(wall)
  const side = primary.x * n.x + primary.y * n.y >= 0 ? 1 : -1
  const intoUnit = { x: n.x * side, y: n.y * side }
  const otherUnit = { x: -intoUnit.x, y: -intoUnit.y }

  const faces = wallFaces(wall)
  const face = side >= 0 ? faces.left : faces.right
  const origin = mid(face.a, face.b)
  const probe = {
    x: origin.x + intoUnit.x * PROBE_CM,
    y: origin.y + intoUnit.y * PROBE_CM,
  }

  let area = pickAreaAt(areas, probe)
  let used = intoUnit
  if (!area) {
    const otherFace = side >= 0 ? faces.right : faces.left
    const otherOrigin = mid(otherFace.a, otherFace.b)
    const otherProbe = {
      x: otherOrigin.x + otherUnit.x * PROBE_CM,
      y: otherOrigin.y + otherUnit.y * PROBE_CM,
    }
    area = pickAreaAt(areas, otherProbe)
    if (area) used = otherUnit
  }

  if (area) {
    const hit = interiorFromArea(wall, area, used)
    if (hit != null && hit.distCm > EPS) {
      return { interiorCm: hit.distCm, intoUnit: used, spanOrigin: hit.spanOrigin }
    }
  }

  for (const dir of [intoUnit, otherUnit]) {
    const hit = interiorFromOppositeWall(wall, walls, dir)
    if (hit != null && hit.distCm > EPS) {
      return { interiorCm: hit.distCm, intoUnit: dir, spanOrigin: hit.spanOrigin }
    }
  }
  return null
}

/**
 * Slide-delta langs slideDir zodat de binnenmaat aan intoUnit-zijde typedI wordt.
 * As-slide = binnenmaat 1:1 (dikte/balance blijven).
 */
export function wallSlideDeltaForInterior(
  currentI: number,
  typedI: number,
  intoUnit: Point2D,
  slideDir: Point2D,
): number {
  const slide = normalize(slideDir)
  if (!slide) return 0
  const align = intoUnit.x * slide.x + intoUnit.y * slide.y
  return align * (currentI - typedI)
}

/** Dominante H/V-unit uit hover (as-lock voor knoop-precise). */
export function axisLockUnit(dir: Point2D): Point2D | null {
  if (Math.abs(dir.x) < EPS && Math.abs(dir.y) < EPS) return null
  if (Math.abs(dir.x) >= Math.abs(dir.y)) {
    return { x: dir.x >= 0 ? 1 : -1, y: 0 }
  }
  return { x: 0, y: dir.y >= 0 ? 1 : -1 }
}

/** Hover vastzetten op H of V vanaf origin (zelfde als muur-precise). */
export function axisLockPoint(origin: Point2D, hover: Point2D): Point2D {
  const dx = hover.x - origin.x
  const dy = hover.y - origin.y
  if (Math.abs(dx) >= Math.abs(dy)) return { x: hover.x, y: origin.y }
  return { x: origin.x, y: hover.y }
}

function bestEdgeAlongUnit(
  poly: ReadonlyArray<Point2D>,
  origin: Point2D,
  intoUnit: Point2D,
): ParallelHit | null {
  const cross = { x: -intoUnit.y, y: intoUnit.x }
  // Band rond het knooppunt: genoeg voor overlap-score, niet oneindig breed.
  const band = 200
  const along = origin.x * cross.x + origin.y * cross.y
  const wallSpan = { lo: along - band, hi: along + band }
  return bestParallelEdgeHit(poly, origin, intoUnit, cross, wallSpan, origin)
}

function interiorFromPointWalls(
  origin: Point2D,
  walls: ReadonlyArray<ThickWall>,
  intoUnit: Point2D,
): ParallelHit | null {
  const hits: ParallelHit[] = []
  const cross = { x: -intoUnit.y, y: intoUnit.x }
  const along0 = origin.x * cross.x + origin.y * cross.y
  const wallSpan = { lo: along0 - 200, hi: along0 + 200 }
  const touchCm = 8

  for (const wall of walls) {
    // Eigen knoop-muren overslaan (hun face is geen tegenwand).
    const touchesEnd =
      Math.hypot(wall.a.x - origin.x, wall.a.y - origin.y) <= touchCm ||
      Math.hypot(wall.b.x - origin.x, wall.b.y - origin.y) <= touchCm
    const ax = wall.b.x - wall.a.x
    const ay = wall.b.y - wall.a.y
    const len2 = ax * ax + ay * ay
    let onSegment = false
    if (len2 > EPS) {
      const t = ((origin.x - wall.a.x) * ax + (origin.y - wall.a.y) * ay) / len2
      if (t >= -0.02 && t <= 1.02) {
        const px = wall.a.x + t * ax
        const py = wall.a.y + t * ay
        onSegment = Math.hypot(px - origin.x, py - origin.y) <= touchCm
      }
    }
    if (touchesEnd || onSegment) continue

    const faces = wallFaces(wall)
    for (const face of [faces.left, faces.right]) {
      const m = mid(face.a, face.b)
      const along = (m.x - origin.x) * intoUnit.x + (m.y - origin.y) * intoUnit.y
      if (along <= PROBE_CM * 0.25) continue
      const axis = normalize({ x: face.b.x - face.a.x, y: face.b.y - face.a.y })
      if (!axis) continue
      // Face ≈ loodrecht op intoUnit.
      if (Math.abs(axis.x * intoUnit.x + axis.y * intoUnit.y) > 1 - PARALLEL_DOT_MIN) continue
      const edgeLen = Math.hypot(face.b.x - face.a.x, face.b.y - face.a.y)
      if (edgeLen < POINT_FACE_MIN_CM) continue
      const span = faceAlongAxis(face, cross)
      const overlap = overlapLenCm(wallSpan, span)
      if (overlap < EDGE_OVERLAP_MIN_CM) continue
      hits.push({
        distCm: along,
        overlapCm: Math.max(overlap, edgeLen),
        edgeLenCm: edgeLen,
        spanOrigin: origin,
      })
    }
  }
  return pickBestParallelHit(hits, wallSpan)
}

/**
 * Span vanaf een knoop langs as-locked intoDir de kamer in (of tegenface).
 * Eerst muren (≥80 cm), dan area-rand; grootste overlap/lengte wint (geen koof).
 */
export function pickPointInteriorCm(
  origin: Point2D,
  areas: ReadonlyArray<AreaPoly>,
  intoDir: Point2D,
  walls: ReadonlyArray<ThickWall> = [],
): RoomInteriorPick | null {
  const intoUnit = axisLockUnit(intoDir)
  if (!intoUnit) return null
  const otherUnit = { x: -intoUnit.x, y: -intoUnit.y }

  function tryDir(dir: Point2D): ParallelHit | null {
    const fromWall = interiorFromPointWalls(origin, walls, dir)
    if (fromWall != null && fromWall.distCm > EPS) return fromWall
    const probe = {
      x: origin.x + dir.x * PROBE_CM,
      y: origin.y + dir.y * PROBE_CM,
    }
    const area = pickAreaAt(areas, probe)
    if (area) {
      const hit = bestEdgeAlongUnit(area.poly, origin, dir)
      if (hit != null && hit.distCm > EPS && hit.edgeLenCm >= POINT_FACE_MIN_CM) return hit
    }
    return null
  }

  let hit = tryDir(intoUnit)
  let used = intoUnit
  if (!hit) {
    hit = tryDir(otherUnit)
    used = otherUnit
  }
  if (!hit || hit.distCm <= EPS) return null
  return { interiorCm: hit.distCm, intoUnit: used, spanOrigin: hit.spanOrigin }
}

/** Verplaatsing van het punt zodat de span langs intoUnit typedI wordt. */
export function pointDeltaForInterior(
  currentI: number,
  typedI: number,
  intoUnit: Point2D,
): Point2D {
  const d = currentI - typedI
  return { x: intoUnit.x * d, y: intoUnit.y * d }
}

/** Span face → kamer in (voor typveld + maatlijn). */
export function roomSpanFromWall(
  wall: ThickWall,
  intoUnit: Point2D,
  lengthCm: number,
  spanOrigin?: Point2D,
): { a: Point2D; b: Point2D } | null {
  if (!(lengthCm > EPS)) return null
  const n = wallLeftNormal(wall)
  const faces = wallFaces(wall)
  const useLeft = intoUnit.x * n.x + intoUnit.y * n.y >= 0
  const face = useLeft ? faces.left : faces.right
  const origin = spanOrigin ?? mid(face.a, face.b)
  return {
    a: origin,
    b: {
      x: origin.x + intoUnit.x * lengthCm,
      y: origin.y + intoUnit.y * lengthCm,
    },
  }
}

/** Span vanaf een knoop langs intoUnit. */
export function roomSpanFromPoint(
  origin: Point2D,
  intoUnit: Point2D,
  lengthCm: number,
): { a: Point2D; b: Point2D } | null {
  if (!(lengthCm > EPS)) return null
  return {
    a: { ...origin },
    b: {
      x: origin.x + intoUnit.x * lengthCm,
      y: origin.y + intoUnit.y * lengthCm,
    },
  }
}
