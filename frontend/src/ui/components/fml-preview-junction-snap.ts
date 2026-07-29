import type { Point2D, Wall } from '@/core/fml/types'
import {
  ENDPOINT_SNAP_RADIUS_CM,
  WALL_AXIS_EPS_CM,
  distance,
  refKey,
  type JunctionNode,
  type WallEndRef,
} from './fml-preview-junction-core'

function isWallSegmentHorizontal(wall: { a: Point2D; b: Point2D }): boolean {
  const dx = Math.abs(wall.b.x - wall.a.x)
  const dy = Math.abs(wall.b.y - wall.a.y)
  if (dx < WALL_AXIS_EPS_CM && dy < WALL_AXIS_EPS_CM) return true
  return dx >= dy
}

/** Shift-snap t.o.v. het vaste andere eindpunt van de muur (niet t.o.v. sleep-start). */
export function applyShiftSnapFromOppositeEnd(
  walls: Wall[],
  refs: WallEndRef[],
  candidate: Point2D,
  preferredWallId?: string | null,
): Point2D {
  const ref =
    (preferredWallId ? refs.find((item) => item.wallId === preferredWallId) : null) ?? refs[0]
  if (!ref) return candidate

  const wall = walls.find((item) => item.id === ref.wallId)
  if (!wall) return candidate

  const anchor = ref.end === 'a' ? wall.b : wall.a
  const dx = Math.abs(candidate.x - anchor.x)
  const dy = Math.abs(candidate.y - anchor.y)
  if (dx >= dy) {
    return { x: candidate.x, y: anchor.y }
  }
  return { x: anchor.x, y: candidate.y }
}

/**
 * Shift-snap: elk verbonden segment blijft H/V t.o.v. zijn vaste andere eindpunt.
 * Werkt voor gesplitste muren (collinear) en hoeken (x én y vast).
 */
export function applyShiftSnapAxisAligned(
  walls: Wall[],
  refs: WallEndRef[],
  candidate: Point2D,
): Point2D {
  const horizontalYs: number[] = []
  const verticalXs: number[] = []

  for (const ref of refs) {
    const wall = walls.find((item) => item.id === ref.wallId)
    if (!wall) continue
    const anchor = ref.end === 'a' ? wall.b : wall.a
    if (isWallSegmentHorizontal(wall)) {
      horizontalYs.push(anchor.y)
    } else {
      verticalXs.push(anchor.x)
    }
  }

  return {
    x: verticalXs.length > 0 ? verticalXs[0] : candidate.x,
    y: horizontalYs.length > 0 ? horizontalYs[0] : candidate.y,
  }
}

/** Shift-snap voor knooppunten met meerdere muur-einden (bv. na split). */
export function applyShiftSnapFromAllOppositeEnds(
  walls: Wall[],
  refs: WallEndRef[],
  candidate: Point2D,
): Point2D {
  if (refs.length === 0) return candidate
  if (refs.length === 1) {
    return applyShiftSnapFromOppositeEnd(walls, refs, candidate, refs[0].wallId)
  }
  return applyShiftSnapAxisAligned(walls, refs, candidate)
}

/** Lichte H/V-snap naar andere muuruiteinden (onafhankelijk per as). */
export function snapToNearbyEndpointAxes(
  walls: Wall[],
  movingRefs: WallEndRef[],
  candidate: Point2D,
  radiusCm = ENDPOINT_SNAP_RADIUS_CM,
): Point2D {
  const movingKeys = new Set(movingRefs.map((ref) => refKey(ref)))
  const snapXs: number[] = []
  const snapYs: number[] = []

  for (const wall of walls) {
    for (const end of ['a', 'b'] as const) {
      const key = `${wall.id}:${end}`
      if (movingKeys.has(key)) continue
      snapXs.push(wall[end].x)
      snapYs.push(wall[end].y)
    }
  }

  let x = candidate.x
  let y = candidate.y
  let bestDx = radiusCm
  let bestDy = radiusCm

  for (const targetX of snapXs) {
    const dx = Math.abs(candidate.x - targetX)
    if (dx < bestDx) {
      bestDx = dx
      x = targetX
    }
  }
  for (const targetY of snapYs) {
    const dy = Math.abs(candidate.y - targetY)
    if (dy < bestDy) {
      bestDy = dy
      y = targetY
    }
  }

  return { x, y }
}

export function snapPointToJunctions(
  junctions: JunctionNode[],
  point: Point2D,
  maxDistCm: number,
): Point2D {
  let best: Point2D = point
  let bestDist = maxDistCm
  for (const junction of junctions) {
    const dist = distance(point, junction)
    if (dist <= bestDist) {
      bestDist = dist
      best = { x: junction.x, y: junction.y }
    }
  }
  return best
}

export function snapDrawWallEndpoint(
  start: Point2D,
  candidate: Point2D,
  axisLock: boolean,
): Point2D {
  if (!axisLock) return candidate
  const dx = Math.abs(candidate.x - start.x)
  const dy = Math.abs(candidate.y - start.y)
  if (dx >= dy) return { x: candidate.x, y: start.y }
  return { x: start.x, y: candidate.y }
}
