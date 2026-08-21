/**
 * Viewer-only auto-maatlijnen (niet `dimensions[]`).
 *
 * Per windstreek: volle objectspan, ticks van de areas op die gevelband,
 * restmaten voor gaten (muurdikte / strook zonder area). Interior = gevelgerichte
 * polygonrand op het buitenste gevelvlak (niet AABB, niet elke west-gerichte
 * inkeping). Clipper-kinks < muurdikte verdwijnen.
 */
import { wallFaces } from './fml-wall-geom'
import type { FloorArea, Point2D, Wall } from './types'
import type { DimensionMode } from './fml-dimension-settings'

export type AutoDimensionLine = { a: Point2D; b: Point2D }

/** Eerste ketting buiten de buitencontour (cm). */
export const AUTO_DIM_CHAIN_OFFSET_CM = 50
/** Totaalmaat verder naar buiten (cm). */
export const AUTO_DIM_OUTER_EXTRA_CM = 25
/** Ticks dichterbij dan dit mergen (clipper-stof). */
export const AUTO_DIM_TICK_MERGE_CM = 1
/** Kortste gevelrand die nog een tick mag geven (cm); 1 cm kink / 5 cm inkeping vallen af. */
export const AUTO_DIM_MIN_FACE_EDGE_CM = 8
/** Slack t.o.v. het buitenste gevelvlak (schuine gevel blijft één cluster). */
const FACADE_PLANE_SLACK_CM = 100
/** Kleiner = clipper-stof; echte muurdikte-rest blijft via min(wall.thickness). */
export const AUTO_DIM_MIN_SEGMENT_CM = 2
/** Min overlap langs de kettingas om mee te dingen voor de gevelband. */
export const AUTO_DIM_BAND_OVERLAP_MIN_CM = 8
/** Slack t.o.v. de envelope-extreme van overlappende areas. */
export const AUTO_DIM_BAND_SLACK_CM = 4
/** Exterior: groepeer gevelvlakken op deze rastermaat. */
const FACADE_PLANE_QUANT_CM = 5
/** Exterior: einden nabij area-union → buiten-AABB. */
const EXTERIOR_SNAP_CM = 40

export type AutoDimSide = 'W' | 'E' | 'N' | 'S'

type Aabb = { minX: number; minY: number; maxX: number; maxY: number }

type AreaBox = { aabb: Aabb; poly: Point2D[] }

/** Rand telt als gevelzijde als outward · as ≥ dit (~70°). */
const FACE_DOT_MIN = 0.35

function polyAabb(poly: Point2D[] | undefined): Aabb | null {
  if (!poly || poly.length < 3) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of poly) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  if (!Number.isFinite(minX) || maxX - minX < 1e-6 || maxY - minY < 1e-6) return null
  return { minX, minY, maxX, maxY }
}

function unionAabb(boxes: Aabb[]): Aabb | null {
  if (boxes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of boxes) {
    if (b.minX < minX) minX = b.minX
    if (b.minY < minY) minY = b.minY
    if (b.maxX > maxX) maxX = b.maxX
    if (b.maxY > maxY) maxY = b.maxY
  }
  return { minX, minY, maxX, maxY }
}

/** Buitencontour-AABB via muurfaces (geen wall-union / silhouet-vertices). */
export function wallOuterAabb(walls: Wall[]): Aabb | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let any = false
  for (const wall of walls) {
    if (!Number.isFinite(wall.thickness) || wall.thickness <= 0) continue
    const { left, right } = wallFaces(wall)
    for (const p of [left.a, left.b, right.a, right.b]) {
      any = true
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  if (!any) return null
  return { minX, minY, maxX, maxY }
}

function chainSpan(aabb: Aabb, side: AutoDimSide): { lo: number; hi: number } {
  if (side === 'W' || side === 'E') return { lo: aabb.minY, hi: aabb.maxY }
  return { lo: aabb.minX, hi: aabb.maxX }
}

function bandExtreme(aabb: Aabb, side: AutoDimSide): number {
  if (side === 'W') return aabb.minX
  if (side === 'E') return aabb.maxX
  if (side === 'N') return aabb.minY
  return aabb.maxY
}

function overlapAlongChain(a: Aabb, b: Aabb, side: AutoDimSide): number {
  const aSpan = chainSpan(a, side)
  const bSpan = chainSpan(b, side)
  return Math.min(aSpan.hi, bSpan.hi) - Math.max(aSpan.lo, bSpan.lo)
}

/** Area ligt op de gevelband: extreme langs de band-as wint t.o.v. Y/X-overlappende areas. */
export function isAreaOnFacadeBand(area: Aabb, all: Aabb[], side: AutoDimSide): boolean {
  const self = bandExtreme(area, side)
  let envelope = self
  for (const other of all) {
    if (other === area) continue
    if (overlapAlongChain(area, other, side) < AUTO_DIM_BAND_OVERLAP_MIN_CM) continue
    const ext = bandExtreme(other, side)
    envelope = side === 'W' || side === 'N' ? Math.min(envelope, ext) : Math.max(envelope, ext)
  }
  if (side === 'W' || side === 'N') return self <= envelope + AUTO_DIM_BAND_SLACK_CM
  return self >= envelope - AUTO_DIM_BAND_SLACK_CM
}

function uniqueSorted(values: number[], mergeCm: number): number[] {
  const sorted = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (sorted.length === 0) return []
  const out = [sorted[0]]
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - out[out.length - 1] > mergeCm) out.push(sorted[i])
  }
  return out
}

