import type { FloorArea, Point2D } from '@/core/plan/types'

/** Area-hoek volgt de schuifmuur tot deze afstand (cm). */
export const WALL_MOVE_AREA_TOUCH_CM = 12

function hypot(dx: number, dy: number): number {
  return Math.hypot(dx, dy)
}

export function areaSpanAlongDir(poly: readonly Point2D[], dir: Point2D): number {
  const len = hypot(dir.x, dir.y)
  if (len < 1e-9) return 0
  const ux = dir.x / len
  const uy = dir.y / len
  let min = Infinity
  let max = -Infinity
  for (const p of poly) {
    const t = p.x * ux + p.y * uy
    if (t < min) min = t
    if (t > max) max = t
  }
  return max - min
}

function distToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function areaTouchesWall(
  poly: readonly Point2D[],
  wall: { a: Point2D; b: Point2D },
  maxDistCm = WALL_MOVE_AREA_TOUCH_CM,
): boolean {
  return poly.some((p) => distToSegment(p, wall.a, wall.b) <= maxDistCm)
}

function centroid(poly: readonly Point2D[]): Point2D {
  let x = 0
  let y = 0
  for (const p of poly) {
    x += p.x
    y += p.y
  }
  const n = Math.max(1, poly.length)
  return { x: x / n, y: y / n }
}

function sideAlong(point: Point2D, origin: Point2D, dir: Point2D): number {
  return (point.x - origin.x) * dir.x + (point.y - origin.y) * dir.y
}

export function wallMid(wall: { a: Point2D; b: Point2D }): Point2D {
  return { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
}

/** +1 als +slideDir de kamer groter maakt. */
export function areaGrowSign(
  poly: readonly Point2D[],
  wall: { a: Point2D; b: Point2D },
  slideDir: Point2D,
): 1 | -1 {
  const rel = sideAlong(centroid(poly), wallMid(wall), slideDir)
  return rel < 0 ? 1 : -1
}

export function pickWallMoveArea(
  areas: readonly FloorArea[] | undefined,
  wall: { a: Point2D; b: Point2D },
  slideDir: Point2D,
  pointerSide: number,
): FloorArea | null {
  const touching = (areas ?? []).filter(
    (area) => area.poly.length >= 3 && areaTouchesWall(area.poly, wall),
  )
  if (touching.length === 0) return null
  if (touching.length === 1 || Math.abs(pointerSide) < 1e-6) return touching[0]
  const mid = wallMid(wall)
  let best: FloorArea | null = null
  let bestScore = Infinity
  for (const area of touching) {
    const side = sideAlong(centroid(area.poly), mid, slideDir)
    if (side * pointerSide < 0) continue
    const score = Math.abs(side)
    if (score < bestScore) {
      bestScore = score
      best = area
    }
  }
  return best ?? touching[0]
}

export type WallMoveMeasureKind = 'area' | 'delta'

export interface WallMoveMeasure {
  kind: WallMoveMeasureKind
  lengthCm: number
  growSign: 1 | -1
}

export function resolveWallMoveMeasure(args: {
  areas: readonly FloorArea[] | undefined
  wall: { a: Point2D; b: Point2D }
  slideDir: Point2D
  delta: number
  pointerSide: number
}): WallMoveMeasure {
  const area = pickWallMoveArea(args.areas, args.wall, args.slideDir, args.pointerSide)
  if (area) {
    return {
      kind: 'area',
      lengthCm: areaSpanAlongDir(area.poly, args.slideDir),
      growSign: areaGrowSign(area.poly, args.wall, args.slideDir),
    }
  }
  return { kind: 'delta', lengthCm: Math.abs(args.delta), growSign: 1 }
}

/** Typ-doel (cm) → slide-delta vanaf de basis. */
export function slideDeltaFromTypedCm(args: {
  kind: WallMoveMeasureKind
  typedCm: number
  currentDelta: number
  currentLengthCm: number
  growSign: 1 | -1
}): number {
  if (args.kind === 'delta') return args.typedCm
  return args.currentDelta + (args.typedCm - args.currentLengthCm) * args.growSign
}
