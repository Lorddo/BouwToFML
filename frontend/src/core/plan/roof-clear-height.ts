/**
 * Clear-height (1,50 / 2,00 m) uit dakvlakken + liningCm.
 * `poly.z` = onderkant dakplaat. Contour is live (niet in .plg); override-slot leeg tot latere editor.
 */
import polygonClipping from 'polygon-clipping'
import { sampleCeilingRoofAtPoint } from './bind-walls-to-roofs'
import { dakThicknessCmForPlan } from './ridge-walls'
import { isDormerLikeRoof, listRidgeSurfacesOnFloor } from './roof-planes'
import type { FloorArea, FloorPlan, FloorSurface, Point2D } from './types'

export const CLEAR_HEIGHT_150_CM = 150
export const CLEAR_HEIGHT_200_CM = 200

export type ClearHeightBandSource = 'computed' | 'override'

export type ClearHeightPolyline = {
  points: Point2D[]
  heightCm: number
}

export type ClearHeightRing = {
  points: Point2D[]
  heightCm: number
}

export type ClearHeightContourResult = {
  polylines: ClearHeightPolyline[]
  rings: ClearHeightRing[]
  /** Override-poly (leeg in deze bouw). */
  override?: Point2D[]
}

export type ClearHeightBandRow = {
  areaId: string
  below150Cm2: number
  between150And200Cm2: number
  atLeast150Cm2: number
  atLeast200Cm2: number
  source: ClearHeightBandSource
}

function resolveIntersectionFn(): typeof polygonClipping.intersection {
  const mod = polygonClipping as unknown as {
    intersection?: typeof polygonClipping.intersection
    default?: { intersection?: typeof polygonClipping.intersection }
  }
  const fn = mod.intersection ?? mod.default?.intersection
  if (!fn) throw new Error('polygon-clipping.intersection is not available')
  return fn
}

function intersectRings(a: readonly Point2D[], b: readonly Point2D[]): Point2D[][] {
  if (a.length < 3 || b.length < 3) return []
  try {
    const intersection = resolveIntersectionFn()
    const result = intersection([toClipRing(a)], [toClipRing(b)])
    const out: Point2D[][] = []
    for (const polygon of result) {
      const outer = polygon[0]
      if (!outer || outer.length < 3) continue
      out.push(outer.map(([x, y]) => ({ x, y })))
    }
    return out
  } catch {
    return []
  }
}

function ringArea(ring: readonly Point2D[]): number {
  let sum = 0
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (!a || !b) continue
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

function toClipRing(poly: readonly Point2D[]): Array<[number, number]> {
  const ring: Array<[number, number]> = poly.map((p) => [p.x, p.y])
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]])
  }
  return ring
}

export function clampLiningCm(liningCm: number, dakThicknessCm: number): number {
  if (!Number.isFinite(liningCm)) return 0
  const min = -Math.max(0, Math.round(dakThicknessCm))
  return Math.max(min, Math.round(liningCm))
}

export function resolveAreaLiningCm(
  area: FloorArea | null | undefined,
  dakThicknessCm: number,
): number {
  if (area?.liningCm == null || !Number.isFinite(area.liningCm)) return 0
  return clampLiningCm(area.liningCm, dakThicknessCm)
}

export function clearHeightSnedeZCm(params: {
  floorZ0?: number
  heightCm: number
  liningCm?: number
}): number {
  const floorZ0 = params.floorZ0 ?? 0
  const lining = params.liningCm ?? 0
  return floorZ0 + params.heightCm + lining
}

export function clearHeightAtPointCm(params: {
  roofZ: number
  liningCm?: number
  floorZ0?: number
}): number {
  const lining = params.liningCm ?? 0
  const floorZ0 = params.floorZ0 ?? 0
  return params.roofZ - lining - floorZ0
}

type Point3 = Point2D & { z: number }

