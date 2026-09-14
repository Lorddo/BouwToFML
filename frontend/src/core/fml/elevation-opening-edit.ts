/**
 * Rand-resize + onderlinge snap voor ramen/deuren in het gevel-aanzicht.
 */
import {
  DEFAULT_DOOR_HEIGHT_CM,
  DEFAULT_WINDOW_HEIGHT_CM,
  DEFAULT_WINDOW_SILL_Z_CM,
} from './extraction-to-plan-types'
import type { Opening, OpeningType, Point2D, Wall } from './types'
import type { ElevationOpeningRect, ElevationRect, ElevationWallRect } from './facade-elevation'
import { elevationWallYsAtX } from './facade-elevation'
import type { ElevationOpeningPatch } from './elevation-hit'
import { elevationOpeningHolePoints } from './elevation-opening-symbol'
import {
  clampOpeningWidthKeepOppositeEdge,
  openingEdgesAlongWall,
} from './opening-along-wall-resize'
import { wallElevationAtT } from './wall-endpoint-height'
import { collectCollinearWallIds } from '@/ui/components/plan-canvas-openings'

export type ElevResizeSide = 'n' | 'e' | 's' | 'w'

export const ELEVATION_OPENING_SNAP_CM = 8
export const ELEVATION_OPENING_MIN_WIDTH_CM = 10
export const ELEVATION_OPENING_MIN_HEIGHT_CM = 10
const ELEVATION_SHAPE_SAMPLES = 16
const ELEVATION_SHAPE_SLACK_CM = 0.5

/** Kozijn-silhouet i.p.v. AABB (driehoek / rond / halfrond). */
export type ElevationOpeningShapeHint = {
  type: OpeningType
  kind: string
  mirrored?: [number, number]
  startOnLeft?: boolean
}

export type ElevationSnapTargets = {
  xs: number[]
  ys: number[]
}

export type ElevationSnapGuide = {
  x?: number
  y?: number
}

export function elevationHandlePoints(rect: ElevationRect): Array<{
  side: ElevResizeSide
  x: number
  y: number
}> {
  const x0 = Math.min(rect.x0, rect.x1)
  const x1 = Math.max(rect.x0, rect.x1)
  const y0 = Math.min(rect.y0, rect.y1)
  const y1 = Math.max(rect.y0, rect.y1)
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  return [
    { side: 'n', x: mx, y: y0 },
    { side: 's', x: mx, y: y1 },
    { side: 'e', x: x1, y: my },
    { side: 'w', x: x0, y: my },
  ]
}

export function elevationRectCenter(rect: ElevationRect): Point2D {
  return {
    x: (Math.min(rect.x0, rect.x1) + Math.max(rect.x0, rect.x1)) / 2,
    y: (Math.min(rect.y0, rect.y1) + Math.max(rect.y0, rect.y1)) / 2,
  }
}

export function hitElevationHandle(
  rect: ElevationRect,
  point: Point2D,
  tolCm: number,
): ElevResizeSide | null {
  let best: ElevResizeSide | null = null
  let bestDist = tolCm
  for (const handle of elevationHandlePoints(rect)) {
    const dist = Math.hypot(point.x - handle.x, point.y - handle.y)
    if (dist <= bestDist) {
      best = handle.side
      bestDist = dist
    }
  }
  return best
}

export function resizeElevationRect(
  start: ElevationRect,
  side: ElevResizeSide,
  pointer: Point2D,
  minW = ELEVATION_OPENING_MIN_WIDTH_CM,
  minH = ELEVATION_OPENING_MIN_HEIGHT_CM,
): ElevationRect {
  const w = Math.min(start.x0, start.x1)
  const e = Math.max(start.x0, start.x1)
  const n = Math.min(start.y0, start.y1)
  const s = Math.max(start.y0, start.y1)
  let nextW = w
  let nextE = e
  let nextN = n
  let nextS = s
  if (side === 'n') nextN = Math.min(pointer.y, s - minH)
  else if (side === 's') nextS = Math.max(pointer.y, n + minH)
  else if (side === 'e') nextE = Math.max(pointer.x, w + minW)
  else nextW = Math.min(pointer.x, e - minW)
  return { x0: nextW, x1: nextE, y0: nextN, y1: nextS }
}

