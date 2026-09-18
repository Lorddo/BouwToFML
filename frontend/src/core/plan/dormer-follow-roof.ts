/**
 * Dakkapel: kindvlak ↔ randmuren in XY.
 * Vlak = buitenfaces; hartlijn van een wang blijft T/2 naar binnen.
 */
import {
  openingWorldCenter,
  reprojectWallOpenings,
  wallAxisPoint,
  wallDirectionUnit,
  wallFaces,
} from './plan-wall-geom'
import type { Floor, FloorSurface, Point2D, Wall } from './types'

const EDGE_BASE_SLACK_CM = 8
const UNIFORM_EPS_CM = 0.05
const PARALLEL_DOT = 0.85

function hypot2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

function distPointSeg(p: Point2D, a: Point2D, b: Point2D): { dist: number; t: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return { dist: hypot2(p.x, p.y, a.x, a.y), t: 0 }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return { dist: hypot2(p.x, p.y, a.x + t * dx, a.y + t * dy), t }
}

function distToPolyEdges(point: Point2D, poly: readonly Point2D[]): number {
  let best = Infinity
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) continue
    best = Math.min(best, distPointSeg(point, a, b).dist)
  }
  return best
}

function wallEdgeSlack(wall: Pick<Wall, 'thickness'>): number {
  const half = Number.isFinite(wall.thickness) ? Math.max(0, wall.thickness) * 0.5 : 0
  return EDGE_BASE_SLACK_CM + half
}

function wallOnPoly(wall: Pick<Wall, 'a' | 'b' | 'thickness'>, poly: readonly Point2D[]): boolean {
  if (poly.length < 3) return false
  const slack = wallEdgeSlack(wall)
  return distToPolyEdges(wall.a, poly) <= slack && distToPolyEdges(wall.b, poly) <= slack
}

/** Randmuur van dit kindvlak: role is optioneel (handmatig getekende kapel). */
export function isDormerAssemblyWall(
  wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'role'>,
  poly: readonly Point2D[],
): boolean {
  return wallOnPoly(wall, poly)
}

/** Ook nét van de rand geschoven (segment-sleep) zodat lassen nog kan. */
function isDormerWeldMember(
  wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'role'>,
  poly: readonly Point2D[],
): boolean {
  if (wallOnPoly(wall, poly)) return true
  if (wall.role !== 'dormer') return false
  const slack = wallEdgeSlack(wall) + 80
  return distToPolyEdges(wall.a, poly) <= slack || distToPolyEdges(wall.b, poly) <= slack
}

export function polyXyChanged(a: readonly Point2D[], b: readonly Point2D[]): boolean {
  if (a.length !== b.length) return true
  return a.some((p, i) => {
    const q = b[i]
    if (!q) return true
    return Math.abs(p.x - q.x) > UNIFORM_EPS_CM || Math.abs(p.y - q.y) > UNIFORM_EPS_CM
  })
}

function uniformDelta(oldPoly: readonly Point2D[], newPoly: readonly Point2D[]): Point2D | null {
  if (oldPoly.length !== newPoly.length || oldPoly.length === 0) return null
  const firstOld = oldPoly[0]
  const firstNew = newPoly[0]
  if (!firstOld || !firstNew) return null
  const dx = firstNew.x - firstOld.x
  const dy = firstNew.y - firstOld.y
  for (let i = 1; i < oldPoly.length; i += 1) {
    const o = oldPoly[i]
    const n = newPoly[i]
    if (!o || !n) return null
    if (Math.abs(n.x - o.x - dx) > UNIFORM_EPS_CM) return null
    if (Math.abs(n.y - o.y - dy) > UNIFORM_EPS_CM) return null
  }
  return { x: dx, y: dy }
}

function polyCentroid(poly: readonly Point2D[]): Point2D | null {
  if (poly.length < 3) return null
  let sx = 0
  let sy = 0
  for (const p of poly) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / poly.length, y: sy / poly.length }
}

function lineT(a: Point2D, b: Point2D, p: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return 0
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
}

function lerp(a: Point2D, b: Point2D, t: number): Point2D {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function insetEdgeToward(
  a: Point2D,
  b: Point2D,
  centroid: Point2D,
  insetCm: number,
): { a: Point2D; b: Point2D } | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }
  const leftX = dy / len
  const leftY = -dx / len
  const mx = (a.x + b.x) * 0.5
  const my = (a.y + b.y) * 0.5
  const inwardSign = Math.sign(leftX * (centroid.x - mx) + leftY * (centroid.y - my)) || 1
  const ux = leftX * inwardSign
  const uy = leftY * inwardSign
  return {
    a: { x: a.x + ux * insetCm, y: a.y + uy * insetCm },
    b: { x: b.x + ux * insetCm, y: b.y + uy * insetCm },
  }
}