function edgeIntersectAtZ(a: Point3, b: Point3, zCut: number): Point2D | null {
  const za = a.z
  const zb = b.z
  if (Math.abs(za - zb) < 1e-9) return null
  if ((za < zCut && zb < zCut) || (za > zCut && zb > zCut)) return null
  if (Math.abs(za - zCut) < 1e-9) return { x: a.x, y: a.y }
  if (Math.abs(zb - zCut) < 1e-9) return { x: b.x, y: b.y }
  const t = (zCut - za) / (zb - za)
  if (t < 0 || t > 1) return null
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** Snede van één dakvlak met horizontaal vlak → losse segmenten. */
function roofSurfaceCutSegments(
  surface: FloorSurface,
  zCut: number,
): Array<[Point2D, Point2D]> {
  const pts: Point3[] = surface.poly.map((p) => ({
    x: p.x,
    y: p.y,
    z: typeof p.z === 'number' && Number.isFinite(p.z) ? p.z : 0,
  }))
  if (pts.length < 3) return []
  const segments: Array<[Point2D, Point2D]> = []
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = pts[0]
    const b = pts[i]
    const c = pts[i + 1]
    if (!a || !b || !c) continue
    const hits: Point2D[] = []
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const hit = edgeIntersectAtZ(p, q, zCut)
      if (hit) hits.push(hit)
    }
    // Dedup near-identical
    const unique: Point2D[] = []
    for (const hit of hits) {
      if (unique.some((u) => Math.hypot(u.x - hit.x, u.y - hit.y) < 0.5)) continue
      unique.push(hit)
    }
    if (unique.length === 2) {
      segments.push([unique[0]!, unique[1]!])
    }
  }
  return segments
}

function stitchSegments(segments: Array<[Point2D, Point2D]>): Point2D[][] {
  if (segments.length === 0) return []
  const unused = segments.map((seg) => [...seg] as [Point2D, Point2D])
  const chains: Point2D[][] = []
  const near = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y) <= 2

  while (unused.length > 0) {
    const first = unused.pop()!
    const chain: Point2D[] = [first[0], first[1]]
    let extended = true
    while (extended) {
      extended = false
      for (let i = unused.length - 1; i >= 0; i -= 1) {
        const [a, b] = unused[i]!
        const head = chain[0]!
        const tail = chain[chain.length - 1]!
        if (near(tail, a)) {
          chain.push(b)
          unused.splice(i, 1)
          extended = true
        } else if (near(tail, b)) {
          chain.push(a)
          unused.splice(i, 1)
          extended = true
        } else if (near(head, a)) {
          chain.unshift(b)
          unused.splice(i, 1)
          extended = true
        } else if (near(head, b)) {
          chain.unshift(a)
          unused.splice(i, 1)
          extended = true
        }
      }
    }
    if (chain.length >= 2) chains.push(chain)
  }
  return chains
}

function pointInRing(point: Point2D, ring: readonly Point2D[]): boolean {
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

function findAreaAtPoint(areas: ReadonlyArray<FloorArea>, point: Point2D): FloorArea | null {
  for (const area of areas) {
    if (area.poly.length >= 3 && pointInRing(point, area.poly)) return area
  }
  return null
}

function lineSegIntersectionT(
  a: Point2D,
  b: Point2D,
  c: Point2D,
  d: Point2D,
): number | null {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const sx = d.x - c.x
  const sy = d.y - c.y
  const den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-12) return null
  const qx = c.x - a.x
  const qy = c.y - a.y
  const t = (qx * sy - qy * sx) / den
  const u = (qx * ry - qy * rx) / den
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null
  return Math.max(0, Math.min(1, t))
}

