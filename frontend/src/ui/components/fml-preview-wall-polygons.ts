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

function dirsAreOpposite(a: Point2D, b: Point2D): boolean {
  const cross = a.x * b.y - a.y * b.x
  const dot = a.x * b.x + a.y * b.y
  return Math.abs(cross) < FLAT_TURN_CROSS && dot < 0
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

  const into = intoWallFromEnd(wall, end)
  const neighborDirs = neighbors.map((entry) => ({
    ...entry,
    dir: intoWallFromEnd(entry.wall, entry.end),
  }))

  const continues = neighborDirs.some((entry) => dirsAreOpposite(into, entry.dir))
  let throughHost: WallPolygonInput | null = null
  for (let i = 0; i < neighborDirs.length; i += 1) {
    for (let j = i + 1; j < neighborDirs.length; j += 1) {
      if (dirsAreOpposite(neighborDirs[i].dir, neighborDirs[j].dir)) {
        throughHost = neighborDirs[i].wall
        break
      }
    }
    if (throughHost) break
  }

  // T-tak in een doorgaande muur (geen tegenoverliggende voortzetting):
  // stop op de nabije host-face, niet erdoorheen (anders kove-dicht).
  if (throughHost && !continues) {
    return nearHostFaceCorners(wall, end, throughHost)
  }

  // L (één buur): binnen- + buitenmiter.
  if (neighbors.length === 1) {
    const junction = pointAtEnd(wall, end)
    const maxMiter =
      Math.max(wall.thickness, neighbors[0].wall.thickness) * MAX_MITER_THICKNESS_FACTOR
    const other = neighbors[0]
    const otherDir = neighborDirs[0].dir
    const inner = sectorCorner(junction, wall, into, other.wall, otherDir, maxMiter)
    const outer = sectorCorner(junction, wall, into, other.wall, otherDir, maxMiter, true)
    if (!inner || !outer) return null
    return assignLeftRight(wall, end, inner, outer, maxMiter)
  }

  // + / Y / doorgaande as: square-cap vult het knooppunt (geen sector-gat).
  return null
}

function segmentsProperIntersect(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
  const o1 = Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y))
  const o2 = Math.sign((b.y - a.y) * (d.x - b.x) - (b.x - a.x) * (d.y - b.y))
  const o3 = Math.sign((d.y - c.y) * (a.x - d.x) - (d.x - c.x) * (a.y - d.y))
  const o4 = Math.sign((d.y - c.y) * (b.x - d.x) - (d.x - c.x) * (b.y - d.y))
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4
}

function isBowtieQuad(points: Point2D[]): boolean {
  if (points.length !== 4) return false
  return (
    segmentsProperIntersect(points[0], points[1], points[2], points[3]) ||
    segmentsProperIntersect(points[1], points[2], points[3], points[0])
  )
}

function endCorners(
  wall: WallPolygonInput,
  end: 'a' | 'b',
  adj: Map<string, Array<{ wallId: string; end: 'a' | 'b' }>>,
  wallById: Map<string, WallPolygonInput>,
  walls: WallPolygonInput[],
): { left: Point2D; right: Point2D } {
  const neighbors = neighborsAtEnd(wall, end, adj, wallById)
  const hosts = neighbors.length > 0 ? [] : findMidspanHosts(wall, end, walls)
  const mitered = tryMiterEndCorners(wall, end, neighbors, hosts)
  return mitered ?? squareCapCorners(wall, end, adj, wallById, walls)
}