function distToInfiniteLine(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return hypot2(p.x, p.y, a.x, a.y)
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len
}

function associateWallEdge(
  wall: Pick<Wall, 'a' | 'b' | 'thickness'>,
  poly: readonly Point2D[],
): { index: number; insetCm: number } | null {
  if (poly.length < 2) return null
  const centroid = polyCentroid(poly)
  if (!centroid) return null
  const mid = wallAxisPoint(wall, 0.5)
  const dir = wallDirectionUnit(wall)
  const slack = wallEdgeSlack(wall) + 4
  let best = -1
  let bestDist = Infinity
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) continue
    const edx = b.x - a.x
    const edy = b.y - a.y
    const elen = Math.hypot(edx, edy)
    if (elen < 1e-6) continue
    const parallel = Math.abs((dir.x * edx + dir.y * edy) / elen) >= PARALLEL_DOT
    if (!parallel) continue
    const dist = distToInfiniteLine(mid, a, b)
    if (dist >= bestDist || dist > slack) continue
    bestDist = dist
    best = i
  }
  if (best < 0) return null
  return { index: best, insetCm: bestDist }
}

function mapWallThroughPoly(wall: Wall, oldPoly: readonly Point2D[], newPoly: readonly Point2D[]): Wall | null {
  if (oldPoly.length !== newPoly.length || oldPoly.length < 3) return null
  const assoc = associateWallEdge(wall, oldPoly)
  if (!assoc) return null
  const oldA = oldPoly[assoc.index]
  const oldB = oldPoly[(assoc.index + 1) % oldPoly.length]
  const newA = newPoly[assoc.index]
  const newB = newPoly[(assoc.index + 1) % newPoly.length]
  if (!oldA || !oldB || !newA || !newB) return null
  const oldC = polyCentroid(oldPoly)
  const newC = polyCentroid(newPoly)
  if (!oldC || !newC) return null
  const oldAxis = insetEdgeToward(oldA, oldB, oldC, assoc.insetCm)
  const newAxis = insetEdgeToward(newA, newB, newC, assoc.insetCm)
  if (!oldAxis || !newAxis) return null
  const tA = lineT(oldAxis.a, oldAxis.b, wall.a)
  const tB = lineT(oldAxis.a, oldAxis.b, wall.b)
  const a = lerp(newAxis.a, newAxis.b, tA)
  const b = lerp(newAxis.a, newAxis.b, tB)
  if (hypot2(a.x, a.y, b.x, b.y) < 1) return null
  return withEnds(wall, a, b)
}

function withEnds(wall: Wall, a: Point2D, b: Point2D): Wall {
  if (hypot2(a.x, a.y, b.x, b.y) < 1) return wall
  const next: Wall = { ...wall, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }
  if (wall.openings.length === 0) return next
  const centers = wall.openings.map((opening) => openingWorldCenter(wall, opening.t))
  return { ...next, openings: reprojectWallOpenings(next, centers) }
}

function unboundedIntersection(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D,
): Point2D | null {
  const dax = a2.x - a1.x
  const day = a2.y - a1.y
  const dbx = b2.x - b1.x
  const dby = b2.y - b1.y
  const den = dax * dby - day * dbx
  if (Math.abs(den) < 1e-9) return null
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / den
  return { x: a1.x + dax * t, y: a1.y + day * t }
}

function closerEnd(wall: Pick<Wall, 'a' | 'b'>, point: Point2D): 'a' | 'b' {
  return hypot2(wall.a.x, wall.a.y, point.x, point.y) <= hypot2(wall.b.x, wall.b.y, point.x, point.y)
    ? 'a'
    : 'b'
}

/**
 * Kopse en wang delen weer één knoop: snijpunt van de hartlijnen.
 * Na dak-volgen of segment-sleep kunnen die einden anders uit elkaar lopen
 * (buitenface vs hartlijn).
 */
