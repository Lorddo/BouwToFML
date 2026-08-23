import polygonClipping from 'polygon-clipping'
import {
  clampWallBalance,
  floorplannerLeftNormal,
  wallFaces,
  wallJoinFaceCorner,
} from '@/core/fml/fml-wall-geom'
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
/** Tiny overlap past a miter so clipper union seals without bloating faces. */
const UNION_SEAL_CM = 0.05
/** Nearly-collinear join: skip miter (otherwise a spike). */
const FLAT_TURN_CROSS = 0.035
/** Miter farther than this × thickness falls back to a square cap. */
const MAX_MITER_THICKNESS_FACTOR = 4
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
): Array<{ wall: WallPolygonInput; end: 'a' | 'b' }> {
  const key = endpointKey(pointAtEnd(wall, end))
  const entries = adj.get(key) ?? []
  const out: Array<{ wall: WallPolygonInput; end: 'a' | 'b' }> = []
  for (const entry of entries) {
    if (entry.wallId === wall.id) continue
    const other = wallById.get(entry.wallId)
    if (other) out.push({ wall: other, end: entry.end })
  }
  return out
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

/** Join-cap overlap: miter is exact; this is only the square-cap fallback. */
function joinExtendCm(needed: number): number {
  return Math.max(0, needed) + UNION_SEAL_CM
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
    const needed = Math.max(...neighbors.map((entry) => extentAlongDirection(entry.wall, out)))
    return joinExtendCm(needed)
  }

  const hosts = findMidspanHosts(wall, end, walls)
  if (hosts.length > 0) {
    const needed = Math.max(...hosts.map((host) => extentAlongDirection(host, out)))
    return joinExtendCm(needed)
  }

  return Math.max(wall.thickness * END_EXTEND_FACTOR, UNION_SEAL_CM)
}

function intoWallFromEnd(wall: WallPolygonInput, end: 'a' | 'b'): Point2D {
  const along = alongWallDir(wall)
  return end === 'a' ? along : scale(along, -1)
}

function intersectFaceLines(
  a: { a: Point2D; b: Point2D },
  b: { a: Point2D; b: Point2D },
): Point2D | null {
  const dax = a.b.x - a.a.x
  const day = a.b.y - a.a.y
  const dbx = b.b.x - b.a.x
  const dby = b.b.y - b.a.y
  const denom = dax * dby - day * dbx
  if (Math.abs(denom) < 1e-9) return null
  const t = ((b.a.x - a.a.x) * dby - (b.a.y - a.a.y) * dbx) / denom
  if (!Number.isFinite(t)) return null
  return { x: a.a.x + dax * t, y: a.a.y + day * t }
}

function squareEndCorners(
  wall: WallPolygonInput,
  end: 'a' | 'b',
  extendCm: number,
): { left: Point2D; right: Point2D } {
  const along = alongWallDir(wall)
  const n = leftNormal(along)
  const extents = resolveWallExtents(wall)
  const origin = add(pointAtEnd(wall, end), scale(along, end === 'a' ? -extendCm : extendCm))
  return {
    left: add(origin, scale(n, extents.plus)),
    right: add(origin, scale(n, -extents.minus)),
  }
}

function assignLeftRight(
  wall: WallPolygonInput,
  end: 'a' | 'b',
  c1: Point2D,
  c2: Point2D,
  maxMiter: number,
): { left: Point2D; right: Point2D } | null {
  const junction = pointAtEnd(wall, end)
  if (distance(c1, junction) > maxMiter || distance(c2, junction) > maxMiter) return null
  const faces = wallFaces(wall)
  const originL = end === 'a' ? faces.left.a : faces.left.b
  const originR = end === 'a' ? faces.right.a : faces.right.b
  if (
    distance(c1, originL) + distance(c2, originR) <=
    distance(c1, originR) + distance(c2, originL)
  ) {
    return { left: c1, right: c2 }
  }
  return { left: c2, right: c1 }
}

function nearHostFaceCorners(
  wall: WallPolygonInput,
  end: 'a' | 'b',
  host: WallPolygonInput,
): { left: Point2D; right: Point2D } | null {
  const out = endOutDir(wall, end)
  const hostFaces = wallFaces(host)
  const n = leftNormal(alongWallDir(host))
  const near = n.x * out.x + n.y * out.y >= 0 ? hostFaces.left : hostFaces.right
  const self = wallFaces(wall)
  const left = intersectFaceLines(self.left, near)
  const right = intersectFaceLines(self.right, near)
  if (!left || !right) return null
  const maxMiter = Math.max(wall.thickness, host.thickness) * MAX_MITER_THICKNESS_FACTOR
  const junction = pointAtEnd(wall, end)
  if (distance(left, junction) > maxMiter || distance(right, junction) > maxMiter) return null
  return { left, right }
}