function normalizedOpeningRect(rect: ElevationRect): {
  x0: number
  x1: number
  y0: number
  y1: number
  width: number
  height: number
} {
  const x0 = Math.min(rect.x0, rect.x1)
  const x1 = Math.max(rect.x0, rect.x1)
  const y0 = Math.min(rect.y0, rect.y1)
  const y1 = Math.max(rect.y0, rect.y1)
  return { x0, x1, y0, y1, width: x1 - x0, height: y1 - y0 }
}

function holeForOpeningRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  shape?: ElevationOpeningShapeHint,
): Point2D[] {
  if (!shape) {
    return [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ]
  }
  return elevationOpeningHolePoints({ x0, y0, x1, y1 }, shape.type, shape.kind, {
    mirrored: shape.mirrored,
    startOnLeft: shape.startOnLeft,
  })
}

/** Verticale doorsnede van een gesloten polygoon; `null` als de vorm hier geen glas/kozijn heeft. */
export function polygonYRangeAtX(
  points: readonly Point2D[],
  x: number,
  eps = 1e-6,
): { top: number; bot: number } | null {
  const ys: number[] = []
  const n = points.length
  for (let i = 0; i < n; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % n]
    if (!a || !b) continue
    const lo = Math.min(a.x, b.x)
    const hi = Math.max(a.x, b.x)
    if (x < lo - eps || x > hi + eps) continue
    if (Math.abs(b.x - a.x) < eps) {
      if (Math.abs(x - a.x) <= eps) ys.push(a.y, b.y)
      continue
    }
    const u = (x - a.x) / (b.x - a.x)
    if (u < -eps || u > 1 + eps) continue
    ys.push(a.y + u * (b.y - a.y))
  }
  if (ys.length === 0) return null
  return { top: Math.min(...ys), bot: Math.max(...ys) }
}

function shapeSampleXs(x0: number, x1: number): number[] {
  const xs = [x0, x1]
  for (let i = 1; i < ELEVATION_SHAPE_SAMPLES; i += 1) {
    xs.push(x0 + ((x1 - x0) * i) / ELEVATION_SHAPE_SAMPLES)
  }
  return xs
}

function holeOccupancyX(points: readonly Point2D[]): { left: number; right: number } | null {
  if (points.length === 0) return null
  let left = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  for (const point of points) {
    left = Math.min(left, point.x)
    right = Math.max(right, point.x)
  }
  return Number.isFinite(left) ? { left, right } : null
}

/**
 * Versleepte kant stopt op de muur; de tegenoverliggende kant blijft staan.
 */
export function elevationCollinearXBounds(
  walls: readonly ElevationWallRect[],
  wall: ElevationWallRect,
  planWalls: readonly Pick<Wall, 'id' | 'a' | 'b'>[],
): { left: number; right: number } {
  const chain = new Set(collectCollinearWallIds(planWalls, wall.wallId))
  const members = walls.filter(
    (item) => item.floorIndex === wall.floorIndex && !item.ridge && chain.has(item.wallId),
  )
  const list = members.length > 0 ? members : [wall]
  let left = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  for (const item of list) {
    left = Math.min(left, item.aTop.x, item.bTop.x)
    right = Math.max(right, item.aTop.x, item.bTop.x)
  }
  return { left, right }
}

export function pickElevationWallForOpeningX(
  walls: readonly ElevationWallRect[],
  current: ElevationWallRect,
  x: number,
  planWalls: readonly Pick<Wall, 'id' | 'a' | 'b'>[],
): ElevationWallRect {
  const chain = new Set(collectCollinearWallIds(planWalls, current.wallId))
  const members = walls.filter(
    (item) => item.floorIndex === current.floorIndex && !item.ridge && chain.has(item.wallId),
  )
  const list = members.length > 0 ? members : [current]
  let best = current
  let bestDist = Number.POSITIVE_INFINITY
  for (const item of list) {
    const lo = Math.min(item.xa, item.xb)
    const hi = Math.max(item.xa, item.xb)
    const dist = x < lo ? lo - x : x > hi ? x - hi : 0
    if (dist < bestDist) {
      best = item
      bestDist = dist
    }
  }
  return best
}