export function weldDormerAssemblyCorners(
  walls: readonly Wall[],
  poly: readonly Point2D[],
): Wall[] {
  const members = walls.filter((wall) => isDormerWeldMember(wall, poly))
  if (members.length < 2) return walls.slice()
  const byId = new Map(walls.map((wall) => [wall.id, wall]))
  let changed = false
  for (let i = 0; i < members.length; i += 1) {
    const wa = byId.get(members[i]!.id)
    if (!wa) continue
    for (let j = i + 1; j < members.length; j += 1) {
      const wb = byId.get(members[j]!.id)
      if (!wb) continue
      const hit = unboundedIntersection(wa.a, wa.b, wb.a, wb.b)
      if (!hit) continue
      const aEnd = closerEnd(wa, hit)
      const bEnd = closerEnd(wb, hit)
      const aDist = hypot2(wa[aEnd].x, wa[aEnd].y, hit.x, hit.y)
      const bDist = hypot2(wb[bEnd].x, wb[bEnd].y, hit.x, hit.y)
      const pair = hypot2(wa[aEnd].x, wa[aEnd].y, wb[bEnd].x, wb[bEnd].y)
      const slack = Math.max(wallEdgeSlack(wa), wallEdgeSlack(wb)) + 4
      if (Math.min(aDist, bDist, pair) > slack) continue
      const aOther = aEnd === 'a' ? wa.b : wa.a
      const bOther = bEnd === 'a' ? wb.b : wb.a
      if (hypot2(aOther.x, aOther.y, hit.x, hit.y) < 4) continue
      if (hypot2(bOther.x, bOther.y, hit.x, hit.y) < 4) continue
      if (aDist < UNIFORM_EPS_CM && bDist < UNIFORM_EPS_CM) continue
      const nextA = withEnds(
        wa,
        aEnd === 'a' ? hit : wa.a,
        aEnd === 'b' ? hit : wa.b,
      )
      const nextB = withEnds(
        wb,
        bEnd === 'a' ? hit : wb.a,
        bEnd === 'b' ? hit : wb.b,
      )
      byId.set(wa.id, nextA)
      byId.set(wb.id, nextB)
      changed = true
    }
  }
  if (!changed) return walls.slice()
  return walls.map((wall) => byId.get(wall.id) ?? wall)
}

export function syncDormerWallsToRoofPoly(
  walls: readonly Wall[],
  oldPoly: readonly Point2D[],
  newPoly: readonly Point2D[],
): Wall[] {
  if (!polyXyChanged(oldPoly, newPoly)) return walls.slice()
  const delta = uniformDelta(oldPoly, newPoly)
  let changed = false
  const next = walls.map((wall) => {
    if (!isDormerAssemblyWall(wall, oldPoly)) return wall
    if (delta) {
      if (Math.abs(delta.x) < UNIFORM_EPS_CM && Math.abs(delta.y) < UNIFORM_EPS_CM) return wall
      changed = true
      return withEnds(
        wall,
        { x: wall.a.x + delta.x, y: wall.a.y + delta.y },
        { x: wall.b.x + delta.x, y: wall.b.y + delta.y },
      )
    }
    const mapped = mapWallThroughPoly(wall, oldPoly, newPoly)
    if (!mapped) return wall
    if (
      Math.abs(mapped.a.x - wall.a.x) < UNIFORM_EPS_CM &&
      Math.abs(mapped.a.y - wall.a.y) < UNIFORM_EPS_CM &&
      Math.abs(mapped.b.x - wall.b.x) < UNIFORM_EPS_CM &&
      Math.abs(mapped.b.y - wall.b.y) < UNIFORM_EPS_CM
    ) {
      return wall
    }
    changed = true
    return mapped
  })
  const mapped = changed ? next : walls.slice()
  const welded = weldDormerAssemblyCorners(mapped, newPoly)
  const weldedChanged =
    welded.length !== mapped.length || welded.some((wall, i) => wall !== mapped[i])
  return weldedChanged || changed ? welded : walls.slice()
}

export function followDormerWallsOnFloor(
  floor: Floor,
  oldPoly: readonly Point2D[],
  newPoly: readonly Point2D[],
): Floor {
  const walls = syncDormerWallsToRoofPoly(floor.walls, oldPoly, newPoly)
  if (walls === floor.walls) return floor
  const same = walls.length === floor.walls.length && walls.every((w, i) => w === floor.walls[i])
  if (same) return floor
  return { ...floor, walls }
}

function outerFaceOfWall(
  wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>,
  centroid: Point2D,
): { a: Point2D; b: Point2D } {
  const faces = wallFaces(wall)
  const midL = {
    x: (faces.left.a.x + faces.left.b.x) * 0.5,
    y: (faces.left.a.y + faces.left.b.y) * 0.5,
  }
  const midR = {
    x: (faces.right.a.x + faces.right.b.x) * 0.5,
    y: (faces.right.a.y + faces.right.b.y) * 0.5,
  }
  const leftIn =
    (centroid.x - midL.x) * (centroid.x - midL.x) + (centroid.y - midL.y) * (centroid.y - midL.y)
  const rightIn =
    (centroid.x - midR.x) * (centroid.x - midR.x) + (centroid.y - midR.y) * (centroid.y - midR.y)
  return leftIn > rightIn ? faces.left : faces.right
}

