import polygonClipping from 'polygon-clipping'
import { clampWallBalance, floorplannerLeftNormal } from '@/core/fml/fml-wall-geom'
import type { Point2D } from '@/core/fml/types'

export interface WallPolygonInput {
  id: string
  a: Point2D
  b: Point2D
  thickness: number
  balance?: number
}

export interface WallPolygon {
  id: string
  points: Point2D[]
}

/** One connected component from the wall union (exterior + optional holes). */
export interface WallFillComponent {
  rings: Point2D[][]
}

export interface WallRenderGeometry {
  fillComponents: WallFillComponent[]
  wallPolygons: WallPolygon[]
}

const ENDPOINT_EPS_CM = 3
/** Half-thickness end extend so meeting walls always overlap for boolean union. */
const END_EXTEND_FACTOR = 0.5
/** Extra inflate (cm) before clipper union to seal near-touching edges. */
const UNION_SEAL_CM = 0.5
/**
 * Snap clipper coords to 0.01 cm. Raw L10 floats create near-degenerate
 * intersections → polygon-clipping "Unable to complete output ring".
 */
const QUANTIZE_CM = 0.01
const MIN_WALL_LENGTH_CM = 0.5

function quantize(value: number): number {
  return Math.round(value / QUANTIZE_CM) * QUANTIZE_CM
}