function facadePlaneKey(aabb: Aabb, side: AutoDimSide): number {
  return Math.round(bandExtreme(aabb, side) / FACADE_PLANE_QUANT_CM) * FACADE_PLANE_QUANT_CM
}

function signedRingArea(poly: Point2D[]): number {
  let area = 0
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}

function outwardNormal(a: Point2D, b: Point2D, ccw: boolean): { x: number; y: number } | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null
  const lx = -dy / len
  const ly = dx / len
  return ccw ? { x: -lx, y: -ly } : { x: lx, y: ly }
}

function sideOutwardAxis(side: AutoDimSide): { x: number; y: number } {
  if (side === 'W') return { x: -1, y: 0 }
  if (side === 'E') return { x: 1, y: 0 }
  if (side === 'N') return { x: 0, y: -1 }
  return { x: 0, y: 1 }
}

function chainCoord(point: Point2D, side: AutoDimSide): number {
  return side === 'W' || side === 'E' ? point.y : point.x
}

function bandCoord(point: Point2D, side: AutoDimSide): number {
  return side === 'W' || side === 'E' ? point.x : point.y
}

/**
 * Eén interval per area op deze gevel: lange randen op het buitenste vlak.
 * Pakt niet de 5 cm west-inkeping aan de oostkant, noch 1 cm clipper-kinks.
 */
function areaFacadeSpan(poly: Point2D[], side: AutoDimSide): { lo: number; hi: number } | null {
  if (poly.length < 3) return null
  const ccw = signedRingArea(poly) > 0
  const axis = sideOutwardAxis(side)
  type Seg = { a: Point2D; b: Point2D; midBand: number; lo: number; hi: number }
  const faces: Seg[] = []
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < AUTO_DIM_MIN_FACE_EDGE_CM) continue
    const n = outwardNormal(a, b, ccw)
    if (!n) continue
    if (n.x * axis.x + n.y * axis.y < FACE_DOT_MIN) continue
    const ca = chainCoord(a, side)
    const cb = chainCoord(b, side)
    faces.push({
      a,
      b,
      midBand: bandCoord({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, side),
      lo: Math.min(ca, cb),
      hi: Math.max(ca, cb),
    })
  }
  if (faces.length === 0) return null
  const plane =
    side === 'W' || side === 'N'
      ? Math.min(...faces.map((f) => f.midBand))
      : Math.max(...faces.map((f) => f.midBand))
  let lo = Infinity
  let hi = -Infinity
  for (const face of faces) {
    if (Math.abs(face.midBand - plane) > FACADE_PLANE_SLACK_CM) continue
    if (face.lo < lo) lo = face.lo
    if (face.hi > hi) hi = face.hi
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 1e-6) return null
  return { lo, hi }
}

function areaChainTicks(box: AreaBox, side: AutoDimSide): number[] {
  const span = areaFacadeSpan(box.poly, side) ?? chainSpan(box.aabb, side)
  return [span.lo, span.hi]
}

function minWallThicknessCm(walls: Wall[]): number {
  let min = Infinity
  for (const wall of walls) {
    if (Number.isFinite(wall.thickness) && wall.thickness > 0 && wall.thickness < min) {
      min = wall.thickness
    }
  }
  return Number.isFinite(min) ? min : 10
}

