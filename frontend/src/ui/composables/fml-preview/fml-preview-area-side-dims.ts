import type { FloorArea, Point2D } from '@/core/fml/types'
import { formatMeasureDistanceCm } from './fml-preview-measure'

/** Zijden korter dan dit (cm) krijgen geen maat. */
export const AREA_SIDE_DIM_MIN_CM = 50

/** Label iets naar binnen t.o.v. de rand (cm). */
export const AREA_SIDE_DIM_INSET_CM = 8

/** Max hoek tussen opeenvolgende stukken om als één zijde te mergen. */
export const AREA_SIDE_COLLINEAR_MAX_DEG = 2

/**
 * Max loodrechte afstand (cm) om twee faces als dezelfde lijn te zien
 * (dikte/balance-trap, geen andere wand).
 */
export const AREA_SIDE_LINE_OFFSET_MAX_CM = 8

/**
 * Max loodrechte connector (cm) tussen twee faces op die lijn (clipper-kink).
 */
export const AREA_SIDE_JOG_MAX_CM = 20

/**
 * Max gat langs de lijn (cm) om T-inkeping / muurdikte-notch tot één zijde te
 * mergen. Grotere openingen (L/U-vleugel) blijven los.
 */
export const AREA_SIDE_NOTCH_GAP_MAX_CM = 40

const QUANTIZE_CM = 1
const MIN_EDGE_CM = 1e-6

type Side = { a: Point2D; b: Point2D }

export interface AreaSideDim {
  id: string
  a: Point2D
  b: Point2D
  mid: Point2D
  lengthCm: number
  label: string
}

export interface RenderAreaSideDim {
  id: string
  x: number
  y: number
  label: string
  lengthStage: number
}

function signedRingArea(ring: Point2D[]): number {
  let area = 0
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    area += a.x * b.y - a.y * b.x
  }
  return area / 2
}

function unit(dx: number, dy: number): { x: number; y: number; len: number } {
  const len = Math.hypot(dx, dy)
  if (len < MIN_EDGE_CM) return { x: 0, y: 0, len: 0 }
  return { x: dx / len, y: dy / len, len }
}

function sameHeading(
  a: { x: number; y: number },
  b: { x: number; y: number },
  maxDeg: number,
): boolean {
  const cross = a.x * b.y - a.y * b.x
  const dot = a.x * b.x + a.y * b.y
  const deg = (Math.atan2(cross, dot) * 180) / Math.PI
  return Math.abs(deg) <= maxDeg
}

function rawEdges(poly: Point2D[]): Side[] {
  const out: Side[] = []
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_EDGE_CM) continue
    out.push({ a, b })
  }
  return out
}

function sideUnit(side: Side): { x: number; y: number; len: number } {
  return unit(side.b.x - side.a.x, side.b.y - side.a.y)
}

/** Signed afstand van de lijn t.o.v. oorsprong (zelfde heading → vergelijkbaar). */
function lineOffset(side: Side): number {
  const u = sideUnit(side)
  if (u.len < MIN_EDGE_CM) return 0
  return side.a.x * -u.y + side.a.y * u.x
}

function sameDirectedLine(a: Side, b: Side, maxOffsetCm: number): boolean {
  const u = sideUnit(a)
  const v = sideUnit(b)
  if (u.len < MIN_EDGE_CM || v.len < MIN_EDGE_CM) return false
  if (!sameHeading(u, v, AREA_SIDE_COLLINEAR_MAX_DEG)) return false
  return Math.abs(lineOffset(a) - lineOffset(b)) <= maxOffsetCm
}

function isRoughlyPerpendicular(a: Side, b: Side): boolean {
  const u = sideUnit(a)
  const v = sideUnit(b)
  if (u.len < MIN_EDGE_CM || v.len < MIN_EDGE_CM) return false
  return Math.abs(u.x * v.x + u.y * v.y) <= 0.35
}

function projectT(side: Side, p: Point2D, u: { x: number; y: number }): number {
  return (p.x - side.a.x) * u.x + (p.y - side.a.y) * u.y
}

