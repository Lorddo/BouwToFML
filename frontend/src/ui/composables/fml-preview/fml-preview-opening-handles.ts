/**
 * Plattegrond opening-handles: L/R-breedte + midden-verplaats.
 */
import { ELEVATION_OPENING_SNAP_CM } from '@/core/fml/elevation-opening-edit'
import {
  clampOpeningWidthKeepOppositeEdge,
  openingEdgesAlongWall,
  type OpeningAlongWallSide,
} from '@/core/fml/opening-along-wall-resize'
import { findOpeningById } from '@/core/fml/opening-wall-ops'
import type { Opening, Point2D, Wall } from '@/core/fml/types'
import { projectPointToWallTUnclamped } from '@/ui/components/fml-preview-opening-drag-geom'
import { collectCollinearWallIds } from '@/ui/components/fml-preview-openings'
import { offsetPointByWallBalance } from '@/ui/components/fml-preview-wall-polygons'

export type PlanOpeningResizeSide = OpeningAlongWallSide
export type PlanOpeningHandleKind = PlanOpeningResizeSide | 'move'

export const PLAN_OPENING_RESIZE_SNAP_CM = ELEVATION_OPENING_SNAP_CM

export type PlanOpeningHandlePoint = {
  kind: PlanOpeningHandleKind
  x: number
  y: number
}

function wallAxis(wall: Pick<Wall, 'a' | 'b'>): {
  len: number
  ux: number
  uy: number
} {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return { len: 0, ux: 1, uy: 0 }
  return { len, ux: dx / len, uy: dy / len }
}

/** Hartlijn-uiteinden + centrum, daarna balance-offset zoals glyphs. */
export function planOpeningHandlePointsCm(
  wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>,
  opening: Pick<Opening, 't' | 'width'>,
): PlanOpeningHandlePoint[] {
  const { len, ux, uy } = wallAxis(wall)
  if (len < 1e-6) return []
  const edges = openingEdgesAlongWall(wall, opening.t, opening.width)
  const wallUnit = { x: ux, y: uy }
  const thickness = wall.thickness ?? 0
  const balance = wall.balance
  const toWorld = (along: number): Point2D => {
    const axis = { x: wall.a.x + ux * along, y: wall.a.y + uy * along }
    return offsetPointByWallBalance(axis, wallUnit, thickness, balance)
  }
  const start = toWorld(edges.left)
  const end = toWorld(edges.right)
  const mid = toWorld((edges.left + edges.right) / 2)
  return [
    { kind: 'start', x: start.x, y: start.y },
    { kind: 'end', x: end.x, y: end.y },
    { kind: 'move', x: mid.x, y: mid.y },
  ]
}

export function hitPlanOpeningHandle(
  handles: readonly PlanOpeningHandlePoint[],
  point: Point2D,
  tolCm: number,
): PlanOpeningHandleKind | null {
  let best: PlanOpeningHandleKind | null = null
  let bestDist = tolCm
  for (const handle of handles) {
    const dist = Math.hypot(point.x - handle.x, point.y - handle.y)
    if (dist <= bestDist) {
      best = handle.kind
      bestDist = dist
    }
  }
  return best
}

function openingEdgeDistancesAlongWall(
  wall: Pick<Wall, 'a' | 'b'>,
  opening: Pick<Opening, 't' | 'width'>,
): number[] {
  const edges = openingEdgesAlongWall(wall, opening.t, opening.width)
  return [edges.left, edges.right]
}

/**
 * Snap de versleepte rand naar andere openingsranden op dezelfde collineaire keten.
 * Gebruikt alleen muren in de keten; randen van de actieve opening worden overgeslagen.
 */
export function snapOpeningResizeAlongWall(
  walls: readonly Wall[],
  host: Wall,
  openingId: string,
  side: PlanOpeningResizeSide,
  left: number,
  right: number,
  snapCm = PLAN_OPENING_RESIZE_SNAP_CM,
): { left: number; right: number; guideAlong: number | null } {
  const located = findOpeningById(walls as Wall[], openingId)
  const chain = new Set(collectCollinearWallIds(walls, host.id))
  const otherTargets: number[] = []
  for (const wall of walls) {
    if (!chain.has(wall.id)) continue
    for (let i = 0; i < wall.openings.length; i += 1) {
      const opening = wall.openings[i]
      if (!opening) continue
      if (located && wall.id === located.wall.id && i === located.openingIndex) {
        continue
      }
      otherTargets.push(...openingEdgeDistancesAlongWall(wall, opening))
    }
  }

  const moving = side === 'start' ? left : right
  let bestDist = snapCm
  let guide: number | null = null
  for (const target of otherTargets) {
    const dist = Math.abs(target - moving)
    if (dist <= bestDist) {
      bestDist = dist
      guide = target
    }
  }
  if (guide == null) return { left, right, guideAlong: null }
  if (side === 'start') return { left: guide, right, guideAlong: guide }
  return { left, right: guide, guideAlong: guide }
}

/**
 * Pointer → nieuwe { t, width } met vaste tegenkant.
 * Blijft op de host-muur (geen hop).
 */
export function resizeOpeningAlongWallFromPointer(
  walls: readonly Wall[],
  wall: Wall,
  start: Pick<Opening, 't' | 'width'>,
  openingId: string,
  side: PlanOpeningResizeSide,
  pointerCm: Point2D,
  snap = true,
): { t: number; width: number } {
  const tRaw = projectPointToWallTUnclamped(wall, pointerCm)
  const { len } = wallAxis(wall)
  const along = tRaw * len
  const startEdges = openingEdgesAlongWall(wall, start.t, start.width)
  let left = startEdges.left
  let right = startEdges.right
  if (side === 'start') left = along
  else right = along

  if (snap) {
    const snapped = snapOpeningResizeAlongWall(walls, wall, openingId, side, left, right)
    left = snapped.left
    right = snapped.right
  }

  const width = Math.max(1, right - left)
  const t = len < 1e-6 ? 0.5 : (left + right) / 2 / len
  return clampOpeningWidthKeepOppositeEdge(wall, start, { t, width }, side, walls)
}
