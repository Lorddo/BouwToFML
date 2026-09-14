import type { Point2D } from './types'

/**
 * Handle-hit: geselecteerd punt wint bij overlap.
 * Geen nearest-wins over het hele vlak — alleen punten binnen `tol`.
 */
export function hitSelectedVertex(
  points: ReadonlyArray<Point2D>,
  click: Point2D,
  tol: number,
  preferIndex?: number | null,
): number | null {
  if (preferIndex != null && preferIndex >= 0 && preferIndex < points.length) {
    const preferred = points[preferIndex]
    if (preferred && Math.hypot(click.x - preferred.x, click.y - preferred.y) <= tol) {
      return preferIndex
    }
  }
  let best = -1
  let bestDist = tol
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]
    if (!point) continue
    const dist = Math.hypot(click.x - point.x, click.y - point.y)
    if (dist <= bestDist) {
      best = i
      bestDist = dist
    }
  }
  return best >= 0 ? best : null
}

export function pointInPoly(point: Point2D, polygon: ReadonlyArray<Point2D>): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    if (!a || !b) continue
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + Number.EPSILON) + a.x
    if (intersects) inside = !inside
  }
  return inside
}