function sectorCorner(
  junction: Point2D,
  wall: WallPolygonInput,
  into: Point2D,
  other: WallPolygonInput,
  otherDir: Point2D,
  maxMiter: number,
  opposite = false,
): Point2D | null {
  const cross = into.x * otherDir.y - into.y * otherDir.x
  const dot = into.x * otherDir.x + into.y * otherDir.y
  if (Math.abs(cross) < FLAT_TURN_CROSS && dot < 0) return null
  const hit = wallJoinFaceCorner(junction, wall, into, other, otherDir, opposite)
  if (!hit || distance(hit, junction) > maxMiter) return null
  return hit
}

function tryMiterEndCorners(
  wall: WallPolygonInput,
  end: 'a' | 'b',
  neighbors: Array<{ wall: WallPolygonInput; end: 'a' | 'b' }>,
  hosts: WallPolygonInput[],
): { left: Point2D; right: Point2D } | null {
  if (neighbors.length === 0 && hosts.length > 0) {
    return nearHostFaceCorners(wall, end, hosts[0])
  }
  if (neighbors.length === 0) return null

  const junction = pointAtEnd(wall, end)
  const into = intoWallFromEnd(wall, end)
  const maxMiter =
    Math.max(wall.thickness, ...neighbors.map((entry) => entry.wall.thickness)) *
    MAX_MITER_THICKNESS_FACTOR

  if (neighbors.length === 1) {
    const other = neighbors[0]
    const otherDir = intoWallFromEnd(other.wall, other.end)
    const inner = sectorCorner(junction, wall, into, other.wall, otherDir, maxMiter)
    const outer = sectorCorner(junction, wall, into, other.wall, otherDir, maxMiter, true)
    if (!inner || !outer) return null
    return assignLeftRight(wall, end, inner, outer, maxMiter)
  }

  const arms = [
    { wall, dir: into, id: wall.id },
    ...neighbors.map((entry) => ({
      wall: entry.wall,
      dir: intoWallFromEnd(entry.wall, entry.end),
      id: entry.wall.id,
    })),
  ]
  arms.sort(
    (a, b) =>
      Math.atan2(a.dir.y, a.dir.x) - Math.atan2(b.dir.y, b.dir.x) || a.id.localeCompare(b.id),
  )
  const index = arms.findIndex((arm) => arm.id === wall.id)
  if (index < 0) return null
  const prev = arms[(index - 1 + arms.length) % arms.length]
  const next = arms[(index + 1) % arms.length]
  const cPrev = sectorCorner(junction, wall, into, prev.wall, prev.dir, maxMiter)
  const cNext = sectorCorner(junction, wall, into, next.wall, next.dir, maxMiter)
  if (cPrev && cNext) return assignLeftRight(wall, end, cPrev, cNext, maxMiter)
  return null
}

function endCorners(
  wall: WallPolygonInput,
  end: 'a' | 'b',
  adj: Map<string, Array<{ wallId: string; end: 'a' | 'b' }>>,
  wallById: Map<string, WallPolygonInput>,
  walls: WallPolygonInput[],
): { left: Point2D; right: Point2D } {
  const len = distance(wall.a, wall.b)
  const maxExtend = Math.max(0, len * 0.45)
  const extend = Math.min(resolveEndExtendCm(wall, end, adj, wallById, walls), maxExtend)
  const square = squareEndCorners(wall, end, extend)
  const neighbors = neighborsAtEnd(wall, end, adj, wallById)
  const hosts = neighbors.length > 0 ? [] : findMidspanHosts(wall, end, walls)
  const mitered = tryMiterEndCorners(wall, end, neighbors, hosts)
  return mitered ?? square
}

/**
 * Oriented body along the Floorplanner axis. Joined ends use face-miters
 * (same join-corner as schuine hoeken); free ends stay square caps.
 */
function buildWallRectPolygon(
  wall: WallPolygonInput,
  adj: Map<string, Array<{ wallId: string; end: 'a' | 'b' }>>,
  wallById: Map<string, WallPolygonInput>,
  walls: WallPolygonInput[],
): Point2D[] {
  const a = endCorners(wall, 'a', adj, wallById, walls)
  const b = endCorners(wall, 'b', adj, wallById, walls)
  const points = [a.left, b.left, b.right, a.right]
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
  const ring = toClippingRing(points)
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
 * Per-wall bodies (mitered joins, square free ends) + boolean-union fill.
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
