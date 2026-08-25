/**
 * Architect CAD-lijnwerk voor gevel-aanzichten: bronlijnen + hidden-line clip.
 * Occluder = baksteen-fill (evenodd met openingen als gaten) van voorliggende vlakken.
 */
import polygonClipping from 'polygon-clipping'
import type { Point2D } from './types'
import {
  type ElevationOpeningRect,
  type ElevationWallRect,
  type FacadeElevation,
} from './facade-elevation'
import {
  elevationWallFillPoints,
  elevationWallFillRings,
  elevationWallInnerStrokes,
  groupElevationPaintPlanes,
} from './elevation-paint'
import { glyphFromElevationRect } from './elevation-opening-symbol'

export type ElevationLineRole = 'wall' | 'inner' | 'glyph' | 'roof' | 'slab' | 'ridge'

export type ElevationLineStroke = {
  role: ElevationLineRole
  /** Open polyline in aanzicht-cm. */
  points: Point2D[]
  dashed?: boolean
  /** Deurkruk e.d. — zwaardere stroke in de host. */
  heavy?: boolean
}

export type ElevationLinework = {
  strokes: ElevationLineStroke[]
}

const QUANTIZE_CM = 0.01
const MIN_SEG_CM = 0.05
const CIRCLE_STEPS = 32

function quantize(value: number): number {
  return Math.round(value / QUANTIZE_CM) * QUANTIZE_CM
}