export function clampElevationOpeningResize(
  wall: ElevationWallRect,
  rect: ElevationRect,
  side: ElevResizeSide,
  minW = ELEVATION_OPENING_MIN_WIDTH_CM,
  minH = ELEVATION_OPENING_MIN_HEIGHT_CM,
  xBounds?: { left: number; right: number },
  shape?: ElevationOpeningShapeHint,
): ElevationRect {
  const wallLeft = xBounds?.left ?? Math.min(wall.aTop.x, wall.bTop.x)
  const wallRight = xBounds?.right ?? Math.max(wall.aTop.x, wall.bTop.x)
  let nextW = Math.min(rect.x0, rect.x1)
  let nextE = Math.max(rect.x0, rect.x1)
  let nextN = Math.min(rect.y0, rect.y1)
  let nextS = Math.max(rect.y0, rect.y1)
  const occupancy = holeOccupancyX(holeForOpeningRect(nextW, nextN, nextE, nextS, shape))
  const hangL = occupancy ? occupancy.left - nextW : 0
  const hangR = occupancy ? nextE - occupancy.right : 0
  if (side === 'e') nextE = Math.min(nextE, wallRight + hangR)
  else if (side === 'w') nextW = Math.max(nextW, wallLeft - hangL)
  const originN = nextN
  const originS = nextS
  const hole = holeForOpeningRect(nextW, originN, nextE, originS, shape)
  for (const x of shapeSampleXs(nextW, nextE)) {
    const local = polygonYRangeAtX(hole, x)
    if (!local) continue
    const ys = elevationWallYsAtX(wall, x)
    if (!ys) continue
    if (side === 'n') nextN = Math.max(nextN, ys.top - (local.top - originN))
    else if (side === 's') nextS = Math.min(nextS, ys.bot + (originS - local.bot))
  }
  if (nextE - nextW < minW) {
    if (side === 'e') nextE = nextW + minW
    else if (side === 'w') nextW = nextE - minW
  }
  if (nextS - nextN < minH) {
    if (side === 'n') nextN = nextS - minH
    else if (side === 's') nextS = nextN + minH
  }
  return { x0: nextW, x1: nextE, y0: nextN, y1: nextS }
}

/**
 * `e`/`w` zijn zichtbare aanzicht-X (niet muur A→B). Als A rechts ligt, wissel die kanten.
 */
export function wallSideForElevationResize(
  side: ElevResizeSide,
  startOnLeft: boolean,
): ElevResizeSide {
  if (startOnLeft || (side !== 'e' && side !== 'w')) return side
  return side === 'e' ? 'w' : 'e'
}

function wallTopAtT(
  wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'extras'> & { id?: string },
  t: number,
  floorHeightCm: number,
): { minZ: number; maxTop: number } {
  const elev = wallElevationAtT(wall as Wall, t, floorHeightCm)
  const minZ = Math.max(0, elev.z)
  return { minZ, maxTop: Math.max(minZ + 1, elev.h) }
}

/**
 * Houd de vaste kant van een resize; knip alleen de versleepte zijde af.
 */