function intervalOverlap(a0: number, a1: number, b0: number, b1: number): number {
  const lo = Math.max(Math.min(a0, a1), Math.min(b0, b1))
  const hi = Math.min(Math.max(a0, a1), Math.max(b0, b1))
  return Math.max(0, hi - lo)
}

/** Muur die deze poly-rand dekt — ook een lange gevel (einden mogen buiten het vlak). */
function findWallForPolyEdge(
  walls: readonly Wall[],
  edgeA: Point2D,
  edgeB: Point2D,
): Wall | null {
  const edgeLen = hypot2(edgeA.x, edgeA.y, edgeB.x, edgeB.y)
  if (edgeLen < 1e-6) return null
  const edgeU = {
    x: (edgeB.x - edgeA.x) / edgeLen,
    y: (edgeB.y - edgeA.y) / edgeLen,
  }
  let best: Wall | null = null
  let bestDist = Infinity
  let bestOverlap = 0
  for (const wall of walls) {
    const dir = wallDirectionUnit(wall)
    if (Math.abs(dir.x * edgeU.x + dir.y * edgeU.y) < PARALLEL_DOT) continue
    const dist = Math.max(
      distToInfiniteLine(wall.a, edgeA, edgeB),
      distToInfiniteLine(wall.b, edgeA, edgeB),
    )
    const slack = wallEdgeSlack(wall) + 4
    if (dist > slack) continue
    const overlap = intervalOverlap(
      lineT(edgeA, edgeB, wall.a),
      lineT(edgeA, edgeB, wall.b),
      0,
      1,
    )
    if (overlap < 0.05) continue
    if (dist < bestDist - 0.5 || (Math.abs(dist - bestDist) <= 0.5 && overlap > bestOverlap)) {
      best = wall
      bestDist = dist
      bestOverlap = overlap
    }
  }
  return best
}

function outerLineForPolyEdge(
  walls: readonly Wall[],
  edgeA: Point2D,
  edgeB: Point2D,
  centroid: Point2D,
): { a: Point2D; b: Point2D } {
  const wall = findWallForPolyEdge(walls, edgeA, edgeB)
  if (!wall) return { a: edgeA, b: edgeB }
  return outerFaceOfWall(wall, centroid)
}

function nearestZ(oldPoly: ReadonlyArray<Point2D & { z?: number }>, point: Point2D): number | undefined {
  let best: (Point2D & { z?: number }) | undefined
  let bestD = Infinity
  for (const q of oldPoly) {
    const d = hypot2(point.x, point.y, q.x, q.y)
    if (d < bestD) {
      bestD = d
      best = q
    }
  }
  return typeof best?.z === 'number' && Number.isFinite(best.z) ? best.z : undefined
}

export function dormerOuterPolyFromWalls(
  walls: readonly Wall[],
  surface: Pick<FloorSurface, 'poly'>,
): Point2D[] | null {
  const poly = surface.poly
  if (poly.length < 3) return null
  const centroid = polyCentroid(poly)
  if (!centroid) return null
  const n = poly.length
  const lines: Array<{ a: Point2D; b: Point2D }> = []
  for (let i = 0; i < n; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    if (!a || !b) return null
    lines.push(outerLineForPolyEdge(walls, a, b, centroid))
  }
  const next: Point2D[] = []
  for (let i = 0; i < n; i += 1) {
    const prev = lines[(i - 1 + n) % n]
    const curr = lines[i]
    const origin = poly[i]
    if (!prev || !curr || !origin) return null
    const hit = unboundedIntersection(prev.a, prev.b, curr.a, curr.b)
    next.push(hit ?? { x: origin.x, y: origin.y })
  }
  return next
}

/** Kindvlak-XY = buitenfaces van de randmuren. Z blijft van het oude vlak. */
export function syncDormerRoofPolysFromWalls(
  walls: readonly Wall[],
  surfaces: readonly FloorSurface[],
): FloorSurface[] | null {
  let changed = false
  const next = surfaces.map((surface) => {
    if (surface.roofKind !== 'dormer') return surface
    const outer = dormerOuterPolyFromWalls(walls, surface)
    if (!outer || !polyXyChanged(surface.poly, outer)) return surface
    changed = true
    return {
      ...surface,
      poly: outer.map((p) => {
        const z = nearestZ(surface.poly, p)
        return z == null ? { x: p.x, y: p.y } : { x: p.x, y: p.y, z }
      }),
    }
  })
  return changed ? next : null
}