/** Knip segment op ringgrenzen; behoud alleen stukken buiten alle rings (naast/tussen dakkapellen). */
function clipSegmentOutsideRings(
  seg: [Point2D, Point2D],
  rings: ReadonlyArray<ReadonlyArray<Point2D>>,
): Array<[Point2D, Point2D]> {
  if (rings.length === 0) return [seg]
  const ts = new Set<number>([0, 1])
  for (const ring of rings) {
    if (ring.length < 3) continue
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      const t = lineSegIntersectionT(seg[0], seg[1], a, b)
      if (t != null) ts.add(t)
    }
  }
  const sorted = [...ts].sort((x, y) => x - y)
  const out: Array<[Point2D, Point2D]> = []
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const t0 = sorted[i]!
    const t1 = sorted[i + 1]!
    if (t1 - t0 < 1e-6) continue
    const midT = (t0 + t1) / 2
    const mid = {
      x: seg[0].x + (seg[1].x - seg[0].x) * midT,
      y: seg[0].y + (seg[1].y - seg[0].y) * midT,
    }
    if (rings.some((ring) => ring.length >= 3 && pointInRing(mid, ring))) continue
    out.push([
      {
        x: seg[0].x + (seg[1].x - seg[0].x) * t0,
        y: seg[0].y + (seg[1].y - seg[0].y) * t0,
      },
      {
        x: seg[0].x + (seg[1].x - seg[0].x) * t1,
        y: seg[0].y + (seg[1].y - seg[0].y) * t1,
      },
    ])
  }
  return out
}

function resolveDifferenceFn(): typeof polygonClipping.difference {
  const mod = polygonClipping as unknown as {
    difference?: typeof polygonClipping.difference
    default?: { difference?: typeof polygonClipping.difference }
  }
  const fn = mod.difference ?? mod.default?.difference
  if (!fn) throw new Error('polygon-clipping.difference is not available')
  return fn
}

/** Trek kind-voetafdrukken uit parent-fill (voorkomt overlap-arcering). */
function subtractRings(subject: readonly Point2D[], holes: ReadonlyArray<readonly Point2D[]>): Point2D[][] {
  if (subject.length < 3) return []
  if (holes.length === 0) return [subject.map((p) => ({ x: p.x, y: p.y }))]
  try {
    const difference = resolveDifferenceFn()
    const clip = holes.filter((h) => h.length >= 3).map((h) => [toClipRing(h)])
    if (clip.length === 0) return [subject.map((p) => ({ x: p.x, y: p.y }))]
    const result = difference([toClipRing(subject)], ...clip)
    const out: Point2D[][] = []
    for (const polygon of result) {
      const outer = polygon[0]
      if (!outer || outer.length < 3) continue
      out.push(outer.map(([x, y]) => ({ x, y })))
    }
    return out
  } catch {
    return [subject.map((p) => ({ x: p.x, y: p.y }))]
  }
}

/** Knip segment op area-grenzen; behoud stukken waarvan mid-area lining matcht. */
function clipSegmentToLiningAreas(
  seg: [Point2D, Point2D],
  areas: ReadonlyArray<FloorArea>,
  liningCm: number,
  dakThicknessCm: number,
  liningDefault: number,
): Array<[Point2D, Point2D]> {
  if (areas.length === 0) {
    return liningCm === liningDefault ? [seg] : []
  }
  const ts = new Set<number>([0, 1])
  for (const area of areas) {
    if (area.poly.length < 3) continue
    for (let i = 0; i < area.poly.length; i += 1) {
      const a = area.poly[i]!
      const b = area.poly[(i + 1) % area.poly.length]!
      const t = lineSegIntersectionT(seg[0], seg[1], a, b)
      if (t != null) ts.add(t)
    }
  }
  const sorted = [...ts].sort((x, y) => x - y)
  const out: Array<[Point2D, Point2D]> = []
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const t0 = sorted[i]!
    const t1 = sorted[i + 1]!
    if (t1 - t0 < 1e-6) continue
    const midT = (t0 + t1) / 2
    const mid = {
      x: seg[0].x + (seg[1].x - seg[0].x) * midT,
      y: seg[0].y + (seg[1].y - seg[0].y) * midT,
    }
    const area = findAreaAtPoint(areas, mid)
    const areaLining = area ? resolveAreaLiningCm(area, dakThicknessCm) : liningDefault
    if (areaLining !== liningCm) continue
    out.push([
      {
        x: seg[0].x + (seg[1].x - seg[0].x) * t0,
        y: seg[0].y + (seg[1].y - seg[0].y) * t0,
      },
      {
        x: seg[0].x + (seg[1].x - seg[0].x) * t1,
        y: seg[0].y + (seg[1].y - seg[0].y) * t1,
      },
    ])
  }
  return out
}