function squareCapCorners(
  wall: WallPolygonInput,
  end: 'a' | 'b',
  adj: Map<string, Array<{ wallId: string; end: 'a' | 'b' }>>,
  wallById: Map<string, WallPolygonInput>,
  walls: WallPolygonInput[],
): { left: Point2D; right: Point2D } {
  const len = distance(wall.a, wall.b)
  const maxExtend = Math.max(0, len * 0.45)
  const extend = Math.min(resolveEndExtendCm(wall, end, adj, wallById, walls), maxExtend)
  return squareEndCorners(wall, end, extend)
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
  if (!isBowtieQuad(points)) return points

  const squareA = squareCapCorners(wall, 'a', adj, wallById, walls)
  const squareB = squareCapCorners(wall, 'b', adj, wallById, walls)
  const fallback = [squareA.left, squareB.left, squareB.right, squareA.right]
  if (ringArea(fallback) < 0) fallback.reverse()
  return fallback
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

// --- Architect outlines (union rings → opening punch → drop sill/jamb) ---

/** Opening punch/drop input (cm along wall axis via `t` + `width`). */
export interface WallOutlineOpeningInput {
  wallId: string
  t: number
  width: number
  /** Deur: jamb-edges droppen (glyph heeft end-caps). Raam: jambs behouden. */
  type?: 'door' | 'window'
}

export type WallOutlinePolyline = Point2D[]

/** Midpoint of an edge within this of a sill/jamb → drop (opening glyph closes). */
const OPENING_EDGE_DROP_EPS_CM = 0.15
/** Punch slightly past faces so difference cuts through instead of islanding. */
const OPENING_PUNCH_SEAL_CM = UNION_SEAL_CM + 0.02

type OpeningSide = { a: Point2D; b: Point2D }

function resolveDifferenceFn(): typeof polygonClipping.difference {
  const mod = polygonClipping as unknown as {
    difference?: typeof polygonClipping.difference
    default?: { difference?: typeof polygonClipping.difference }
  }
  const fn = mod.difference ?? mod.default?.difference
  if (typeof fn !== 'function') {
    throw new Error('polygon-clipping.difference is not available')
  }
  return fn.bind(mod.default ?? mod)
}

function lerpPoint(a: Point2D, b: Point2D, t: number): Point2D {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function wallAxisLength(wall: WallPolygonInput): number {
  return distance(wall.a, wall.b)
}

/** Face corners of an opening at axis-t span (no seal). */
function openingFaceCorners(
  wall: WallPolygonInput,
  t0: number,
  t1: number,
): { left0: Point2D; left1: Point2D; right0: Point2D; right1: Point2D } | null {
  const faces = wallFaces(wall)
  return {
    left0: lerpPoint(faces.left.a, faces.left.b, t0),
    left1: lerpPoint(faces.left.a, faces.left.b, t1),
    right0: lerpPoint(faces.right.a, faces.right.b, t0),
    right1: lerpPoint(faces.right.a, faces.right.b, t1),
  }
}

function openingAxisSpan(
  wall: WallPolygonInput,
  opening: Pick<WallOutlineOpeningInput, 't' | 'width'>,
): { t0: number; t1: number } | null {
  const len = wallAxisLength(wall)
  if (len < MIN_WALL_LENGTH_CM || !(opening.width > 0)) return null
  const half = opening.width / 2 / len
  return { t0: opening.t - half, t1: opening.t + half }
}

/** Balance-aware punch rect (slightly past faces). */
function openingPunchRect(
  wall: WallPolygonInput,
  opening: WallOutlineOpeningInput,
): Point2D[] | null {
  const span = openingAxisSpan(wall, opening)
  if (!span) return null
  const corners = openingFaceCorners(wall, span.t0, span.t1)
  if (!corners) return null
  const n = leftNormal(alongWallDir(wall))
  const seal = OPENING_PUNCH_SEAL_CM
  return [
    add(corners.left0, scale(n, seal)),
    add(corners.left1, scale(n, seal)),
    add(corners.right1, scale(n, -seal)),
    add(corners.right0, scale(n, -seal)),
  ].map(quantizePoint)
}

function openingDropSides(wall: WallPolygonInput, opening: WallOutlineOpeningInput): OpeningSide[] {
  const span = openingAxisSpan(wall, opening)
  if (!span) return []
  const corners = openingFaceCorners(wall, span.t0, span.t1)
  if (!corners) return []
  // Altijd sill (langs-faces) droppen — glyph tekent die.
  const sides: OpeningSide[] = [
    { a: corners.left0, b: corners.left1 },
    { a: corners.right0, b: corners.right1 },
  ]
  // Deur heeft end-caps in 2D-glyph; raam niet → muur-jambs behouden.
  if (opening.type !== 'window') {
    sides.push({ a: corners.left0, b: corners.right0 }, { a: corners.left1, b: corners.right1 })
  }
  return sides
}

function componentsToMultiPolygon(components: WallFillComponent[]): [number, number][][][] {
  const out: [number, number][][][] = []
  for (const component of components) {
    const rings: [number, number][][] = []
    for (const ring of component.rings) {
      const clipped = toClippingRing(ring)
      if (clipped.length >= 4) rings.push(clipped)
    }
    if (rings.length > 0) out.push(rings)
  }
  return out
}

function multiPolygonToComponents(multi: [number, number][][][]): WallFillComponent[] {
  return multi.map((polygon) => ({
    rings: polygon.map((ring) => fromClippingRing(ring)),
  }))
}

function punchOpeningsFromComponents(
  components: WallFillComponent[],
  wallsById: Map<string, WallPolygonInput>,
  openings: WallOutlineOpeningInput[],
): WallFillComponent[] {
  if (components.length === 0 || openings.length === 0) return components

  const punches: Point2D[][] = []
  for (const opening of openings) {
    const wall = wallsById.get(opening.wallId)
    if (!wall) continue
    const rect = openingPunchRect(wall, opening)
    if (rect && rect.length >= 3) punches.push(rect)
  }
  if (punches.length === 0) return components

  const difference = resolveDifferenceFn()
  let acc = componentsToMultiPolygon(components)
  if (acc.length === 0) return components

  for (const punch of punches) {
    const geom = toUnionGeom(punch)
    if (!geom) continue
    acc = difference(acc, geom)
  }

  if (acc.length === 0) return []
  return multiPolygonToComponents(acc)
}

function distPointToSegment(point: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-18) return distance(point, a)
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return distance(point, { x: a.x + dx * t, y: a.y + dy * t })
}

function edgeNearAnySide(a: Point2D, b: Point2D, sides: OpeningSide[], eps: number): boolean {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  for (const side of sides) {
    if (distPointToSegment(mid, side.a, side.b) <= eps) return true
  }
  return false
}

type OutlineEdge = { a: Point2D; b: Point2D }

function ringToEdges(ring: Point2D[]): OutlineEdge[] {
  // ensureClosedRing returns an *open* ring (no duplicate close).
  const open = ensureClosedRing(ring)
  if (open.length < 2) return []
  const edges: OutlineEdge[] = []
  for (let i = 0; i < open.length; i += 1) {
    const a = open[i]
    const b = open[(i + 1) % open.length]
    if (distance(a, b) < QUANTIZE_CM * 0.5) continue
    edges.push({ a, b })
  }
  return edges
}

function pointKey(point: Point2D): string {
  return `${quantize(point.x)},${quantize(point.y)}`
}

/** Chain remaining edges into open polylines (shared endpoints). */
function chainEdgesToPolylines(edges: OutlineEdge[]): WallOutlinePolyline[] {
  if (edges.length === 0) return []

  type Node = { point: Point2D; edgeIndexes: number[] }
  const nodes = new Map<string, Node>()
  const ensure = (point: Point2D): Node => {
    const key = pointKey(point)
    let node = nodes.get(key)
    if (!node) {
      node = { point: quantizePoint(point), edgeIndexes: [] }
      nodes.set(key, node)
    }
    return node
  }

  edges.forEach((edge, index) => {
    ensure(edge.a).edgeIndexes.push(index)
    ensure(edge.b).edgeIndexes.push(index)
  })

  const used = new Set<number>()
  const polylines: WallOutlinePolyline[] = []

  const otherEnd = (edge: OutlineEdge, from: Point2D): Point2D =>
    pointKey(edge.a) === pointKey(from) ? edge.b : edge.a

  const walk = (startEdgeIndex: number, startPoint: Point2D): Point2D[] => {
    const chain: Point2D[] = [quantizePoint(startPoint)]
    let edgeIndex = startEdgeIndex
    let from = startPoint
    while (edgeIndex >= 0 && !used.has(edgeIndex)) {
      used.add(edgeIndex)
      const edge = edges[edgeIndex]
      const next = otherEnd(edge, from)
      chain.push(quantizePoint(next))
      from = next
      const node = nodes.get(pointKey(from))
      if (!node) break
      const nextEdge = node.edgeIndexes.find((idx) => !used.has(idx))
      edgeIndex = nextEdge ?? -1
    }
    return chain
  }

  // Prefer degree-1 starts so open chains are complete; then leftovers (loops).
  const degreeOneStarts: Array<{ edgeIndex: number; start: Point2D }> = []
  for (const node of nodes.values()) {
    if (node.edgeIndexes.length !== 1) continue
    degreeOneStarts.push({ edgeIndex: node.edgeIndexes[0], start: node.point })
  }
  for (const { edgeIndex, start } of degreeOneStarts) {
    if (used.has(edgeIndex)) continue
    const chain = walk(edgeIndex, start)
    if (chain.length >= 2) polylines.push(chain)
  }

  for (let i = 0; i < edges.length; i += 1) {
    if (used.has(i)) continue
    const chain = walk(i, edges[i].a)
    if (chain.length >= 2) polylines.push(chain)
  }

  return polylines
}

function dropOpeningSidesFromComponents(
  components: WallFillComponent[],
  wallsById: Map<string, WallPolygonInput>,
  openings: WallOutlineOpeningInput[],
): WallOutlinePolyline[] {
  const sides: OpeningSide[] = []
  for (const opening of openings) {
    const wall = wallsById.get(opening.wallId)
    if (!wall) continue
    sides.push(...openingDropSides(wall, opening))
  }

  const kept: OutlineEdge[] = []
  for (const component of components) {
    for (const ring of component.rings) {
      for (const edge of ringToEdges(ring)) {
        if (sides.length > 0 && edgeNearAnySide(edge.a, edge.b, sides, OPENING_EDGE_DROP_EPS_CM)) {
          continue
        }
        kept.push(edge)
      }
    }
  }
  return chainEdgesToPolylines(kept)
}

/**
 * Architect-mode wall outlines in cm: mitered union rings, openings punched
 * through, sill/jamb edges dropped so opening glyphs close the gap.
 */
export function buildWallOutlinePolylines(
  walls: WallPolygonInput[],
  openings: WallOutlineOpeningInput[] = [],
): WallOutlinePolyline[] {
  if (walls.length === 0) return []

  const geometry = buildWallRenderGeometry(walls)
  if (geometry.fillComponents.length === 0) return []

  const wallsById = new Map<string, WallPolygonInput>()
  for (const wall of walls) {
    wallsById.set(wall.id, {
      id: wall.id,
      a: quantizePoint(wall.a),
      b: quantizePoint(wall.b),
      thickness: Math.max(QUANTIZE_CM, quantize(wall.thickness)),
      balance: wall.balance,
    })
  }

  const punched = punchOpeningsFromComponents(geometry.fillComponents, wallsById, openings)
  if (punched.length === 0) return []

  return dropOpeningSidesFromComponents(punched, wallsById, openings)
}