export function clampOpeningPatchKeepOppositeEdge(
  wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'extras'> & { id?: string },
  start: Pick<Opening, 't' | 'width' | 'z' | 'z_height' | 'type'>,
  patch: ElevationOpeningPatch,
  side: ElevResizeSide,
  floorHeightCm: number,
  planWalls: readonly Pick<Wall, 'id' | 'a' | 'b'>[] = [],
  startOnLeft = true,
): ElevationOpeningPatch {
  const wallSide = wallSideForElevationResize(side, startOnLeft)
  const alongSide = wallSide === 'e' ? 'end' : wallSide === 'w' ? 'start' : null
  const widthPatch =
    alongSide != null
      ? clampOpeningWidthKeepOppositeEdge(wall, start, patch, alongSide, planWalls)
      : { t: patch.t, width: Math.round(patch.width) }
  const t = widthPatch.t
  const width = widthPatch.width
  const { minZ, maxTop: wallTop } = wallTopAtT(wall, t, floorHeightCm)
  const maxTop = Math.max(minZ + ELEVATION_OPENING_MIN_HEIGHT_CM, wallTop)
  const startZ =
    typeof start.z === 'number' && Number.isFinite(start.z)
      ? start.z
      : start.type === 'window'
        ? DEFAULT_WINDOW_SILL_Z_CM
        : 0
  const startH =
    typeof start.z_height === 'number' && Number.isFinite(start.z_height)
      ? start.z_height
      : start.type === 'window'
        ? DEFAULT_WINDOW_HEIGHT_CM
        : DEFAULT_DOOR_HEIGHT_CM
  let z = patch.z
  let height = patch.z_height
  if (side === 'n') {
    z = startZ
    height = Math.min(
      Math.max(ELEVATION_OPENING_MIN_HEIGHT_CM, patch.z_height),
      Math.max(1, maxTop - z),
    )
  } else if (side === 's') {
    const top = startZ + startH
    z = Math.max(minZ, Math.min(patch.z, top - ELEVATION_OPENING_MIN_HEIGHT_CM))
    height = Math.max(ELEVATION_OPENING_MIN_HEIGHT_CM, top - z)
    if (z + height > maxTop) height = Math.max(ELEVATION_OPENING_MIN_HEIGHT_CM, maxTop - z)
  }
  return {
    t: Number.isFinite(t) ? t : 0.5,
    width,
    z: Math.round(z),
    z_height: Math.round(height),
  }
}

export function translateElevationRect(
  start: ElevationRect,
  dx: number,
  dy: number,
): ElevationRect {
  return {
    x0: start.x0 + dx,
    x1: start.x1 + dx,
    y0: start.y0 + dy,
    y1: start.y1 + dy,
  }
}

function openingSizeOrFallback(opening: Pick<Opening, 'z' | 'z_height' | 'type'>): {
  z: number
  height: number
} {
  const fallbackZ = opening.type === 'window' ? DEFAULT_WINDOW_SILL_Z_CM : 0
  const fallbackH =
    opening.type === 'window' ? DEFAULT_WINDOW_HEIGHT_CM : DEFAULT_DOOR_HEIGHT_CM
  const z = typeof opening.z === 'number' && Number.isFinite(opening.z) ? opening.z : fallbackZ
  const height =
    typeof opening.z_height === 'number' && Number.isFinite(opening.z_height)
      ? opening.z_height
      : fallbackH
  return { z, height }
}

/**
 * Houd opening binnen de lokale muurtop/`z` op `t` (schuine gevel).
 * Mag krimpen — alleen plaatsen of als de muur korter wordt, niet tijdens verplaatsen.
 */
export function clampOpeningToStory(opening: Opening, wall: Wall, floorHeightCm: number): Opening {
  const t = Number.isFinite(opening.t) ? opening.t : 0.5
  const { minZ, maxTop } = wallTopAtT(wall, t, floorHeightCm)
  const span = Math.max(1, maxTop - minZ)
  let { z, height } = openingSizeOrFallback(opening)
  z = Math.max(minZ, z)
  height = Math.max(1, Math.min(height, span))
  if (z + height > maxTop) height = Math.max(1, maxTop - z)
  if (z + height > maxTop) z = Math.max(minZ, maxTop - height)
  return {
    ...opening,
    z: Math.round(z),
    z_height: Math.round(height),
  }
}

/**
 * Verplaatsen: breedte en hoogte blijven. Alleen `t`/`z` schuiven tot de opening op de muur past.
 */
