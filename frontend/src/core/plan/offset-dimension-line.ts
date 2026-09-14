import type { FloorDimension, Point2D } from './types'

/** Minimum lengte bij punt-sleep of getypte maat (cm). */
export const MIN_DIMENSION_LENGTH_CM = 1

export type DimensionEnd = 'a' | 'b'

/** Horizontale lijn (langste as X) schuift in Y; verticale in X. */
export function dimensionSlideAxis(a: Point2D, b: Point2D): 'x' | 'y' {
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'y' : 'x'
}

export function dimensionLengthCm(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function dimensionAxisUnit(a: Point2D, b: Point2D): Point2D {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return { x: 1, y: 0 }
  return { x: dx / len, y: dy / len }
}

/** Lengte wijzigen vanuit het midden; richting blijft. */
export function setDimensionLengthCentered<T extends { a: Point2D; b: Point2D }>(
  dim: T,
  lengthCm: number,
): T {
  const half = Math.max(MIN_DIMENSION_LENGTH_CM, lengthCm) / 2
  const ux = dimensionAxisUnit(dim.a, dim.b)
  const mx = (dim.a.x + dim.b.x) / 2
  const my = (dim.a.y + dim.b.y) / 2
  return {
    ...dim,
    a: { x: mx - ux.x * half, y: my - ux.y * half },
    b: { x: mx + ux.x * half, y: my + ux.y * half },
  }
}

/** Sleep één eindpunt langs de bestaande as; de andere kant blijft. */
export function moveDimensionEndpointAlongAxis<T extends { a: Point2D; b: Point2D }>(
  dim: T,
  end: DimensionEnd,
  point: Point2D,
): T {
  const ux = dimensionAxisUnit(dim.a, dim.b)
  const t = (point.x - dim.a.x) * ux.x + (point.y - dim.a.y) * ux.y
  const projected = { x: dim.a.x + ux.x * t, y: dim.a.y + ux.y * t }
  if (end === 'a') {
    const dist = Math.hypot(dim.b.x - projected.x, dim.b.y - projected.y)
    if (dist < MIN_DIMENSION_LENGTH_CM) {
      return {
        ...dim,
        a: {
          x: dim.b.x - ux.x * MIN_DIMENSION_LENGTH_CM,
          y: dim.b.y - ux.y * MIN_DIMENSION_LENGTH_CM,
        },
      }
    }
    return { ...dim, a: projected }
  }
  const dist = Math.hypot(projected.x - dim.a.x, projected.y - dim.a.y)
  if (dist < MIN_DIMENSION_LENGTH_CM) {
    return {
      ...dim,
      b: {
        x: dim.a.x + ux.x * MIN_DIMENSION_LENGTH_CM,
        y: dim.a.y + ux.y * MIN_DIMENSION_LENGTH_CM,
      },
    }
  }
  return { ...dim, b: projected }
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

/**
 * Na een loodrechte slide: magnet naar evenwijdige andere maatlijnen
 * (zelfde H/V-as, andere offset).
 */
export function snapDimensionSlideToParallel<T extends { a: Point2D; b: Point2D }>(
  dim: T,
  others: ReadonlyArray<Pick<FloorDimension, 'id' | 'a' | 'b'>>,
  radiusCm: number,
  excludeId?: string | null,
): T {
  if (radiusCm <= 0) return dim
  const axis = dimensionSlideAxis(dim.a, dim.b)
  let best = radiusCm
  let snapped: T | null = null
  for (const other of others) {
    if (excludeId && other.id === excludeId) continue
    if (dimensionSlideAxis(other.a, other.b) !== axis) continue
    if (axis === 'y') {
      const y = (other.a.y + other.b.y) / 2
      const d = Math.abs(y - dim.a.y)
      if (d <= best) {
        best = d
        snapped = { ...dim, a: { x: dim.a.x, y }, b: { x: dim.b.x, y } }
      }
    } else {
      const x = (other.a.x + other.b.x) / 2
      const d = Math.abs(x - dim.a.x)
      if (d <= best) {
        best = d
        snapped = { ...dim, a: { x, y: dim.a.y }, b: { x, y: dim.b.y } }
      }
    }
  }
  return snapped ?? dim
}

export function manualsAsSnapWalls(
  dims: ReadonlyArray<Pick<FloorDimension, 'id' | 'a' | 'b'>>,
  excludeId?: string | null,
): Array<{ a: Point2D; b: Point2D; thickness: number; balance: number }> {
  const out: Array<{ a: Point2D; b: Point2D; thickness: number; balance: number }> = []
  for (const dim of dims) {
    if (excludeId && dim.id === excludeId) continue
    out.push({ a: { ...dim.a }, b: { ...dim.b }, thickness: 0, balance: 0.5 })
  }
  return out
}

export function collectManualDimensionEndpoints(
  dims: ReadonlyArray<Pick<FloorDimension, 'id' | 'a' | 'b'>>,
  excludeId?: string | null,
): Point2D[] {
  const out: Point2D[] = []
  for (const dim of dims) {
    if (excludeId && dim.id === excludeId) continue
    out.push({ x: dim.a.x, y: dim.a.y }, { x: dim.b.x, y: dim.b.y })
  }
  return out
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

export function hitTestDimensionEndpointAtCm(
  cm: Point2D,
  dims: ReadonlyArray<Pick<FloorDimension, 'id' | 'a' | 'b'>>,
  tolCm: number,
): { id: string; end: DimensionEnd } | null {
  let best: { id: string; end: DimensionEnd } | null = null
  let bestDist = tolCm
  for (const dim of dims) {
    const distA = Math.hypot(cm.x - dim.a.x, cm.y - dim.a.y)
    if (distA <= bestDist) {
      best = { id: dim.id, end: 'a' }
      bestDist = distA
    }
    const distB = Math.hypot(cm.x - dim.b.x, cm.y - dim.b.y)
    if (distB <= bestDist) {
      best = { id: dim.id, end: 'b' }
      bestDist = distB
    }
  }
  return best
}
