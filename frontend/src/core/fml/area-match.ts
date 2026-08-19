import type { FloorArea, Point2D } from './types'
import { UNLABELED_AREA_COLOR } from './roomtype-catalog'

/** Minimale room-oppervlakte (cm²) — ~0,04 m². */
export const MIN_AREA_CM2 = 400

/** IoU-drempel voor tag-behoud bij regeneratie. */
export const AREA_MATCH_IOU = 0.4

function shortGuid(): string {
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')
}

function ringAreaAbs(ring: Point2D[]): number {
  let area = 0
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2
}

function centroid(ring: Point2D[]): Point2D {
  let cx = 0
  let cy = 0
  for (const p of ring) {
    cx += p.x
    cy += p.y
  }
  const n = Math.max(1, ring.length)
  return { x: cx / n, y: cy / n }
}

function pointInPolygon(point: Point2D, ring: Point2D[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x
    const yi = ring[i].y
    const xj = ring[j].x
    const yj = ring[j].y
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-15) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function bbox(ring: Point2D[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of ring) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

/** Grove IoU via bbox-overlap × sample van centroid-in-poly (stabiel genoeg voor tag-match). */
function roughIou(a: Point2D[], b: Point2D[]): number {
  const areaA = ringAreaAbs(a)
  const areaB = ringAreaAbs(b)
  if (areaA < 1e-6 || areaB < 1e-6) return 0
  const ba = bbox(a)
  const bb = bbox(b)
  const ix = Math.max(0, Math.min(ba.maxX, bb.maxX) - Math.max(ba.minX, bb.minX))
  const iy = Math.max(0, Math.min(ba.maxY, bb.maxY) - Math.max(ba.minY, bb.minY))
  const interBbox = ix * iy
  if (interBbox < 1e-6) return 0
  const ca = centroid(a)
  const cb = centroid(b)
  const aInB = pointInPolygon(ca, b)
  const bInA = pointInPolygon(cb, a)
  if (!aInB && !bInA && interBbox < Math.min(areaA, areaB) * 0.25) return 0
  // Schatting: snijvlak ≈ min(areas) als centroids in elkaar, anders bbox-fractie
  let inter = interBbox
  if (aInB && bInA) inter = Math.min(areaA, areaB)
  else if (aInB) inter = Math.min(areaA, interBbox)
  else if (bInA) inter = Math.min(areaB, interBbox)
  const union = areaA + areaB - inter
  return union > 1e-6 ? inter / union : 0
}

function normalizeHole(ring: Point2D[]): Point2D[] {
  if (ring.length < 3) return ring
  const out = ring.map((p) => ({ x: p.x, y: p.y }))
  // polygon-clipping holes zijn vaak CW; houd winding stabiel (CCW positief)
  let area = 0
  for (let i = 0; i < out.length; i += 1) {
    const a = out[i]
    const b = out[(i + 1) % out.length]
    area += a.x * b.y - b.x * a.y
  }
  if (area > 0) out.reverse()
  return out
}

function copyTags(from: FloorArea, poly: Point2D[]): FloorArea {
  return {
    id: from.id,
    poly,
    role: from.role,
    name: from.name,
    customName: from.customName,
    color: from.color,
    showAreaLabel: from.showAreaLabel !== false,
    showSurfaceArea: from.showSurfaceArea,
    name_x: from.name_x,
    name_y: from.name_y,
  }
}

function unlabeledArea(poly: Point2D[]): FloorArea {
  return {
    id: `area-${shortGuid()}`,
    poly,
    color: UNLABELED_AREA_COLOR,
    showAreaLabel: true,
  }
}

/**
 * Bouw FloorArea[] uit wall-union hole-ringen; behoud tags via IoU/centroid-match.
 */
export function rebuildAreasFromHoles(
  holes: Point2D[][],
  previous: FloorArea[] | undefined,
): FloorArea[] {
  const candidates = holes
    .map(normalizeHole)
    .filter((ring) => ring.length >= 3 && ringAreaAbs(ring) >= MIN_AREA_CM2)

  if (candidates.length === 0) return []

  const prev = previous ?? []
  if (prev.length === 0) {
    return candidates.map((poly) => unlabeledArea(poly))
  }

  type Pair = { pi: number; ci: number; score: number }
  const pairs: Pair[] = []
  for (let pi = 0; pi < prev.length; pi += 1) {
    for (let ci = 0; ci < candidates.length; ci += 1) {
      const score = roughIou(prev[pi].poly, candidates[ci])
      if (score >= AREA_MATCH_IOU) pairs.push({ pi, ci, score })
    }
  }
  pairs.sort((a, b) => b.score - a.score)

  const usedPrev = new Set<number>()
  const usedCand = new Set<number>()
  const matched = new Map<number, number>() // ci → pi
  for (const pair of pairs) {
    if (usedPrev.has(pair.pi) || usedCand.has(pair.ci)) continue
    usedPrev.add(pair.pi)
    usedCand.add(pair.ci)
    matched.set(pair.ci, pair.pi)
  }

  return candidates.map((poly, ci) => {
    const pi = matched.get(ci)
    if (pi == null) return unlabeledArea(poly)
    return copyTags(prev[pi], poly)
  })
}