function spanOf(pieces: Side[]): Side {
  const longest = pieces.reduce((best, side) => {
    const len = sideUnit(side).len
    return len > sideUnit(best).len ? side : best
  }, pieces[0])
  const u = sideUnit(longest)
  let minT = Infinity
  let maxT = -Infinity
  let minP = longest.a
  let maxP = longest.b
  for (const side of pieces) {
    for (const p of [side.a, side.b]) {
      const t = projectT(longest, p, u)
      if (t < minT) {
        minT = t
        minP = p
      }
      if (t > maxT) {
        maxT = t
        maxP = p
      }
    }
  }
  return { a: { x: minP.x, y: minP.y }, b: { x: maxP.x, y: maxP.y } }
}

function intervalGap(a: Side, b: Side): number {
  const u = sideUnit(a)
  if (u.len < MIN_EDGE_CM) return Infinity
  const a0 = projectT(a, a.a, u)
  const a1 = projectT(a, a.b, u)
  const b0 = projectT(a, b.a, u)
  const b1 = projectT(a, b.b, u)
  const aMin = Math.min(a0, a1)
  const aMax = Math.max(a0, a1)
  const bMin = Math.min(b0, b1)
  const bMax = Math.max(b0, b1)
  if (aMax < bMin) return bMin - aMax
  if (bMax < aMin) return aMin - bMax
  return 0
}

function mergeConsecutiveCollinear(raw: Side[]): Side[] {
  if (raw.length === 0) return []
  const merged: Side[] = []
  let cur = { a: raw[0].a, b: raw[0].b }
  for (let i = 1; i < raw.length; i += 1) {
    const next = raw[i]
    const u = sideUnit(cur)
    const v = sideUnit(next)
    if (u.len > 0 && v.len > 0 && sameHeading(u, v, AREA_SIDE_COLLINEAR_MAX_DEG)) {
      cur = { a: cur.a, b: next.b }
    } else {
      merged.push(cur)
      cur = { a: next.a, b: next.b }
    }
  }
  if (merged.length === 0) {
    merged.push(cur)
    return merged
  }
  const first = merged[0]
  const u = sideUnit(cur)
  const v = sideUnit(first)
  if (u.len > 0 && v.len > 0 && sameHeading(u, v, AREA_SIDE_COLLINEAR_MAX_DEG)) {
    merged[0] = { a: cur.a, b: first.b }
  } else {
    merged.push(cur)
  }
  return merged
}

/** …lang, kort⊥, lang… → één zijde (clipper-kink / dikte-trap). */
function absorbMicroJogs(sides: Side[]): Side[] {
  let list = sides
  let changed = true
  while (changed) {
    changed = false
    const n = list.length
    if (n < 3) break
    for (let i = 0; i < n; i += 1) {
      const prev = list[i]
      const mid = list[(i + 1) % n]
      const next = list[(i + 2) % n]
      const midLen = sideUnit(mid).len
      const prevLen = sideUnit(prev).len
      const nextLen = sideUnit(next).len
      if (midLen > AREA_SIDE_JOG_MAX_CM || midLen < MIN_EDGE_CM) continue
      if (prevLen <= AREA_SIDE_JOG_MAX_CM || nextLen <= AREA_SIDE_JOG_MAX_CM) continue
      if (!sameDirectedLine(prev, next, AREA_SIDE_LINE_OFFSET_MAX_CM)) continue
      if (!isRoughlyPerpendicular(prev, mid)) continue
      const spanned = spanOf([prev, next])
      const out: Side[] = [spanned]
      for (let k = 3; k < n; k += 1) {
        out.push(list[(i + k) % n])
      }
      list = out
      changed = true
      break
    }
  }
  return list
}

