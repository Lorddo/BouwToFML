/**
 * Hit-test, snap en split-preview voor gevel-aanzicht.
 */
import {
  compareElevationPainter,
  ELEVATION_SAME_PLANE_CM,
  elevationWallYsAtX,
  type ElevationBand,
  type ElevationJunction,
  type ElevationOpeningRect,
  type ElevationRect,
  type ElevationRoofPlane,
  type ElevationWallRect,
  type FacadeElevation,
} from './facade-elevation'
import type { Point2D } from './types'

const DEPTH_OCCLUDE_MIN_CM = ELEVATION_SAME_PLANE_CM

export const ELEVATION_JUNCTION_HIT_CM = 8
export const ELEVATION_ROOF_VERTEX_HIT_CM = 12
export const ELEVATION_ROOF_Z_SNAP_CM = 8
export const ELEVATION_SPLIT_SNAP_CM = 8
const ELEVATION_ROOF_EDGE_HIT_CM = 6

export type ElevationOpeningPatch = {
  t: number
  width: number
  z: number
  z_height: number
}

export type ElevationSplitPreview = {
  wallId: string
  floorIndex: number
  x: number
  t: number
  y0: number
  y1: number
  snapped: boolean
}

function pointInElevationRect(rect: ElevationRect, point: Point2D): boolean {
  return point.x >= rect.x0 && point.x <= rect.x1 && point.y >= rect.y0 && point.y <= rect.y1
}

function hypot2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

function pointOnSeg(p: Point2D, a: Point2D, b: Point2D): { dist: number; t: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return { dist: hypot2(p.x, p.y, a.x, a.y), t: 0 }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return { dist: hypot2(p.x, p.y, a.x + dx * t, a.y + dy * t), t }
}

function pointOnWallElevation(wall: ElevationWallRect, point: Point2D): boolean {
  const ys = elevationWallYsAtX(wall, point.x)
  if (!ys) return false
  const lo = Math.min(ys.top, ys.bot)
  const hi = Math.max(ys.top, ys.bot)
  return point.y >= lo && point.y <= hi
}

export function hitElevationBand(
  elevation: FacadeElevation,
  point: Point2D,
  kind: ElevationBand['kind'] = 'slab',
): ElevationBand | null {
  for (let i = elevation.bands.length - 1; i >= 0; i -= 1) {
    const band = elevation.bands[i]
    if (!band || band.kind !== kind) continue
    if (point.x >= band.x0 && point.x <= band.x1 && point.y >= band.y0 && point.y <= band.y1) {
      return band
    }
  }
  return null
}

function wallOccludesElevationPoint(
  elevation: FacadeElevation,
  wall: ElevationWallRect,
  point: Point2D,
): boolean {
  if (!pointOnWallElevation(wall, point)) return false
  const mine = [...elevation.openings, ...elevation.transoms].filter(
    (rect) => rect.wallId === wall.wallId && rect.floorIndex === wall.floorIndex,
  )
  return !mine.some((rect) => pointInElevationRect(rect, point))
}

export function hitElevationOpening(
  elevation: FacadeElevation,
  point: Point2D,
): ElevationOpeningRect | null {
  const candidates: Array<{ rect: ElevationOpeningRect; transom: boolean }> = [
    ...elevation.transoms.map((rect) => ({ rect, transom: true })),
    ...elevation.openings.map((rect) => ({ rect, transom: false })),
  ].sort((a, b) => compareElevationPainter(b.rect, a.rect))
  for (const item of candidates) {
    if (!pointInElevationRect(item.rect, point)) continue
    const occluded = elevation.walls.some(
      (wall) =>
        wall.depthCm > item.rect.depthCm + DEPTH_OCCLUDE_MIN_CM &&
        wallOccludesElevationPoint(elevation, wall, point),
    )
    if (occluded) continue
    if (!item.transom) return item.rect
    return (
      elevation.openings.find((opening) => opening.openingId === item.rect.openingId) ?? item.rect
    )
  }
  return null
}

export function hitElevationWall(
  elevation: FacadeElevation,
  point: Point2D,
): ElevationWallRect | null {
  for (let i = elevation.walls.length - 1; i >= 0; i -= 1) {
    const rect = elevation.walls[i]
    if (!rect) continue
    if (pointOnWallElevation(rect, point)) return rect
  }
  return null
}

