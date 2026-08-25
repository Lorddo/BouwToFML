import type { FloorDimension, Point2D } from './types'

/** Horizontale lijn (langste as X) schuift in Y; verticale in X. */
export function dimensionSlideAxis(a: Point2D, b: Point2D): 'x' | 'y' {
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'y' : 'x'
}

/** Verschuif de lijn loodrecht op zichzelf; lengte blijft. */
export function offsetDimensionForSlide<T extends { a: Point2D; b: Point2D }>(
  dim: T,
  pointerDelta: Point2D,
): T {
  const axis = dimensionSlideAxis(dim.a, dim.b)
  const d = axis === 'y' ? pointerDelta.y : pointerDelta.x
  if (Math.abs(d) < 1e-12) return dim
  if (axis === 'y') {
    return { ...dim, a: { x: dim.a.x, y: dim.a.y + d }, b: { x: dim.b.x, y: dim.b.y + d } }
  }
  return { ...dim, a: { x: dim.a.x + d, y: dim.a.y }, b: { x: dim.b.x + d, y: dim.b.y } }
}

export function distancePointToDimension(point: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-12) return Math.hypot(point.x - a.x, point.y - a.y)
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

export function hitTestDimensionAtCm(
  cm: Point2D,
  dims: ReadonlyArray<Pick<FloorDimension, 'id' | 'a' | 'b'>>,
  tolCm: number,
): string | null {
  let bestId: string | null = null
  let bestDist = tolCm
  for (const dim of dims) {
    const dist = distancePointToDimension(cm, dim.a, dim.b)
    if (dist <= bestDist) {
      bestId = dim.id
      bestDist = dist
    }
  }
  return bestId
}