export function clampOpeningMoveKeepSize(
  opening: Opening,
  wall: Wall,
  floorHeightCm: number,
  startOnLeft = true,
): Opening {
  const t = Number.isFinite(opening.t) ? opening.t : 0.5
  const width = opening.width
  const { z: rawZ, height } = openingSizeOrFallback(opening)
  const edges = openingEdgesAlongWall(wall, t, width)
  const hole = holeForOpeningRect(0, 0, width, height, {
    type: opening.type,
    kind: opening.kind,
    mirrored: opening.mirrored,
    startOnLeft,
  })
  let zMin = Number.NEGATIVE_INFINITY
  let zMax = Number.POSITIVE_INFINITY
  let any = false
  for (const x of shapeSampleXs(0, width)) {
    const local = polygonYRangeAtX(hole, x)
    if (!local) continue
    const along = startOnLeft ? edges.left + x : edges.right - x
    const tSample = edges.len < 1e-6 ? t : along / edges.len
    const { minZ, maxTop } = wallTopAtT(wall, tSample, floorHeightCm)
    any = true
    zMin = Math.max(zMin, minZ - height + local.bot)
    zMax = Math.min(zMax, maxTop - height + local.top)
  }
  if (!any) {
    const { minZ, maxTop } = wallTopAtT(wall, t, floorHeightCm)
    zMin = minZ
    zMax = maxTop - height
  }
  let z = rawZ
  if (z > zMax) z = zMax
  if (z < zMin) z = zMin
  return {
    ...opening,
    t,
    width,
    z: Math.round(z),
    z_height: Math.round(height),
  }
}

function elevationOpeningY0Bounds(
  wall: ElevationWallRect,
  x0: number,
  y0: number,
  width: number,
  height: number,
  shape?: ElevationOpeningShapeHint,
): { min: number; max: number } | null {
  const hole = holeForOpeningRect(x0, y0, x0 + width, y0 + height, shape)
  let min = Number.NEGATIVE_INFINITY
  let max = Number.POSITIVE_INFINITY
  let any = false
  for (const x of shapeSampleXs(x0, x0 + width)) {
    const local = polygonYRangeAtX(hole, x)
    if (!local) continue
    const ys = elevationWallYsAtX(wall, x)
    if (!ys) return null
    any = true
    min = Math.max(min, ys.top - (local.top - y0))
    max = Math.min(max, ys.bot - (local.bot - y0))
  }
  return any ? { min, max } : null
}

function elevationOpeningFitsWall(
  wall: ElevationWallRect,
  x0: number,
  y0: number,
  width: number,
  height: number,
  shape?: ElevationOpeningShapeHint,
): boolean {
  const bounds = elevationOpeningY0Bounds(wall, x0, y0, width, height, shape)
  if (!bounds) return false
  return y0 >= bounds.min - ELEVATION_SHAPE_SLACK_CM && y0 <= bounds.max + ELEVATION_SHAPE_SLACK_CM
}

function slideElevationOpeningXToFit(
  wall: ElevationWallRect,
  requested: number,
  y0: number,
  width: number,
  height: number,
  minX: number,
  maxX: number,
  shape?: ElevationOpeningShapeHint,
): number {
  if (maxX < minX) return requested
  if (elevationOpeningFitsWall(wall, requested, y0, width, height, shape)) return requested
  let best = requested
  let bestDist = Number.POSITIVE_INFINITY
  const steps = 64
  for (let i = 0; i <= steps; i += 1) {
    const x = minX + ((maxX - minX) * i) / steps
    if (!elevationOpeningFitsWall(wall, x, y0, width, height, shape)) continue
    const dist = Math.abs(x - requested)
    if (dist < bestDist) {
      best = x
      bestDist = dist
    }
  }
  return best
}

/**
 * Verplaats-rect: zelfde breedte/hoogte, schuif tot de opening binnen de muur blijft.
 * Driehoek/rond/halfrond toetsen het kozijn-silhouet, niet de lege AABB-hoek.
 */