function overlapArea(a: ElevationRect, b: ElevationRect): number {
  const x0 = Math.max(Math.min(a.x0, a.x1), Math.min(b.x0, b.x1))
  const x1 = Math.min(Math.max(a.x0, a.x1), Math.max(b.x0, b.x1))
  const y0 = Math.max(Math.min(a.y0, a.y1), Math.min(b.y0, b.y1))
  const y1 = Math.min(Math.max(a.y0, a.y1), Math.max(b.y0, b.y1))
  const w = x1 - x0
  const h = y1 - y0
  if (w <= 0 || h <= 0) return 0
  return w * h
}

export function openingOverlapRatio(a: ElevationRect, b: ElevationRect): number {
  const areaA = Math.abs(a.x1 - a.x0) * Math.abs(a.y1 - a.y0)
  if (areaA < 1e-6) return 0
  return overlapArea(a, b) / areaA
}

/** AABB in elevatie-cm → opening-velden op de geraakte muur. */
export function openingPatchFromElevationRect(
  wall: ElevationWallRect,
  rect: ElevationRect,
  floorBaseWorldZ: number,
): ElevationOpeningPatch {
  const xSpan = wall.xb - wall.xa
  const xCenter = (rect.x0 + rect.x1) / 2
  const t = Math.abs(xSpan) < 1e-6 ? 0.5 : (xCenter - wall.xa) / xSpan
  const width = Math.max(1, Math.abs(rect.x1 - rect.x0))
  const zTop = -Math.min(rect.y0, rect.y1)
  const zBottom = -Math.max(rect.y0, rect.y1)
  const z = Math.max(0, zBottom - floorBaseWorldZ)
  const z_height = Math.max(1, zTop - zBottom)
  return {
    t: Number.isFinite(t) ? t : 0.5,
    width: Math.round(width),
    z: Math.round(z),
    z_height: Math.round(z_height),
  }
}

/** Hartlijn + binnen-/buitenkant voor snap tijdens opening-sleep. */
export function collectElevationWallSnapXs(walls: readonly ElevationWallRect[]): number[] {
  const xs: number[] = []
  for (const wall of walls) {
    if (wall.ridge) continue
    xs.push(wall.xa, wall.xb, wall.aTop.x, wall.bTop.x, wall.innerATop.x, wall.innerBTop.x)
  }
  return xs
}

/** Junction-X + andere hartlijn-einden; eigen uiteinden van het doel-segment niet. */
export function collectElevationSplitSnapXs(
  elevation: FacadeElevation,
  excludeWallId?: string,
): number[] {
  const excludeXs = new Set<number>()
  if (excludeWallId) {
    for (const wall of elevation.walls) {
      if (wall.wallId !== excludeWallId) continue
      excludeXs.add(Math.round(wall.xa * 2) / 2)
      excludeXs.add(Math.round(wall.xb * 2) / 2)
    }
  }
  const xs: number[] = []
  for (const junction of elevation.junctions) {
    if (excludeXs.has(Math.round(junction.x * 2) / 2)) continue
    xs.push(junction.x)
  }
  for (const wall of elevation.walls) {
    if (wall.wallId === excludeWallId) continue
    if (!excludeXs.has(Math.round(wall.xa * 2) / 2)) xs.push(wall.xa)
    if (!excludeXs.has(Math.round(wall.xb * 2) / 2)) xs.push(wall.xb)
  }
  return xs
}

function snapElevationScalar(
  value: number,
  candidates: readonly number[],
  slackCm: number,
): number {
  let best = value
  let bestDist = slackCm
  for (const candidate of candidates) {
    const dist = Math.abs(candidate - value)
    if (dist <= bestDist) {
      best = candidate
      bestDist = dist
    }
  }
  return best
}

export function elevationSplitPreviewAt(
  wall: ElevationWallRect,
  x: number,
  snapXs: readonly number[],
  slackCm = ELEVATION_SPLIT_SNAP_CM,
): ElevationSplitPreview {
  const lo = Math.min(wall.xa, wall.xb)
  const hi = Math.max(wall.xa, wall.xb)
  const inRange = snapXs.filter((candidate) => candidate >= lo && candidate <= hi)
  const snappedX = snapElevationScalar(x, inRange, slackCm)
  const clamped = Math.max(lo, Math.min(hi, snappedX))
  const xSpan = wall.xb - wall.xa
  const t = Math.abs(xSpan) < 1e-6 ? 0.5 : (clamped - wall.xa) / xSpan
  const ys = elevationWallYsAtX(wall, clamped)
  return {
    wallId: wall.wallId,
    floorIndex: wall.floorIndex,
    x: clamped,
    t: Math.max(0, Math.min(1, t)),
    y0: ys ? Math.min(ys.top, ys.bot) : wall.y0,
    y1: ys ? Math.max(ys.top, ys.bot) : wall.y1,
    snapped: Math.abs(snappedX - x) > 1e-6,
  }
}