/** Zelfde lijn + klein gat (T-inkeping / muurdikte) → één zijde. */
function mergeSameLineSmallGaps(sides: Side[]): Side[] {
  if (sides.length < 2) return sides
  const used = new Array<boolean>(sides.length).fill(false)
  const out: Side[] = []
  for (let i = 0; i < sides.length; i += 1) {
    if (used[i]) continue
    const group = [sides[i]]
    used[i] = true
    let grew = true
    while (grew) {
      grew = false
      for (let j = 0; j < sides.length; j += 1) {
        if (used[j]) continue
        const cand = sides[j]
        const hits = group.some(
          (member) =>
            sameDirectedLine(member, cand, AREA_SIDE_LINE_OFFSET_MAX_CM) &&
            intervalGap(member, cand) <= AREA_SIDE_NOTCH_GAP_MAX_CM,
        )
        if (!hits) continue
        group.push(cand)
        used[j] = true
        grew = true
      }
    }
    out.push(group.length === 1 ? group[0] : spanOf(group))
  }
  return out
}

/** Merge opeenvolgende collineaire stukken, plus micro-jog / T-inkeping. */
export function mergeCollinearSides(poly: Point2D[]): Side[] {
  const raw = rawEdges(poly)
  if (raw.length === 0) return []
  return mergeSameLineSmallGaps(absorbMicroJogs(mergeConsecutiveCollinear(raw)))
}

function inwardMid(a: Point2D, b: Point2D, ccw: boolean, insetCm: number): Point2D {
  const u = unit(b.x - a.x, b.y - a.y)
  if (u.len < MIN_EDGE_CM) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
  const nx = ccw ? -u.y : u.y
  const ny = ccw ? u.x : -u.x
  return {
    x: (a.x + b.x) / 2 + nx * insetCm,
    y: (a.y + b.y) / 2 + ny * insetCm,
  }
}

function edgeKey(a: Point2D, b: Point2D): string {
  const qa = `${Math.round(a.x / QUANTIZE_CM)}:${Math.round(a.y / QUANTIZE_CM)}`
  const qb = `${Math.round(b.x / QUANTIZE_CM)}:${Math.round(b.y / QUANTIZE_CM)}`
  return qa < qb ? `${qa}|${qb}` : `${qb}|${qa}`
}

/**
 * Maatlabels op het midden van area-zijden ≥ {@link AREA_SIDE_DIM_MIN_CM}.
 * Collinear merge (incl. micro-jog / T-inkeping) + gedeelde wanden (één label).
 */
export function buildAreaSideDims(
  areas: FloorArea[] | undefined,
  options?: { minCm?: number; insetCm?: number },
): AreaSideDim[] {
  const minCm = options?.minCm ?? AREA_SIDE_DIM_MIN_CM
  const insetCm = options?.insetCm ?? AREA_SIDE_DIM_INSET_CM
  const seen = new Set<string>()
  const out: AreaSideDim[] = []
  let seq = 0
  for (const area of areas ?? []) {
    const poly = area.poly
    if (!poly || poly.length < 3) continue
    const ccw = signedRingArea(poly) > 0
    for (const side of mergeCollinearSides(poly)) {
      const lengthCm = Math.hypot(side.b.x - side.a.x, side.b.y - side.a.y)
      if (lengthCm < minCm) continue
      const key = edgeKey(side.a, side.b)
      if (seen.has(key)) continue
      seen.add(key)
      seq += 1
      out.push({
        id: `area-side-${seq}`,
        a: { x: side.a.x, y: side.a.y },
        b: { x: side.b.x, y: side.b.y },
        mid: inwardMid(side.a, side.b, ccw, insetCm),
        lengthCm,
        label: formatMeasureDistanceCm(lengthCm),
      })
    }
  }
  return out
}

export function buildRenderAreaSideDims(
  areas: FloorArea[] | undefined,
  toStagePoint: (x: number, y: number) => Point2D,
): RenderAreaSideDim[] {
  return buildAreaSideDims(areas).map((dim) => {
    const mid = toStagePoint(dim.mid.x, dim.mid.y)
    const a = toStagePoint(dim.a.x, dim.a.y)
    const b = toStagePoint(dim.b.x, dim.b.y)
    return {
      id: dim.id,
      x: mid.x,
      y: mid.y,
      label: dim.label,
      lengthStage: Math.hypot(b.x - a.x, b.y - a.y),
    }
  })
}