function ticksForSide(
  side: AutoDimSide,
  band: AreaBox[],
  inner: Aabb,
  outer: Aabb,
  mode: DimensionMode,
  minSegmentCm: number,
): number[] {
  const innerSpan = chainSpan(inner, side)
  const outerSpan = chainSpan(outer, side)
  // Interior: geen globale AABB-span — die koppelt L/R (zelfde minY/maxY).
  const ticks: number[] = mode === 'exterior' ? [outerSpan.lo, outerSpan.hi] : []

  if (mode === 'interior') {
    for (const box of band) ticks.push(...areaChainTicks(box, side))
  } else {
    const groups = new Map<number, AreaBox[]>()
    for (const box of band) {
      const key = facadePlaneKey(box.aabb, side)
      const list = groups.get(key)
      if (list) list.push(box)
      else groups.set(key, [box])
    }
    for (const members of groups.values()) {
      const face = members.flatMap((member) => areaChainTicks(member, side))
      let lo = Infinity
      let hi = -Infinity
      for (const t of face) {
        if (t < lo) lo = t
        if (t > hi) hi = t
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue
      if (lo <= innerSpan.lo + EXTERIOR_SNAP_CM) lo = outerSpan.lo
      if (hi >= innerSpan.hi - EXTERIOR_SNAP_CM) hi = outerSpan.hi
      ticks.push(lo, hi)
    }
  }

  return uniqueSorted(ticks, Math.max(AUTO_DIM_TICK_MERGE_CM, minSegmentCm - 0.05))
}

function placeChain(
  side: AutoDimSide,
  ticks: number[],
  outer: Aabb,
  offsetCm: number,
  minSegmentCm: number,
): AutoDimensionLine[] {
  const lines: AutoDimensionLine[] = []
  const minSeg = Math.max(AUTO_DIM_MIN_SEGMENT_CM, minSegmentCm)
  for (let i = 0; i < ticks.length - 1; i += 1) {
    const lo = ticks[i]
    const hi = ticks[i + 1]
    if (hi - lo < minSeg) continue
    if (side === 'W') {
      const x = outer.minX - offsetCm
      lines.push({ a: { x, y: lo }, b: { x, y: hi } })
    } else if (side === 'E') {
      const x = outer.maxX + offsetCm
      lines.push({ a: { x, y: lo }, b: { x, y: hi } })
    } else if (side === 'N') {
      const y = outer.minY - offsetCm
      lines.push({ a: { x: lo, y }, b: { x: hi, y } })
    } else {
      const y = outer.maxY + offsetCm
      lines.push({ a: { x: lo, y }, b: { x: hi, y } })
    }
  }
  return lines
}

function placeTotal(
  inner: Aabb,
  outer: Aabb,
  mode: DimensionMode,
  offsetCm: number,
): AutoDimensionLine[] {
  const span = mode === 'interior' ? inner : outer
  const y = outer.minY - offsetCm
  const x = outer.minX - offsetCm
  const lines: AutoDimensionLine[] = []
  if (span.maxX - span.minX >= AUTO_DIM_MIN_SEGMENT_CM) {
    lines.push({ a: { x: span.minX, y }, b: { x: span.maxX, y } })
  }
  if (span.maxY - span.minY >= AUTO_DIM_MIN_SEGMENT_CM) {
    lines.push({ a: { x, y: span.minY }, b: { x, y: span.maxY } })
  }
  return lines
}

export function buildAutoDimensionLines(
  walls: Wall[],
  areas: FloorArea[] | undefined,
  options: {
    dimensionMode: DimensionMode
    generateOuterDimension: boolean
  },
): AutoDimensionLine[] {
  if (walls.length === 0) return []
  const outer = wallOuterAabb(walls)
  if (!outer) return []

  const boxes: AreaBox[] = []
  for (const area of areas ?? []) {
    const aabb = polyAabb(area.poly)
    if (!aabb) continue
    boxes.push({ aabb, poly: area.poly })
  }
  if (boxes.length === 0) return []
  const aabbs = boxes.map((b) => b.aabb)
  const inner = unionAabb(aabbs)
  if (!inner) return []

  const minSeg = minWallThicknessCm(walls)
  const mode = options.dimensionMode === 'exterior' ? 'exterior' : 'interior'
  const sides: AutoDimSide[] = ['W', 'E', 'N', 'S']
  const lines: AutoDimensionLine[] = []
  for (const side of sides) {
    const band = boxes.filter((box) => isAreaOnFacadeBand(box.aabb, aabbs, side))
    if (band.length === 0) continue
    const ticks = ticksForSide(side, band, inner, outer, mode, minSeg)
    lines.push(...placeChain(side, ticks, outer, AUTO_DIM_CHAIN_OFFSET_CM, minSeg))
  }

  if (options.generateOuterDimension) {
    lines.push(
      ...placeTotal(inner, outer, mode, AUTO_DIM_CHAIN_OFFSET_CM + AUTO_DIM_OUTER_EXTRA_CM),
    )
  }
  return lines
}
