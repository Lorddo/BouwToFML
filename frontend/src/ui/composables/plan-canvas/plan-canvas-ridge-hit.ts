import { DEFAULT_RIDGE_DISPLAY_WIDTH_CM, isRidgeWall } from '@/core/plan/ridge-walls'
import type { Point2D, Wall } from '@/core/plan/types'

type RidgeHitWall = Pick<Wall, 'id' | 'a' | 'b' | 'thickness' | 'extras'>

export function distancePointToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function isRidgeHitWall(wall: Pick<Wall, 'thickness' | 'extras'>): boolean {
  return isRidgeWall(wall) || wall.thickness <= 1e-6
}

/** True als het punt binnen de gestippelde nokbalk ligt (helft display-breedte). */
export function pointHitsRidgeBeam(
  point: Point2D,
  a: Point2D,
  b: Point2D,
  displayWidthCm: number,
): boolean {
  const half = Math.max(0, displayWidthCm) / 2
  return distancePointToSegment(point, a, b) <= half + 1e-6
}

/** Dichtstbijzijnde nok waarvan de balk het punt bevat. Geen extra scherm-slop. */
export function hitTestRidgeBeamAtCm(
  walls: ReadonlyArray<RidgeHitWall>,
  point: Point2D,
  displayWidthCm: number = DEFAULT_RIDGE_DISPLAY_WIDTH_CM,
): string | null {
  let bestId: string | null = null
  let bestDist = Number.POSITIVE_INFINITY
  const half = Math.max(0, displayWidthCm) / 2
  for (const wall of walls) {
    if (!isRidgeHitWall(wall)) continue
    const id = wall.id.trim()
    if (!id) continue
    const dist = distancePointToSegment(point, wall.a, wall.b)
    if (dist <= half + 1e-6 && dist < bestDist) {
      bestId = id
      bestDist = dist
    }
  }
  return bestId
}

/** Dak-plattegrond: nokbalk wint van dakvlak; buiten de stippellijnen blijft het vlak. */
export function pickDakPlanOverlayHit(args: {
  ridgeId: string | null
  surfaceId: string | null
}): { kind: 'ridge' | 'surface'; id: string } | null {
  if (args.ridgeId) return { kind: 'ridge', id: args.ridgeId }
  if (args.surfaceId) return { kind: 'surface', id: args.surfaceId }
  return null
}
