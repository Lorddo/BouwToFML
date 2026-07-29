import type { Point2D, Wall } from '@/core/fml/types'

const JUNCTION_SNAP_CM = 2
const JUNCTION_MERGE_CM = 3
export const ENDPOINT_SNAP_RADIUS_CM = 3

export const BALANCE_MIN = 0.25
export const BALANCE_MAX = 0.8
export const BALANCE_DEFAULT = 0.5

export const COLLINEAR_DOT_THRESHOLD = 0.99
export const WALL_AXIS_EPS_CM = 0.5

export const MIN_CONNECTOR_LENGTH_CM = 0.5
export const MIN_WALL_LENGTH_CM = 4
export const MIN_SPLIT_SEGMENT_CM = 4
export const ROOM_CORNER_ENDPOINT_EPS_T = 1e-3
export const SEGMENT_POINT_EPS_CM = 0.05
export const SEGMENT_PARAM_EPS = 1e-4

export interface WallEndRef {
  wallId: string
  end: 'a' | 'b'
}

export interface JunctionNode {
  id: string
  x: number
  y: number
  refs: WallEndRef[]
}

export interface SplitWallResult {
  walls: Wall[]
  junctionId: string
  firstWallId: string
  secondWallId: string
}

export interface WallPointMatch {
  wallId: string
  wall: Wall
  t: number
  projected: Point2D
  distanceCm: number
}

function junctionKey(point: Point2D, epsCm = JUNCTION_SNAP_CM): string {
  const q = 1 / epsCm
  return `${Math.round(point.x * q)},${Math.round(point.y * q)}`
}

export function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function cloneWalls(walls: Wall[]): Wall[] {
  return walls.map((wall) => ({
    ...wall,
    a: { ...wall.a },
    b: { ...wall.b },
    openings: wall.openings.map((opening) => ({ ...opening })),
  }))
}

export function pruneCollapsedWalls(walls: Wall[]): Wall[] {
  return walls.filter((wall) => distance(wall.a, wall.b) > 0.5)
}

export function refKey(ref: WallEndRef): string {
  return `${ref.wallId}:${ref.end}`
}

export function normalizeDir(v: Point2D): Point2D {
  const len = Math.hypot(v.x, v.y)
  if (len < 1e-9) return { x: 1, y: 0 }
  return { x: v.x / len, y: v.y / len }
}

export function samePoint(a: Point2D, b: Point2D, epsCm = SEGMENT_POINT_EPS_CM): boolean {
  return Math.abs(a.x - b.x) <= epsCm && Math.abs(a.y - b.y) <= epsCm
}

export function pointAtT(a: Point2D, b: Point2D, t: number): Point2D {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }
}

export function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx
}

/** Internal helper shared by slide + draw-geom; not part of public barrel API. */
export function pointParamOnSegment(
  a: Point2D,
  b: Point2D,
  point: Point2D,
  epsCm = 0.05,
): number | null {
  const ab = { x: b.x - a.x, y: b.y - a.y }
  const lenSq = ab.x * ab.x + ab.y * ab.y
  if (lenSq < 1e-9) return null
  const t = ((point.x - a.x) * ab.x + (point.y - a.y) * ab.y) / lenSq
  if (t < -epsCm || t > 1 + epsCm) return null
  const projection = { x: a.x + t * ab.x, y: a.y + t * ab.y }
  if (distance(point, projection) > epsCm) return null
  return Math.max(0, Math.min(1, t))
}

/** Shared by slide + draw-geom; public via barrel (historically on junctions module). */
export function splitWallAtPoint(
  walls: Wall[],
  wall: Wall,
  splitPoint: Point2D,
  tSplit: number,
): boolean {
  if (tSplit <= 1e-6 || tSplit >= 1 - 1e-6) return false
  const wallIndex = walls.findIndex((item) => item.id === wall.id)
  if (wallIndex < 0) return false

  const firstOpenings = wall.openings
    .filter((opening) => opening.t <= tSplit)
    .map((opening) => ({ ...opening, t: tSplit > 1e-6 ? opening.t / tSplit : 0.5 }))
  const secondOpenings = wall.openings
    .filter((opening) => opening.t > tSplit)
    .map((opening) => ({ ...opening, t: (opening.t - tSplit) / (1 - tSplit) }))

  const firstWall: Wall = {
    ...wall,
    b: { x: splitPoint.x, y: splitPoint.y },
    openings: firstOpenings,
  }
  const secondWall: Wall = {
    ...wall,
    id: `split-host-${crypto.randomUUID().slice(0, 8)}`,
    a: { x: splitPoint.x, y: splitPoint.y },
    openings: secondOpenings,
  }

  walls.splice(wallIndex, 1, firstWall, secondWall)
  return true
}

export function stableJunctionId(refs: WallEndRef[]): string {
  return [...refs]
    .sort((a, b) => a.wallId.localeCompare(b.wallId) || a.end.localeCompare(b.end))
    .map((ref) => `${ref.wallId}:${ref.end}`)
    .join('|')
}

export function buildJunctions(walls: Wall[]): JunctionNode[] {
  const map = new Map<string, JunctionNode>()

  for (const wall of walls) {
    for (const end of ['a', 'b'] as const) {
      const point = wall[end]
      const key = junctionKey(point)
      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          id: '',
          x: point.x,
          y: point.y,
          refs: [{ wallId: wall.id, end }],
        })
        continue
      }
      existing.refs.push({ wallId: wall.id, end })
      existing.x = (existing.x * (existing.refs.length - 1) + point.x) / existing.refs.length
      existing.y = (existing.y * (existing.refs.length - 1) + point.y) / existing.refs.length
    }
  }

  return Array.from(map.values()).map((junction) => ({
    ...junction,
    id: stableJunctionId(junction.refs),
  }))
}

export function moveJunction(walls: Wall[], node: JunctionNode, position: Point2D): Wall[] {
  const next = cloneWalls(walls)
  for (const ref of node.refs) {
    const wall = next.find((item) => item.id === ref.wallId)
    if (!wall) continue
    wall[ref.end] = { ...position }
  }
  return pruneCollapsedWalls(next)
}

export function mergeJunctions(
  walls: Wall[],
  source: JunctionNode,
  target: JunctionNode,
): Wall[] {
  if (source.id === target.id) return walls
  let next = moveJunction(walls, source, { x: target.x, y: target.y })
  next = pruneCollapsedWalls(next)
  return next
}

export function findMergeTarget(
  junctions: JunctionNode[],
  sourceRefs: WallEndRef[],
  position: Point2D,
  mergeRadiusCm = JUNCTION_MERGE_CM,
): JunctionNode | null {
  const sourceId = stableJunctionId(sourceRefs)
  let best: JunctionNode | null = null
  let bestDist = mergeRadiusCm
  for (const junction of junctions) {
    if (junction.id === sourceId) continue
    const dist = distance(position, junction)
    if (dist <= bestDist) {
      best = junction
      bestDist = dist
    }
  }
  return best
}

export function junctionIdsForWall(wall: Wall, walls: Wall[]): [string, string] {
  const junctions = buildJunctions(walls)
  const findAt = (point: Point2D, end: 'a' | 'b'): string => {
    const byRef = junctions.find((junction) =>
      junction.refs.some((ref) => ref.wallId === wall.id && ref.end === end),
    )
    if (byRef) return byRef.id
    const byPoint = junctions.find((junction) => distance(junction, point) < JUNCTION_SNAP_CM + 0.01)
    if (byPoint) return byPoint.id
    return stableJunctionId([{ wallId: wall.id, end }])
  }

  return [findAt(wall.a, 'a'), findAt(wall.b, 'b')]
}
