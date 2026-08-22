/**
 * Rand-resize + onderlinge snap voor ramen/deuren in het gevel-aanzicht.
 */
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from './extraction-to-plan-types'
import type { Opening, Point2D, Wall } from './types'
import type { ElevationOpeningRect, ElevationRect, ElevationWallRect } from './facade-elevation'
import { elevationWallYsAtX } from './facade-elevation'
import type { ElevationOpeningPatch } from './elevation-hit'
import { wallElevationAtT } from './wall-endpoint-height'
import { collectCollinearWallIds, wallCollinearEnds } from '@/ui/components/fml-preview-openings'

export type ElevResizeSide = 'n' | 'e' | 's' | 'w'

export const ELEVATION_OPENING_SNAP_CM = 8
export const ELEVATION_OPENING_MIN_WIDTH_CM = 10
export const ELEVATION_OPENING_MIN_HEIGHT_CM = 10

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

function openingEdgesAlongWall(
  wall: Pick<Wall, 'a' | 'b'>,
  t: number,
  widthCm: number,
): { left: number; right: number; len: number } {
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
  const center = (Number.isFinite(t) ? t : 0.5) * len
  const half = Math.max(0.5, widthCm / 2)
  return { left: center - half, right: center + half, len }
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
): ElevationRect {
  const wallLeft = xBounds?.left ?? Math.min(wall.aTop.x, wall.bTop.x)
  const wallRight = xBounds?.right ?? Math.max(wall.aTop.x, wall.bTop.x)
  let nextW = Math.min(rect.x0, rect.x1)
  let nextE = Math.max(rect.x0, rect.x1)
  let nextN = Math.min(rect.y0, rect.y1)
  let nextS = Math.max(rect.y0, rect.y1)
  if (side === 'e') nextE = Math.min(nextE, wallRight)
  else if (side === 'w') nextW = Math.max(nextW, wallLeft)
  const sampleXs = [
    Math.min(wallRight, Math.max(wallLeft, nextW)),
    Math.min(wallRight, Math.max(wallLeft, nextE)),
  ]
  let wallTop = wall.y0
  let wallBot = wall.y1
  for (const x of sampleXs) {
    const ys = elevationWallYsAtX(wall, x)
    if (!ys) continue
    wallTop = Math.max(wallTop, ys.top)
    wallBot = Math.min(wallBot, ys.bot)
  }
  if (side === 'n') nextN = Math.max(nextN, wallTop)
  else if (side === 's') nextS = Math.min(nextS, wallBot)
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
 * Houd de vaste kant van een resize; knip alleen de versleepte zijde af.
 */
export function clampOpeningPatchKeepOppositeEdge(
  wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'extras'> & { id?: string },
  start: Pick<Opening, 't' | 'width' | 'z' | 'z_height' | 'type'>,
  patch: ElevationOpeningPatch,
  side: ElevResizeSide,
  floorHeightCm: number,
  planWalls: readonly Pick<Wall, 'id' | 'a' | 'b'>[] = [],
): ElevationOpeningPatch {
  const startEdges = openingEdgesAlongWall(wall, start.t, start.width)
  const nextEdges = openingEdgesAlongWall(wall, patch.t, patch.width)
  const cap = Math.max(0, (wall.thickness ?? 0) / 2)
  const ends = wall.id ? wallCollinearEnds(planWalls, wall.id) : { a: false, b: false }
  const minW = ELEVATION_OPENING_MIN_WIDTH_CM
  let left = nextEdges.left
  let right = nextEdges.right
  if (side === 'e') {
    left = startEdges.left
    const maxRight = ends.b ? Number.POSITIVE_INFINITY : startEdges.len + cap
    right = Math.min(Math.max(left + minW, nextEdges.right), maxRight)
  } else if (side === 'w') {
    right = startEdges.right
    const minLeft = ends.a ? Number.NEGATIVE_INFINITY : -cap
    left = Math.max(Math.min(right - minW, nextEdges.left), minLeft)
  }
  const width = Math.max(minW, right - left)
  const t = startEdges.len < 1e-6 ? 0.5 : (left + right) / 2 / startEdges.len
  const elev = wallElevationAtT(wall as Wall, t, floorHeightCm)
  const minZ = Math.max(0, elev.z)
  const maxTop = Math.max(minZ + ELEVATION_OPENING_MIN_HEIGHT_CM, Math.min(elev.h, floorHeightCm))
  const startZ =
    typeof start.z === 'number' && Number.isFinite(start.z)
      ? start.z
      : start.type === 'window'
        ? DEFAULT_FML_WINDOW_SILL_Z_CM
        : 0
  const startH =
    typeof start.z_height === 'number' && Number.isFinite(start.z_height)
      ? start.z_height
      : start.type === 'window'
        ? DEFAULT_FML_WINDOW_HEIGHT_CM
        : DEFAULT_FML_DOOR_HEIGHT_CM
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
    width: Math.round(width),
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

/**
 * Houd opening binnen de verdieping én de lokale muurtop op `t` (schuine gevel).
 */
export function clampOpeningToStory(opening: Opening, wall: Wall, floorHeightCm: number): Opening {
  const t = Number.isFinite(opening.t) ? opening.t : 0.5
  const elev = wallElevationAtT(wall, t, floorHeightCm)
  const minZ = Math.max(0, elev.z)
  const maxTop = Math.max(minZ + 1, Math.min(elev.h, floorHeightCm))
  const span = Math.max(1, maxTop - minZ)
  const fallbackZ = opening.type === 'window' ? DEFAULT_FML_WINDOW_SILL_Z_CM : 0
  const fallbackH =
    opening.type === 'window' ? DEFAULT_FML_WINDOW_HEIGHT_CM : DEFAULT_FML_DOOR_HEIGHT_CM
  let z = typeof opening.z === 'number' && Number.isFinite(opening.z) ? opening.z : fallbackZ
  let height =
    typeof opening.z_height === 'number' && Number.isFinite(opening.z_height)
      ? opening.z_height
      : fallbackH
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

export function snapElevationRect(
  rect: ElevationRect,
  mode: 'move' | ElevResizeSide,
  targets: ElevationSnapTargets,
  slack = ELEVATION_OPENING_SNAP_CM,
): { rect: ElevationRect; guide: ElevationSnapGuide } {
  if (mode === 'move') {
    const xHit = nearestDelta([rect.x0, rect.x1], targets.xs, slack)
    const yHit = nearestDelta([rect.y0, rect.y1], targets.ys, slack)
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