/**
 * Clip fill-ring op areas met deze lining.
 * Default-lining: ook dakdelen buiten alle areas.
 */
function clipFillToLiningAreas(
  ring: readonly Point2D[],
  areas: ReadonlyArray<FloorArea>,
  liningCm: number,
  dakThicknessCm: number,
  liningDefault: number,
): Point2D[][] {
  if (ring.length < 3) return []
  if (areas.length === 0) {
    return liningCm === liningDefault ? [ring.map((p) => ({ x: p.x, y: p.y }))] : []
  }
  const out: Point2D[][] = []
  for (const area of areas) {
    if (area.poly.length < 3) continue
    if (resolveAreaLiningCm(area, dakThicknessCm) !== liningCm) continue
    for (const piece of intersectRings(ring, area.poly)) {
      if (piece.length >= 3 && ringArea(piece) >= 100) out.push(piece)
    }
  }
  if (liningCm === liningDefault) {
    const covered = areas.filter((a) => a.poly.length >= 3).map((a) => a.poly)
    if (covered.length > 0) {
      for (const piece of subtractRings(ring, covered)) {
        if (piece.length >= 3 && ringArea(piece) >= 100) out.push(piece)
      }
    }
  }
  return out
}

/**
 * Contouren voor één clear-height. `liningCm` = default (0); per-area override via areas.
 * Bij meerdere lining-waarden: snede per unieke lining, clip op die areas.
 */