function quantizePoint(point: Point2D): Point2D {
  return { x: quantize(point.x), y: quantize(point.y) }
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function lerp(a: Point2D, b: Point2D, t: number): Point2D {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function ringArea(ring: Point2D[]): number {
  let sum = 0
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

function ensureClosedRing(points: Point2D[]): Point2D[] {
  if (points.length === 0) return points
  const first = points[0]
  const last = points[points.length - 1]
  if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) {
    return points.slice(0, -1)
  }
  return points
}

function toClippingRing(points: Point2D[]): [number, number][] {
  const ring = ensureClosedRing(points.map(quantizePoint))
  if (ring.length < 3) return []
  const deduped: Point2D[] = []
  for (const p of ring) {
    const prev = deduped[deduped.length - 1]
    if (prev && prev.x === p.x && prev.y === p.y) continue
    deduped.push(p)
  }
  if (deduped.length >= 2) {
    const first = deduped[0]
    const last = deduped[deduped.length - 1]
    if (first.x === last.x && first.y === last.y) deduped.pop()
  }
  if (deduped.length < 3) return []
  if (Math.abs(ringArea(deduped)) < 1e-6) return []

  const pairs: [number, number][] = deduped.map((p) => [p.x, p.y])
  const first = pairs[0]
  pairs.push([first[0], first[1]])
  if (ringArea(deduped) < 0) {
    const open = pairs.slice(0, -1).reverse()
    return [...open, open[0]]
  }
  return pairs
}

function fromClippingRing(ring: [number, number][]): Point2D[] {
  return ensureClosedRing(ring.map(([x, y]) => ({ x, y })))
}

function resolveUnionFn(): typeof polygonClipping.union {
  const mod = polygonClipping as unknown as {
    union?: typeof polygonClipping.union
    default?: { union?: typeof polygonClipping.union }
  }
  const fn = mod.union ?? mod.default?.union
  if (typeof fn !== 'function') {
    throw new Error('polygon-clipping.union is not available')
  }
  return fn.bind(mod.default ?? mod)
}

/** One wall fill = outer + holes as GeoJSON polygon rings. */
function ringsToGeom(rings: Point2D[][]): [number, number][][] | null {
  const clipped: [number, number][][] = []
  for (const ring of rings) {
    const c = toClippingRing(ring)
    if (c.length >= 4) clipped.push(c)
  }
  return clipped.length > 0 ? clipped : null
}

type OccluderMulti = [number, number][][][]

function unionOccluderGeoms(geoms: [number, number][][][]): OccluderMulti {
  if (geoms.length === 0) return []
  if (geoms.length === 1) return [geoms[0]]
  const union = resolveUnionFn()
  let acc: OccluderMulti = [geoms[0]]
  for (let i = 1; i < geoms.length; i += 1) {
    acc = union(acc, [geoms[i]])
  }
  return acc
}

function occluderFromWalls(
  walls: ElevationWallRect[],
  openings: ElevationOpeningRect[],
  transoms: ElevationOpeningRect[],
): OccluderMulti {
  const geoms: [number, number][][][] = []
  const holes = [...openings, ...transoms]
  for (const wall of walls) {
    if (wall.ridge) {
      const geom = ringsToGeom(elevationWallFillRings(wall, []))
      if (geom) geoms.push(geom)
      continue
    }
    const wallHoles = holes.filter(
      (item) => item.wallId === wall.wallId && item.floorIndex === wall.floorIndex,
    )
    const geom = ringsToGeom(elevationWallFillRings(wall, wallHoles))
    if (geom) geoms.push(geom)
  }
  return unionOccluderGeoms(geoms)
}

function pointInPolygon(point: Point2D, ring: Point2D[]): boolean {
  let inside = false
  const open = ensureClosedRing(ring)
  for (let i = 0, j = open.length - 1; i < open.length; j = i++) {
    const xi = open[i].x
    const yi = open[i].y
    const xj = open[j].x
    const yj = open[j].y
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-15) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Evenodd over alle ringen van één polygon (outer + holes). */
function pointInEvenOddRings(point: Point2D, rings: Point2D[][]): boolean {
  let inside = false
  for (const ring of rings) {
    if (pointInPolygon(point, ring)) inside = !inside
  }
  return inside
}

function pointCoveredByOccluder(point: Point2D, occluder: OccluderMulti): boolean {
  for (const polygon of occluder) {
    const rings = polygon.map((ring) => fromClippingRing(ring))
    if (pointInEvenOddRings(point, rings)) return true
  }
  return false
}

function lineIntersection(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D,
): { tA: number; tB: number } | null {
  const dax = a2.x - a1.x
  const day = a2.y - a1.y
  const dbx = b2.x - b1.x
  const dby = b2.y - b1.y
  const denom = dax * dby - day * dbx
  if (Math.abs(denom) < 1e-12) return null
  const tA = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom
  const tB = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / denom
  return { tA, tB }
}

function ringEdges(ring: Point2D[]): Array<{ a: Point2D; b: Point2D }> {
  const open = ensureClosedRing(ring)
  if (open.length < 2) return []
  const edges: Array<{ a: Point2D; b: Point2D }> = []
  for (let i = 0; i < open.length; i += 1) {
    const a = open[i]
    const b = open[(i + 1) % open.length]
    if (dist(a, b) < MIN_SEG_CM) continue
    edges.push({ a, b })
  }
  return edges
}

/** Clip één segment tegen occluder: behoud stukken waarvan het midden niet bedekt is. */
export function clipSegmentAgainstOccluder(
  a: Point2D,
  b: Point2D,
  occluder: OccluderMulti,
): Point2D[][] {
  if (dist(a, b) < MIN_SEG_CM) return []
  if (occluder.length === 0) return [[a, b]]

  const ts: number[] = [0, 1]
  for (const polygon of occluder) {
    for (const ring of polygon) {
      for (const edge of ringEdges(fromClippingRing(ring))) {
        const hit = lineIntersection(a, b, edge.a, edge.b)
        if (!hit) continue
        if (hit.tA < -1e-9 || hit.tA > 1 + 1e-9) continue
        if (hit.tB < -1e-9 || hit.tB > 1 + 1e-9) continue
        ts.push(Math.max(0, Math.min(1, hit.tA)))
      }
    }
  }
  ts.sort((x, y) => x - y)
  const unique: number[] = []
  for (const t of ts) {
    const prev = unique[unique.length - 1]
    if (prev == null || Math.abs(t - prev) > 1e-9) unique.push(t)
  }

  const pieces: Point2D[][] = []
  for (let i = 0; i < unique.length - 1; i += 1) {
    const t0 = unique[i]
    const t1 = unique[i + 1]
    if (t1 - t0 < 1e-9) continue
    const mid = lerp(a, b, (t0 + t1) / 2)
    if (pointCoveredByOccluder(mid, occluder)) continue
    const p0 = lerp(a, b, t0)
    const p1 = lerp(a, b, t1)
    if (dist(p0, p1) < MIN_SEG_CM) continue
    pieces.push([p0, p1])
  }
  return pieces
}

function pushClippedStroke(
  strokes: ElevationLineStroke[],
  role: ElevationLineRole,
  points: Point2D[],
  occluder: OccluderMulti,
  opts?: { dashed?: boolean; heavy?: boolean; closed?: boolean },
): void {
  if (points.length < 2) return
  const closed = opts?.closed === true
  const open = closed ? ensureClosedRing(points) : points
  if (open.length < 2) return
  const edgeCount = closed ? open.length : open.length - 1
  for (let i = 0; i < edgeCount; i += 1) {
    const a = open[i]
    const b = open[(i + 1) % open.length]
    if (!a || !b) continue
    for (const piece of clipSegmentAgainstOccluder(a, b, occluder)) {
      strokes.push({
        role,
        points: piece,
        dashed: opts?.dashed,
        heavy: opts?.heavy,
      })
    }
  }
}

function flatToPoints(flat: number[]): Point2D[] {
  const out: Point2D[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const x = flat[i]
    const y = flat[i + 1]
    if (x == null || y == null) continue
    out.push({ x, y })
  }
  return out
}

function sampleCircle(cx: number, cy: number, radius: number): Point2D[] {
  const points: Point2D[] = []
  for (let i = 0; i < CIRCLE_STEPS; i += 1) {
    const a = (i / CIRCLE_STEPS) * Math.PI * 2
    points.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius })
  }
  return points
}

function rectOutline(x0: number, y0: number, x1: number, y1: number): Point2D[] {
  const xa = Math.min(x0, x1)
  const xb = Math.max(x0, x1)
  const ya = Math.min(y0, y1)
  const yb = Math.max(y0, y1)
  return [
    { x: xa, y: ya },
    { x: xb, y: ya },
    { x: xb, y: yb },
    { x: xa, y: yb },
  ]
}

function pushOpeningGlyphs(
  strokes: ElevationLineStroke[],
  rect: ElevationOpeningRect,
  occluder: OccluderMulti,
): void {
  const symbol = glyphFromElevationRect(rect)
  for (const poly of symbol.polys) {
    pushClippedStroke(strokes, 'glyph', flatToPoints(poly.points), occluder, {
      closed: poly.closed !== false && poly.fill === true,
      heavy: poly.role === 'handle',
    })
  }
  for (const circle of symbol.circles) {
    pushClippedStroke(
      strokes,
      'glyph',
      sampleCircle(circle.cx, circle.cy, circle.radius),
      occluder,
      {
        closed: true,
        heavy: circle.role === 'handle',
      },
    )
  }
}

function hasRidgeWallOutline(elevation: FacadeElevation): boolean {
  return elevation.walls.some((wall) => wall.ridge)
}

/**
 * CAD-lijnwerk voor architect-aanzicht: muren, binnenkant, glyphs, dak, vloerbanden.
 * Hidden-line: voorliggende baksteen dekt; gaten laten achterliggende lijnen door.
 */
export function buildElevationLinework(elevation: FacadeElevation): ElevationLinework {
  const strokes: ElevationLineStroke[] = []
  const planes = groupElevationPaintPlanes(elevation)

  const planeOccluders: OccluderMulti[] = planes.map((plane) =>
    occluderFromWalls(plane.walls, plane.openings, plane.transoms),
  )

  /** Occluder van alle vlakken strikt vóór index i (hogere diepte). */
  function frontOccluder(planeIndex: number): OccluderMulti {
    const geoms: [number, number][][][] = []
    for (let j = planeIndex + 1; j < planeOccluders.length; j += 1) {
      for (const polygon of planeOccluders[j]) geoms.push(polygon)
    }
    return unionOccluderGeoms(geoms)
  }

  for (let i = 0; i < planes.length; i += 1) {
    const plane = planes[i]
    const occluder = frontOccluder(i)

    for (const wall of plane.walls) {
      pushClippedStroke(
        strokes,
        wall.ridge ? 'ridge' : 'wall',
        elevationWallFillPoints(wall),
        occluder,
        {
          closed: true,
        },
      )
      for (const stroke of elevationWallInnerStrokes(wall)) {
        pushClippedStroke(strokes, 'inner', [stroke.a, stroke.b], occluder, { dashed: true })
      }
    }

    for (const opening of plane.openings) {
      pushOpeningGlyphs(strokes, opening, occluder)
    }
    for (const transom of plane.transoms) {
      pushOpeningGlyphs(strokes, transom, occluder)
    }

    // Kopse nok: ná host van dit vlak; niet door host geknipt, wel door voorliggende vlakken.
    for (const ridge of plane.endOnRidges) {
      pushClippedStroke(strokes, 'ridge', elevationWallFillPoints(ridge), occluder, {
        closed: true,
      })
    }
  }

  const allWallOccluder = unionOccluderGeoms(
    planeOccluders.flatMap((multi) => multi.map((polygon) => polygon)),
  )

  for (const roof of elevation.roofPlanes) {
    const pts = roof.fillPoints.length >= 3 ? roof.fillPoints : roof.points
    pushClippedStroke(strokes, 'roof', pts, allWallOccluder, { closed: true })
  }

  const skipNokBand = hasRidgeWallOutline(elevation)
  for (const band of elevation.bands) {
    if (band.kind === 'nok' && skipNokBand) continue
    if (band.kind === 'nok') {
      pushClippedStroke(
        strokes,
        'ridge',
        rectOutline(band.x0, band.y0, band.x1, band.y1),
        allWallOccluder,
        { closed: true },
      )
      continue
    }
    pushClippedStroke(
      strokes,
      'slab',
      rectOutline(band.x0, band.y0, band.x1, band.y1),
      allWallOccluder,
      { closed: true },
    )
  }

  return { strokes }
}