function quantizePoint(point: Point2D): Point2D {
  return { x: quantize(point.x), y: quantize(point.y) }
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function add(a: Point2D, b: Point2D): Point2D {
  return { x: a.x + b.x, y: a.y + b.y }
}

function scale(v: Point2D, factor: number): Point2D {
  return { x: v.x * factor, y: v.y * factor }
}

function subtract(a: Point2D, b: Point2D): Point2D {
  return { x: a.x - b.x, y: a.y - b.y }
}

function normalize(v: Point2D): Point2D {
  const len = Math.hypot(v.x, v.y)
  if (len < 1e-9) return { x: 1, y: 0 }
  return { x: v.x / len, y: v.y / len }
}

function leftNormal(dir: Point2D): Point2D {
  return floorplannerLeftNormal(dir)
}

function endpointKey(point: Point2D): string {
  const q = 1 / ENDPOINT_EPS_CM
  return `${Math.round(point.x * q)},${Math.round(point.y * q)}`
}

function pointAtEnd(wall: WallPolygonInput, end: 'a' | 'b'): Point2D {
  return end === 'a' ? wall.a : wall.b
}

/**
 * Left (+normal) / right (−normal) thickness extents from the Floorplanner **axis**
 * (`a`/`b` — not always the visual mid of the wall body).
 */
export function resolveWallExtents(wall: Pick<WallPolygonInput, 'thickness' | 'balance'>): {
  plus: number
  minus: number
} {
  const clamped = clampWallBalance(wall.balance)
  return {
    plus: wall.thickness * clamped,
    minus: wall.thickness * (1 - clamped),
  }
}

/** cm along left normal from axis to body mid-thickness (0 when balance = 0.5). */
export function wallBalanceMidOffsetCm(thickness: number, balance?: number): number {
  const { plus, minus } = resolveWallExtents({ thickness, balance })
  return (plus - minus) / 2
}

/** Shift an axis point onto the wall body mid-line for the given balance. */
export function offsetPointByWallBalance(
  point: Point2D,
  wallUnit: Point2D,
  thickness: number,
  balance?: number,
): Point2D {
  const mid = wallBalanceMidOffsetCm(thickness, balance)
  if (Math.abs(mid) < 1e-9) return point
  const n = floorplannerLeftNormal(wallUnit)
  return { x: point.x + n.x * mid, y: point.y + n.y * mid }
}

/** Flat `[x,y,…]` polyline in cm — same mid-line shift as {@link offsetPointByWallBalance}. */
export function offsetFlatPointsByWallBalance(
  points: number[],
  wallUnit: Point2D,
  thickness: number,
  balance?: number,
): number[] {
  const mid = wallBalanceMidOffsetCm(thickness, balance)
  if (Math.abs(mid) < 1e-9 || points.length < 2) return points
  const n = floorplannerLeftNormal(wallUnit)
  const ox = n.x * mid
  const oy = n.y * mid
  const out = points.slice()
  for (let i = 0; i + 1 < out.length; i += 2) {
    out[i] += ox
    out[i + 1] += oy
  }
  return out
}

function buildAdjacency(
  walls: WallPolygonInput[],
): Map<string, Array<{ wallId: string; end: 'a' | 'b' }>> {
  const adj = new Map<string, Array<{ wallId: string; end: 'a' | 'b' }>>()
  for (const wall of walls) {
    for (const end of ['a', 'b'] as const) {
      const key = endpointKey(pointAtEnd(wall, end))
      const list = adj.get(key) ?? []
      list.push({ wallId: wall.id, end })
      adj.set(key, list)
    }
  }
  return adj
}

function junctionPoint(
  junctionKey: string,
  adj: Map<string, Array<{ wallId: string; end: 'a' | 'b' }>>,
  wallById: Map<string, WallPolygonInput>,
): Point2D {
  const entries = adj.get(junctionKey) ?? []
  if (entries.length === 0) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  for (const entry of entries) {
    const wall = wallById.get(entry.wallId)!
    const point = pointAtEnd(wall, entry.end)
    x += point.x
    y += point.y
  }
  return { x: x / entries.length, y: y / entries.length }
}

function alongWallDir(wall: WallPolygonInput): Point2D {
  return normalize(subtract(wall.b, wall.a))
}

function ringArea(ring: Point2D[]): number {
  let area = 0
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}

const ON_SEGMENT_EPS_CM = 3

function findMidspanHosts(
  wall: WallPolygonInput,
  end: 'a' | 'b',
  walls: WallPolygonInput[],
): WallPolygonInput[] {
  const point = pointAtEnd(wall, end)
  const hosts: WallPolygonInput[] = []
  for (const other of walls) {
    if (other.id === wall.id) continue
    const ab = subtract(other.b, other.a)
    const len = Math.hypot(ab.x, ab.y)
    if (len < 1e-9) continue
    const t = ((point.x - other.a.x) * ab.x + (point.y - other.a.y) * ab.y) / (len * len)
    if (t < 0.02 || t > 0.98) continue
    const proj = { x: other.a.x + ab.x * t, y: other.a.y + ab.y * t }
    if (distance(point, proj) > ON_SEGMENT_EPS_CM) continue
    hosts.push(other)
  }
  return hosts
}

function neighborsAtEnd(
  wall: WallPolygonInput,
  end: 'a' | 'b',
  adj: Map<string, Array<{ wallId: string; end: 'a' | 'b' }>>,
  wallById: Map<string, WallPolygonInput>,
): WallPolygonInput[] {
  const key = endpointKey(pointAtEnd(wall, end))
  const entries = adj.get(key) ?? []
  return entries
    .filter((entry) => entry.wallId !== wall.id)
    .map((entry) => wallById.get(entry.wallId)!)
}

/**
 * How far `wall`'s body extends from its Floorplanner axis in direction `dir`.
 * Balance-aware: balance=0.5 → thickness/2; flush-to-one-side → 0 on the empty side.
 */
function extentAlongDirection(wall: WallPolygonInput, dir: Point2D): number {
  const unit = normalize(dir)
  const n = leftNormal(alongWallDir(wall))
  const { plus, minus } = resolveWallExtents(wall)
  const normalDot = n.x * unit.x + n.y * unit.y
  return Math.max(0, plus * normalDot, -minus * normalDot)
}

function endOutDir(wall: WallPolygonInput, end: 'a' | 'b'): Point2D {
  const along = alongWallDir(wall)
  return end === 'a' ? scale(along, -1) : along
}

/**
 * Join-cap: stop just inside the neighbor face. Union still seals via
 * {@link UNION_SEAL_CM} inflate; without this inset the incoming cap + inflate
 * pokes ~0.5 cm past a straight through-wall (1 px at typical junction zoom).
 */
function joinExtendCm(needed: number): number {
  return Math.max(0, needed - UNION_SEAL_CM)
}

/**
 * Free end: half self thickness (square cap).
 * Joined end: neighbor body extent along this wall's out-dir (balance-aware) —
 * flush faces do not grow a false exterior ear; centered walls keep thickness/2.
 * Mid-span T into host: same extent, inset so the host façade stays straight.
 */
function resolveEndExtendCm(
  wall: WallPolygonInput,
  end: 'a' | 'b',
  adj: Map<string, Array<{ wallId: string; end: 'a' | 'b' }>>,
  wallById: Map<string, WallPolygonInput>,
  walls: WallPolygonInput[],
): number {
  const out = endOutDir(wall, end)
  const neighbors = neighborsAtEnd(wall, end, adj, wallById)
  if (neighbors.length > 0) {
    const needed = Math.max(...neighbors.map((neighbor) => extentAlongDirection(neighbor, out)))
    return joinExtendCm(needed)
  }

  const hosts = findMidspanHosts(wall, end, walls)
  if (hosts.length > 0) {
    const needed = Math.max(...hosts.map((host) => extentAlongDirection(host, out)))
    return joinExtendCm(needed)
  }

  return Math.max(wall.thickness * END_EXTEND_FACTOR, UNION_SEAL_CM)
}

/**
 * Oriented rectangle along the Floorplanner axis (`a`/`b`) with square ends.
 * Join-extend is neighbor+balance-aware so flush faces do not grow exterior ears.
 */
function buildWallRectPolygon(
  wall: WallPolygonInput,
  adj: Map<string, Array<{ wallId: string; end: 'a' | 'b' }>>,
  wallById: Map<string, WallPolygonInput>,
  walls: WallPolygonInput[],
): Point2D[] {
  const along = alongWallDir(wall)
  const extents = resolveWallExtents(wall)
  const len = distance(wall.a, wall.b)
  const maxExtend = Math.max(0, len * 0.45)
  const extendA = Math.min(resolveEndExtendCm(wall, 'a', adj, wallById, walls), maxExtend)
  const extendB = Math.min(resolveEndExtendCm(wall, 'b', adj, wallById, walls), maxExtend)
  const a0 = add(wall.a, scale(along, -extendA))
  const b0 = add(wall.b, scale(along, extendB))
  const n = leftNormal(along)
  const points = [
    add(a0, scale(n, extents.plus)),
    add(b0, scale(n, extents.plus)),
    add(b0, scale(n, -extents.minus)),
    add(a0, scale(n, -extents.minus)),
  ]
  if (ringArea(points) < 0) points.reverse()
  return points
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
  // Drop consecutive duplicate vertices after quantize (zero-length edges crash clipper).
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

/** Expand a closed ring from its centroid so touching walls overlap for union. */
function inflateRing(points: Point2D[], amountCm: number): Point2D[] {
  if (points.length < 3 || amountCm <= 0) return points
  let cx = 0
  let cy = 0
  for (const p of points) {
    cx += p.x
    cy += p.y
  }
  cx /= points.length
  cy /= points.length
  return points.map((p) => {
    const dx = p.x - cx
    const dy = p.y - cy
    const len = Math.hypot(dx, dy)
    if (len < 1e-9) return { ...p }
    const factor = (len + amountCm) / len
    return { x: cx + dx * factor, y: cy + dy * factor }
  })
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

function toUnionGeom(points: Point2D[]): [[number, number][]] | null {
  const ring = toClippingRing(inflateRing(points, UNION_SEAL_CM))
  if (ring.length < 4) return null
  return [ring]
}

function unionWallRects(rects: Point2D[][]): WallFillComponent[] {
  if (rects.length === 0) return []

  const geoms = rects
    .map((points) => toUnionGeom(points))
    .filter((geom): geom is [[number, number][]] => geom != null)

  if (geoms.length === 0) {
    throw new Error('fml-walls: no valid wall rectangles for union')
  }
  if (geoms.length === 1) {
    return [{ rings: [fromClippingRing(geoms[0][0])] }]
  }

  const union = resolveUnionFn()
  // Pairwise only — never union(...N). No catch/append fallback.
  let acc: [number, number][][][] = [geoms[0]]
  for (let i = 1; i < geoms.length; i += 1) {
    acc = union(acc, geoms[i])
  }

  if (acc.length === 0) {
    throw new Error('fml-walls: union returned empty geometry')
  }

  return acc.map((polygon) => ({
    rings: polygon.map((ring) => fromClippingRing(ring)),
  }))
}

/**
 * Per-wall square rects (overlays) + boolean-union fill silhouette.
 * No miter, no silent per-wall fallback.
 */
export function buildWallRenderGeometry(walls: WallPolygonInput[]): WallRenderGeometry {
  if (walls.length === 0) {
    return { fillComponents: [], wallPolygons: [] }
  }

  // Quantize first so junction clustering + clipper share a stable grid.
  const quantized: WallPolygonInput[] = walls.map((wall) => ({
    ...wall,
    a: quantizePoint(wall.a),
    b: quantizePoint(wall.b),
    thickness: Math.max(QUANTIZE_CM, quantize(wall.thickness)),
  }))

  const adj = buildAdjacency(quantized)
  const wallById = new Map(quantized.map((wall) => [wall.id, wall]))
  const snappedWalls: WallPolygonInput[] = quantized
    .map((wall) => ({
      ...wall,
      a: quantizePoint(junctionPoint(endpointKey(wall.a), adj, wallById)),
      b: quantizePoint(junctionPoint(endpointKey(wall.b), adj, wallById)),
    }))
    .filter((wall) => distance(wall.a, wall.b) >= MIN_WALL_LENGTH_CM)

  if (snappedWalls.length === 0) {
    return { fillComponents: [], wallPolygons: [] }
  }

  const snappedById = new Map(snappedWalls.map((wall) => [wall.id, wall]))
  const snappedAdj = buildAdjacency(snappedWalls)

  const wallPolygons: WallPolygon[] = snappedWalls.map((wall) => ({
    id: wall.id,
    points: buildWallRectPolygon(wall, snappedAdj, snappedById, snappedWalls).map(quantizePoint),
  }))

  const fillComponents = unionWallRects(wallPolygons.map((polygon) => polygon.points))
  return { fillComponents, wallPolygons }
}

function wallFillComponentToPathData(component: WallFillComponent): string {
  const parts: string[] = []
  for (const ring of component.rings) {
    if (ring.length < 3) continue
    const first = ring[0]
    let d = `M ${first.x} ${first.y}`
    for (let i = 1; i < ring.length; i += 1) {
      const p = ring[i]
      d += ` L ${p.x} ${p.y}`
    }
    d += ' Z'
    parts.push(d)
  }
  return parts.join(' ')
}

export function wallFillComponentsToPathData(components: WallFillComponent[]): string {
  return components.map(wallFillComponentToPathData).filter(Boolean).join(' ')
}

export function pointInFillComponents(point: Point2D, components: WallFillComponent[]): boolean {
  for (const component of components) {
    let inside = false
    for (const ring of component.rings) {
      if (pointInRing(point, ring)) inside = !inside
    }
    if (inside) return true
  }
  return false
}

function pointInRing(point: Point2D, ring: Point2D[]): boolean {
  const pts = ensureClosedRing(ring)
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const a = pts[i]
    const b = pts[j]
    const intersect =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + 1e-15) + a.x
    if (intersect) inside = !inside
  }
  return inside
}

export function maxFillVertexDistanceFromWallEnds(
  components: WallFillComponent[],
  walls: WallPolygonInput[],
): number {
  let maxDist = 0
  for (const component of components) {
    for (const ring of component.rings) {
      for (const point of ring) {
        let nearest = Infinity
        for (const wall of walls) {
          nearest = Math.min(nearest, distance(point, wall.a), distance(point, wall.b))
        }
        maxDist = Math.max(maxDist, nearest)
      }
    }
  }
  return maxDist
}