export function nearestElevationRidgeJunction(
  elevation: FacadeElevation,
  wall: ElevationWallRect,
  point: Point2D,
): ElevationJunction | null {
  if (!wall.ridge) return null
  let best: ElevationJunction | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const junction of elevation.junctions) {
    if (!junction.ridge || junction.floorIndex !== wall.floorIndex) continue
    if (!junction.refs.some((ref) => ref.wallId === wall.wallId)) continue
    const dist = Math.abs(junction.x - point.x)
    if (dist < bestDist) {
      best = junction
      bestDist = dist
    }
  }
  return best
}

function pointInPoly(point: Point2D, poly: readonly Point2D[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (!a || !b) continue
    const denom = b.y - a.y
    if (a.y > point.y === b.y > point.y || Math.abs(denom) < 1e-12) continue
    if (point.x < ((b.x - a.x) * (point.y - a.y)) / denom + a.x) inside = !inside
  }
  return inside
}

function distToPolyEdges(point: Point2D, poly: readonly Point2D[]): number {
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) continue
    best = Math.min(best, pointOnSeg(point, a, b).dist)
  }
  return best
}

export function hitElevationRoofPlane(
  elevation: FacadeElevation,
  point: Point2D,
): ElevationRoofPlane | null {
  for (let i = elevation.roofPlanes.length - 1; i >= 0; i -= 1) {
    const plane = elevation.roofPlanes[i]
    if (!plane || plane.points.length < 3) continue
    const fill = plane.fillPoints.length >= 3 ? plane.fillPoints : plane.points
    if (pointInPoly(point, fill) || distToPolyEdges(point, fill) <= ELEVATION_ROOF_EDGE_HIT_CM) {
      return plane
    }
  }
  return null
}

export function hitElevationRoofVertex(
  plane: ElevationRoofPlane,
  point: Point2D,
  tolCm = ELEVATION_ROOF_VERTEX_HIT_CM,
): number | null {
  let best = -1
  let bestDist = tolCm
  for (let i = 0; i < plane.points.length; i += 1) {
    const vertex = plane.points[i]
    if (!vertex) continue
    const dist = Math.hypot(point.x - vertex.x, point.y - vertex.y)
    if (dist <= bestDist) {
      best = i
      bestDist = dist
    }
  }
  return best >= 0 ? best : null
}

export function collectElevationRoofSnapYs(
  elevation: FacadeElevation,
  skip?: { planeId: string; vertexIndex: number },
): number[] {
  const ys: number[] = []
  for (const wall of elevation.walls) {
    ys.push(wall.aTop.y, wall.bTop.y)
  }
  for (const plane of elevation.roofPlanes) {
    plane.points.forEach((point, index) => {
      if (skip && plane.id === skip.planeId && index === skip.vertexIndex) return
      ys.push(point.y)
    })
  }
  return ys
}

export function snapElevationY(
  y: number,
  candidates: readonly number[],
  slackCm = ELEVATION_ROOF_Z_SNAP_CM,
): number {
  return snapElevationScalar(y, candidates, slackCm)
}

export function snapElevationX(
  x: number,
  candidates: readonly number[],
  slackCm = ELEVATION_SPLIT_SNAP_CM,
): number {
  return snapElevationScalar(x, candidates, slackCm)
}

export function hitElevationJunction(
  elevation: FacadeElevation,
  point: Point2D,
  tolCm = ELEVATION_JUNCTION_HIT_CM,
): ElevationJunction | null {
  let best: ElevationJunction | null = null
  let bestDist = tolCm
  for (const junction of elevation.junctions) {
    const lo = Math.min(junction.yTop, junction.yBot)
    const hi = Math.max(junction.yTop, junction.yBot)
    if (point.y < lo - tolCm || point.y > hi + tolCm) continue
    const dist = Math.abs(point.x - junction.x)
    if (dist <= bestDist) {
      best = junction
      bestDist = dist
    }
  }
  return best
}