export function clampElevationOpeningMove(
  wall: ElevationWallRect,
  rect: ElevationRect,
  xBounds?: { left: number; right: number },
  shape?: ElevationOpeningShapeHint,
): ElevationRect {
  const { x0: x0Start, y0: y0Start, width, height } = normalizedOpeningRect(rect)
  const left = xBounds?.left ?? Math.min(wall.aTop.x, wall.bTop.x)
  const right = xBounds?.right ?? Math.max(wall.aTop.x, wall.bTop.x)
  const occupancy = holeOccupancyX(holeForOpeningRect(0, 0, width, height, shape))
  const insetL = occupancy?.left ?? 0
  const insetR = occupancy ? width - occupancy.right : 0
  const minX = left - insetL
  const maxX = right - width + insetR
  let x0 = x0Start
  if (maxX >= minX) x0 = Math.min(Math.max(x0, minX), maxX)
  else x0 = (left + right - width) / 2
  x0 = slideElevationOpeningXToFit(wall, x0, y0Start, width, height, minX, maxX, shape)
  let y0 = y0Start
  const yBounds = elevationOpeningY0Bounds(wall, x0, y0Start, width, height, shape)
  if (yBounds && yBounds.min <= yBounds.max + ELEVATION_SHAPE_SLACK_CM) {
    if (y0 < yBounds.min) y0 = yBounds.min
    if (y0 > yBounds.max) y0 = yBounds.max
  }
  return {
    x0,
    x1: x0 + width,
    y0,
    y1: y0 + height,
  }
}

export function collectOpeningSnapTargets(
  openings: ReadonlyArray<Pick<ElevationOpeningRect, 'openingId' | 'x0' | 'x1' | 'y0' | 'y1'>>,
  excludeId: string,
): ElevationSnapTargets {
  const xs: number[] = []
  const ys: number[] = []
  for (const opening of openings) {
    if (opening.openingId === excludeId) continue
    xs.push(opening.x0, opening.x1)
    ys.push(opening.y0, opening.y1)
  }
  return { xs, ys }
}

function nearestDelta(
  edges: number[],
  targets: number[],
  slack: number,
): { delta: number; target: number } | null {
  let best: { delta: number; target: number } | null = null
  for (const edge of edges) {
    for (const target of targets) {
      const delta = target - edge
      if (Math.abs(delta) > slack) continue
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = { delta, target }
      }
    }
  }
  return best
}

export function openingShapeSnapEdges(
  rect: ElevationRect,
  shape?: ElevationOpeningShapeHint,
): { xs: number[]; ys: number[] } {
  const { x0, y0, x1, y1 } = normalizedOpeningRect(rect)
  const hole = holeForOpeningRect(x0, y0, x1, y1, shape)
  if (hole.length === 0) return { xs: [x0, x1], ys: [y0, y1] }
  return {
    xs: hole.map((point) => point.x),
    ys: hole.map((point) => point.y),
  }
}

export function snapElevationRect(
  rect: ElevationRect,
  mode: 'move' | ElevResizeSide,
  targets: ElevationSnapTargets,
  slack = ELEVATION_OPENING_SNAP_CM,
  shape?: ElevationOpeningShapeHint,
): { rect: ElevationRect; guide: ElevationSnapGuide } {
  if (mode === 'move') {
    const edges = openingShapeSnapEdges(rect, shape)
    const xHit = nearestDelta(edges.xs, targets.xs, slack)
    const yHit = nearestDelta(edges.ys, targets.ys, slack)
    return {
      rect: translateElevationRect(rect, xHit?.delta ?? 0, yHit?.delta ?? 0),
      guide: {
        x: xHit?.target,
        y: yHit?.target,
      },
    }
  }
  if (mode === 'n' || mode === 's') {
    const edge = mode === 'n' ? Math.min(rect.y0, rect.y1) : Math.max(rect.y0, rect.y1)
    const hit = nearestDelta([edge], targets.ys, slack)
    if (!hit) return { rect, guide: {} }
    const pointer = mode === 'n' ? { x: 0, y: edge + hit.delta } : { x: 0, y: edge + hit.delta }
    return { rect: resizeElevationRect(rect, mode, pointer), guide: { y: hit.target } }
  }
  const edge = mode === 'e' ? Math.max(rect.x0, rect.x1) : Math.min(rect.x0, rect.x1)
  const hit = nearestDelta([edge], targets.xs, slack)
  if (!hit) return { rect, guide: {} }
  return {
    rect: resizeElevationRect(rect, mode, { x: edge + hit.delta, y: 0 }),
    guide: { x: hit.target },
  }
}
