/**
 * Rand-resize + onderlinge snap voor ramen/deuren in het gevel-aanzicht.
 */
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from './extraction-to-plan-types'
import type { Opening, Point2D, Wall } from './types'
import type { ElevationOpeningRect, ElevationRect } from './facade-elevation'
import { wallElevationAtT } from './wall-endpoint-height'

export type ElevResizeSide = 'n' | 'e' | 's' | 'w'

export const ELEVATION_OPENING_SNAP_CM = 8
export const ELEVATION_OPENING_MIN_WIDTH_CM = 10
export const ELEVATION_OPENING_MIN_HEIGHT_CM = 50

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
  if (z + height > maxTop) z = Math.max(minZ, maxTop - height)
  if (z + height > maxTop) height = Math.max(1, maxTop - z)
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
