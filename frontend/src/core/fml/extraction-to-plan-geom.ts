export interface Point2D {
  x: number
  y: number
}

/** Clamp semantic `balancePx` naar Floorplanner FML 0..1 (fractie links van a→b). */
export const FML_WALL_BALANCE_MIN = 0
export const FML_WALL_BALANCE_MAX = 1
export const FML_WALL_BALANCE_FALLBACK = 0.5

export function toCmX(px: number, pxPerMmX: number): number {
  return px / pxPerMmX / 10
}

export function toCmY(px: number, pxPerMmY: number): number {
  return px / pxPerMmY / 10
}

export function resolveBalance(balancePx: number | undefined): number {
  if (!Number.isFinite(balancePx)) return FML_WALL_BALANCE_FALLBACK
  const clamped = Math.min(
    FML_WALL_BALANCE_MAX,
    Math.max(FML_WALL_BALANCE_MIN, balancePx ?? FML_WALL_BALANCE_FALLBACK),
  )
  return Math.round(clamped * 100) / 100
}

export function normalize(vec: Point2D): Point2D | null {
  const len = Math.hypot(vec.x, vec.y)
  if (len <= 1e-6) return null
  return { x: vec.x / len, y: vec.y / len }
}

export function dot(a: Point2D, b: Point2D): number {
  return a.x * b.x + a.y * b.y
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function projectPointToSegmentT(point: Point2D, segA: Point2D, segB: Point2D): number {
  const dx = segB.x - segA.x
  const dy = segB.y - segA.y
  const len2 = dx * dx + dy * dy
  if (len2 <= 1e-6) return 0
  const t = ((point.x - segA.x) * dx + (point.y - segA.y) * dy) / len2
  return clamp01(t)
}

/** Raw hypot in cm (geen floor). Voor L12/L14 span-gate vóór DTO. */
export function spanWidthCmBetweenPoints(
  start: Point2D,
  end: Point2D,
  pxPerMmX: number,
  pxPerMmY: number,
): number {
  const dxCm = toCmX(end.x - start.x, pxPerMmX)
  const dyCm = toCmY(end.y - start.y, pxPerMmY)
  return Math.hypot(dxCm, dyCm)
}

// ESC:X-24 (B)
/** Minimale openingsspan in cm (L12/L14 gate; niet floored widthCmBetweenPoints). */
export const MIN_OPENING_SPAN_CM = 0.5

export function isValidOpeningSpanCm(widthCm: number): boolean {
  return Number.isFinite(widthCm) && widthCm > MIN_OPENING_SPAN_CM
}

export function widthCmBetweenPoints(
  start: Point2D,
  end: Point2D,
  pxPerMmX: number,
  pxPerMmY: number,
): number {
  return Math.max(1, spanWidthCmBetweenPoints(start, end, pxPerMmX, pxPerMmY))
}

export function flipMirrored(mirrored: [number, number]): [number, number] {
  return [mirrored[0] === 1 ? 0 : 1, mirrored[1] === 1 ? 0 : 1]
}

export function pointAlongSegment(segA: Point2D, segB: Point2D, t: number): Point2D {
  return {
    x: segA.x + (segB.x - segA.x) * t,
    y: segA.y + (segB.y - segA.y) * t,
  }
}
