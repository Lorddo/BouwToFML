import polygonClipping from 'polygon-clipping'
import { wallFaces } from '@/core/plan/plan-wall-geom'
import type { Point2D } from '@/core/plan/types'
import {
  MIN_WALL_LENGTH_CM,
  QUANTIZE_CM,
  UNION_SEAL_CM,
  add,
  alongWallDir,
  buildWallRenderGeometry,
  distance,
  ensureClosedRing,
  fromClippingRing,
  leftNormal,
  quantize,
  quantizePoint,
  scale,
  toClippingRing,
  toUnionGeom,
} from '@/core/plan/wall-render-geometry'
import type {
  WallFillComponent,
  WallOutlineOpeningInput,
  WallOutlinePolyline,
  WallPolygonInput,
} from '@/core/plan/wall-render-types'

export type {
  WallOutlineOpeningInput,
  WallOutlinePolyline,
} from '@/core/plan/wall-render-types'

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
