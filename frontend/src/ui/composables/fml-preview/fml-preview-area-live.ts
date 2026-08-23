import type { FloorArea, Point2D, Wall } from '@/core/fml/types'

/** Vertex volgt een meebewegende muur/knoop tot deze afstand (cm). */
export const AREA_LIVE_SNAP_CM = 12

const RIGID_EPS_CM = 1e-4
const MIN_MOVE_CM = 1e-6

type WallMove = {
  a: Point2D
  b: Point2D
  da: Point2D
  db: Point2D
  rigid: Point2D | null
}

export function cloneAreasSnapshot(areas: FloorArea[] | undefined): FloorArea[] | undefined {
  if (!areas) return undefined
  return JSON.parse(JSON.stringify(areas)) as FloorArea[]
}

function distToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < MIN_MOVE_CM) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function collectWallMoves(baseWalls: readonly Wall[], nextWalls: readonly Wall[]): WallMove[] {
  const nextById = new Map(nextWalls.map((wall) => [wall.id, wall]))
  const moves: WallMove[] = []
  for (const base of baseWalls) {
    const next = nextById.get(base.id)
    if (!next) continue
    const da = { x: next.a.x - base.a.x, y: next.a.y - base.a.y }
    const db = { x: next.b.x - base.b.x, y: next.b.y - base.b.y }
    if (Math.hypot(da.x, da.y) < MIN_MOVE_CM && Math.hypot(db.x, db.y) < MIN_MOVE_CM) continue
    const rigid =
      Math.abs(da.x - db.x) <= RIGID_EPS_CM && Math.abs(da.y - db.y) <= RIGID_EPS_CM ? da : null
    moves.push({ a: base.a, b: base.b, da, db, rigid })
  }
  return moves
}

function applyVertexMove(p: Point2D, moves: readonly WallMove[]): Point2D {
  let bestDist = AREA_LIVE_SNAP_CM
  let best: Point2D | null = null
  for (const move of moves) {
    const dA = Math.hypot(p.x - move.a.x, p.y - move.a.y)
    if (dA < bestDist) {
      bestDist = dA
      best = move.da
    }
    const dB = Math.hypot(p.x - move.b.x, p.y - move.b.y)
    if (dB < bestDist) {
      bestDist = dB
      best = move.db
    }
    if (move.rigid) {
      const dSeg = distToSegment(p, move.a, move.b)
      if (dSeg < bestDist) {
        bestDist = dSeg
        best = move.rigid
      }
    }
  }
  if (!best) return p
  return { x: p.x + best.x, y: p.y + best.y }
}

/**
 * Verschuif area-vertices mee met muur-deltas. Geen clipper-union:
 * live preview tijdens slide/junction-move. Commit blijft `regenerateFloorAreas`.
 */
export function previewAreasFromWallMove(
  areas: FloorArea[] | undefined,
  baseWalls: readonly Wall[],
  nextWalls: readonly Wall[],
): FloorArea[] | undefined {
  if (!areas?.length) return areas
  const moves = collectWallMoves(baseWalls, nextWalls)
  if (moves.length === 0) return cloneAreasSnapshot(areas)
  return areas.map((area) => ({
    ...area,
    poly: area.poly.map((point) => applyVertexMove(point, moves)),
  }))
}