export function computeClearHeightContour(
  plan: FloorPlan,
  floorIndex: number,
  heightCm: number,
  options?: { liningDefaultCm?: number; override?: Point2D[] },
): ClearHeightContourResult {
  const floor = plan.floors[floorIndex]
  if (!floor) return { polylines: [], rings: [] }

  const overridePoly =
    options?.override ??
    plan.roof?.clearHeightOverride?.[String(floorIndex)]?.[0]?.map((p) => ({ x: p.x, y: p.y }))
  if (overridePoly && overridePoly.length >= 2) {
    return {
      polylines: [{ points: overridePoly, heightCm }],
      rings: overridePoly.length >= 3 ? [{ points: overridePoly, heightCm }] : [],
      override: overridePoly,
    }
  }

  const surfaces = listRidgeSurfacesOnFloor(floor)
  if (surfaces.length === 0) return { polylines: [], rings: [] }

  const dakThicknessCm = dakThicknessCmForPlan(plan)
  const areas = floor.areas ?? []
  const liningDefault = clampLiningCm(options?.liningDefaultCm ?? 0, dakThicknessCm)

  const liningValues = new Set<number>([liningDefault])
  for (const area of areas) {
    liningValues.add(resolveAreaLiningCm(area, dakThicknessCm))
  }

  const polylines: ClearHeightPolyline[] = []
  const rings: ClearHeightRing[] = []

  for (const liningCm of liningValues) {
    const zCut = clearHeightSnedeZCm({
      heightCm,
      liningCm,
    })
    const segments: Array<[Point2D, Point2D]> = []
    const dormersAll = surfaces.filter((s) => isDormerLikeRoof(s, surfaces))
    for (const surface of surfaces) {
      if (isDormerLikeRoof(surface, surfaces)) {
        for (const seg of roofSurfaceCutSegments(surface, zCut)) {
          for (const kept of clipSegmentToLiningAreas(
            seg,
            areas,
            liningCm,
            dakThicknessCm,
            liningDefault,
          )) {
            segments.push(kept)
          }
        }
        continue
      }
      const childDormers = dormersAll.filter(
        (d) => !d.roofParentId || d.roofParentId === surface.id,
      )
      const dormerRings = childDormers.map((d) => d.poly)
      for (const seg of roofSurfaceCutSegments(surface, zCut)) {
        for (const outsideDormer of clipSegmentOutsideRings(seg, dormerRings)) {
          for (const kept of clipSegmentToLiningAreas(
            outsideDormer,
            areas,
            liningCm,
            dakThicknessCm,
            liningDefault,
          )) {
            segments.push(kept)
          }
        }
      }
    }

    for (const chain of stitchSegments(segments)) {
      polylines.push({ points: chain, heightCm })
    }

    // Fill = gebieden met vrije hoogte < heightCm (onder de 1,50-lijn), per area-lining.
    for (const surface of surfaces) {
      const below = portionBelowZ(surface, zCut)
      if (isDormerLikeRoof(surface, surfaces)) {
        for (const ring of below) {
          if (ring.length < 3 || ringArea(ring) < 100) continue
          for (const clipped of clipFillToLiningAreas(
            ring,
            areas,
            liningCm,
            dakThicknessCm,
            liningDefault,
          )) {
            rings.push({ points: clipped, heightCm })
          }
        }
        continue
      }
      const childPolys = dormersAll
        .filter((d) => !d.roofParentId || d.roofParentId === surface.id)
        .map((d) => d.poly)
      for (const ring of below) {
        if (ring.length < 3 || ringArea(ring) < 100) continue
        for (const punched of subtractRings(ring, childPolys)) {
          if (punched.length < 3 || ringArea(punched) < 100) continue
          for (const clipped of clipFillToLiningAreas(
            punched,
            areas,
            liningCm,
            dakThicknessCm,
            liningDefault,
          )) {
            rings.push({ points: clipped, heightCm })
          }
        }
      }
    }
  }

  return { polylines, rings }
}

/** Driehoek-punten met Z ≤ zCut → polygon(en) in XY (onder clear-height). */
function portionBelowZ(surface: FloorSurface, zCut: number): Point2D[][] {
  const pts: Point3[] = surface.poly.map((p) => ({
    x: p.x,
    y: p.y,
    z: typeof p.z === 'number' && Number.isFinite(p.z) ? p.z : 0,
  }))
  if (pts.length < 3) return []
  const out: Point2D[][] = []
  for (let i = 1; i < pts.length - 1; i += 1) {
    const tri = [pts[0]!, pts[i]!, pts[i + 1]!]
    const clipped = clipTriangleBelowZ(tri, zCut)
    if (clipped && clipped.length >= 3) out.push(clipped)
  }
  return out
}

function clipTriangleBelowZ(tri: Point3[], zCut: number): Point2D[] | null {
  const output: Point2D[] = []
  for (let i = 0; i < 3; i += 1) {
    const cur = tri[i]!
    const prev = tri[(i + 2) % 3]!
    const curIn = cur.z <= zCut + 1e-6
    const prevIn = prev.z <= zCut + 1e-6
    if (curIn) {
      if (!prevIn) {
        const hit = edgeIntersectAtZ(prev, cur, zCut)
        if (hit) output.push(hit)
      }
      output.push({ x: cur.x, y: cur.y })
    } else if (prevIn) {
      const hit = edgeIntersectAtZ(prev, cur, zCut)
      if (hit) output.push(hit)
    }
  }
  const unique: Point2D[] = []
  for (const p of output) {
    if (unique.some((u) => Math.hypot(u.x - p.x, u.y - p.y) < 0.5)) continue
    unique.push(p)
  }
  return unique.length >= 3 ? unique : null
}

