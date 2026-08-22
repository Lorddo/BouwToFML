import type { Point2D, Wall } from '@/core/fml/types'
import { moveOpeningToWall, type OpeningDragMoveResult } from '@/core/fml/opening-wall-ops'
import {
  buildJunctions,
  COLLINEAR_DOT_THRESHOLD,
  distance,
  normalizeDir,
} from './fml-preview-junction-core'
import { findOpeningById, projectPointToWallT } from './fml-preview-openings'

export { moveOpeningToWall }

/** Loodrechte leave-drempel: daarbinnen sticky op huidig segment (cm). */
export const OPENING_DRAG_LEAVE_CM = 12
/** Snap-drempel naar ander segment; kleiner dan leave voor hysteresis (cm). */
export const OPENING_DRAG_SNAP_CM = 8
const HOP_T_EPS = 1e-4

export type OpeningDragTarget = {
  wallId: string
  t: number
}

export type { OpeningDragMoveResult }

function clamp01(t: number): number {
  if (!Number.isFinite(t)) return 0.5
  return Math.max(0, Math.min(1, t))
}

/** Ruwe parameter `t` langs a→b (mag &lt;0 / &gt;1). */
export function projectPointToWallTUnclamped(wall: Pick<Wall, 'a' | 'b'>, point: Point2D): number {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return 0.5
  return ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / lenSq
}

/** Afstand van punt tot gesloten segment (projectie geclampt op [0,1]). */
function distancePointToWallSegment(wall: Pick<Wall, 'a' | 'b'>, point: Point2D): number {
  const t = projectPointToWallT(wall, point)
  const projected = {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  }
  return distance(point, projected)
}

function wallAxisUnit(wall: Pick<Wall, 'a' | 'b'>): Point2D {
  return normalizeDir({ x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y })
}

function areWallsCollinear(a: Pick<Wall, 'a' | 'b'>, b: Pick<Wall, 'a' | 'b'>): boolean {
  const ua = wallAxisUnit(a)
  const ub = wallAxisUnit(b)
  return Math.abs(ua.x * ub.x + ua.y * ub.y) >= COLLINEAR_DOT_THRESHOLD
}

function findCollinearNeighborAtEnd(
  walls: Wall[],
  current: Wall,
  end: 'a' | 'b',
  pointerCm: Point2D,
): OpeningDragTarget | null {
  const junctions = buildJunctions(walls)
  const junction = junctions.find((node) =>
    node.refs.some((ref) => ref.wallId === current.id && ref.end === end),
  )
  if (!junction) return null

  let best: OpeningDragTarget | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const ref of junction.refs) {
    if (ref.wallId === current.id) continue
    const neighbor = walls.find((wall) => wall.id === ref.wallId)
    if (!neighbor || !areWallsCollinear(current, neighbor)) continue
    const t = projectPointToWallT(neighbor, pointerCm)
    const dist = distancePointToWallSegment(neighbor, pointerCm)
    if (dist >= bestDist) continue
    bestDist = dist
    best = { wallId: neighbor.id, t }
  }
  return best
}

function findNearestWallTarget(
  walls: Wall[],
  currentWallId: string,
  pointerCm: Point2D,
  snapCm: number,
): OpeningDragTarget | null {
  let best: OpeningDragTarget | null = null
  let bestDist = snapCm
  for (const wall of walls) {
    if (wall.id === currentWallId) continue
    const dist = distancePointToWallSegment(wall, pointerCm)
    if (dist > bestDist) continue
    bestDist = dist
    best = { wallId: wall.id, t: projectPointToWallT(wall, pointerCm) }
  }
  return best
}

/**
 * Bepaal doelmuur + soft `t` voor openings-drag.
 * Volgorde: collineaire hop → sticky huidig → snap-transfer → sticky fallback.
 */
export function resolveOpeningDragTarget(
  walls: Wall[],
  currentWallId: string,
  pointerCm: Point2D,
  opts?: { leaveCm?: number; snapCm?: number },
): OpeningDragTarget | null {
  const leaveCm = opts?.leaveCm ?? OPENING_DRAG_LEAVE_CM
  const snapCm = opts?.snapCm ?? OPENING_DRAG_SNAP_CM
  const current = walls.find((wall) => wall.id === currentWallId)
  if (!current) return null

  const tRaw = projectPointToWallTUnclamped(current, pointerCm)
  if (tRaw < -HOP_T_EPS || tRaw > 1 + HOP_T_EPS) {
    const end: 'a' | 'b' = tRaw < 0.5 ? 'a' : 'b'
    const hop = findCollinearNeighborAtEnd(walls, current, end, pointerCm)
    if (hop) return hop
  }

  const distCurrent = distancePointToWallSegment(current, pointerCm)
  if (distCurrent <= leaveCm) {
    return { wallId: current.id, t: clamp01(tRaw) }
  }

  const snapped = findNearestWallTarget(walls, currentWallId, pointerCm, snapCm)
  if (snapped) return snapped

  return { wallId: current.id, t: clamp01(tRaw) }
}

/** Combineer resolve + soft-t / transfer voor één drag-frame. */
export function applyOpeningDragMove(
  walls: Wall[],
  openingId: string,
  pointerCm: Point2D,
  opts?: { leaveCm?: number; snapCm?: number },
): OpeningDragMoveResult | null {
  const located = findOpeningById(walls, openingId)
  if (!located) return null
  const target = resolveOpeningDragTarget(walls, located.wallId, pointerCm, opts)
  if (!target) return null
  return moveOpeningToWall(walls, openingId, target.wallId, target.t)
}