export function computeClearHeightBands(
  plan: FloorPlan,
  floorIndex: number,
  options?: { override?: Point2D[] },
): ClearHeightBandRow[] {
  const floor = plan.floors[floorIndex]
  if (!floor) return []
  const areas = floor.areas ?? []
  if (areas.length === 0) return []
  const surfaces = listRidgeSurfacesOnFloor(floor)
  const dakThicknessCm = dakThicknessCmForPlan(plan)
  const rows: ClearHeightBandRow[] = []

  const overridePoly =
    options?.override ??
    plan.roof?.clearHeightOverride?.[String(floorIndex)]?.[0]?.map((p) => ({ x: p.x, y: p.y }))
  const useOverride = overridePoly != null && overridePoly.length >= 3

  for (const area of areas) {
    if (area.poly.length < 3) continue
    const liningCm = resolveAreaLiningCm(area, dakThicknessCm)

    // Sample grid in area bbox for band areas (robust met lining/dormers).
    const xs = area.poly.map((p) => p.x)
    const ys = area.poly.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const step = Math.max(10, Math.min(40, (maxX - minX + maxY - minY) / 40))
    let below = 0
    let mid = 0
    let ge150 = 0
    let ge200 = 0
    let samples = 0
    for (let x = minX + step / 2; x <= maxX; x += step) {
      for (let y = minY + step / 2; y <= maxY; y += step) {
        const point = { x, y }
        if (!pointInRing(point, area.poly)) continue
        samples += 1
        if (useOverride) {
          // Override = ≥1,50-zone-ring; binnen = ≥150, buiten = below (geen 200-split).
          if (pointInRing(point, overridePoly!)) {
            ge150 += 1
            mid += 1
          } else {
            below += 1
          }
          continue
        }
        const hit = sampleCeilingRoofAtPoint(surfaces, point)
        if (!hit) {
          // Geen dak → volle verdiepingshoogte telt als ≥2,00 als floor.height genoeg is
          const h = floor.height
          if (h >= CLEAR_HEIGHT_200_CM) {
            ge200 += 1
            ge150 += 1
          } else if (h >= CLEAR_HEIGHT_150_CM) {
            ge150 += 1
            mid += 1
          } else {
            below += 1
          }
          continue
        }
        const clear = clearHeightAtPointCm({
          roofZ: hit.z,
          liningCm,
        })
        if (clear >= CLEAR_HEIGHT_200_CM) {
          ge200 += 1
          ge150 += 1
        } else if (clear >= CLEAR_HEIGHT_150_CM) {
          ge150 += 1
          mid += 1
        } else {
          below += 1
        }
      }
    }
    const cell = step * step
    const totalArea = ringArea(area.poly)
    const scale = samples > 0 ? totalArea / (samples * cell) : 0
    rows.push({
      areaId: area.id,
      below150Cm2: Math.round(below * cell * scale),
      between150And200Cm2: Math.round(mid * cell * scale),
      atLeast150Cm2: Math.round(ge150 * cell * scale),
      atLeast200Cm2: Math.round(ge200 * cell * scale),
      source: useOverride ? 'override' : 'computed',
    })
  }
  return rows
}

/** Convenience: 1,50 + 2,00 contours voor overlay.
 * fills150 = gebieden onder 1,50 m vrije hoogte.
 */
export function computeClearHeightOverlays(
  plan: FloorPlan,
  floorIndex: number,
): {
  lines150: ClearHeightPolyline[]
  lines200: ClearHeightPolyline[]
  fills150: ClearHeightRing[]
} {
  const c150 = computeClearHeightContour(plan, floorIndex, CLEAR_HEIGHT_150_CM)
  const c200 = computeClearHeightContour(plan, floorIndex, CLEAR_HEIGHT_200_CM)
  return {
    lines150: c150.polylines,
    lines200: c200.polylines,
    fills150: c150.rings,
  }
}
