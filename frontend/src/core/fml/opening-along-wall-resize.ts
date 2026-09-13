/**
 * Eénrichting-breedte-resize langs een muur (plattegrond + gevel e/w).
 * Vaste kant blijft; alleen de versleepte zijde beweegt.
 */
import type { Opening, Wall } from './types'
import {
  MAX_OPENING_WIDTH_CM,
  MIN_OPENING_WIDTH_CM,
  wallCollinearEnds,
} from '@/ui/components/plan-canvas-openings'

export type OpeningAlongWallSide = 'start' | 'end'

export function openingEdgesAlongWall(
  wall: Pick<Wall, 'a' | 'b'>,
  t: number,
  widthCm: number,
): { left: number; right: number; len: number } {
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
  const center = (Number.isFinite(t) ? t : 0.5) * len
  const half = Math.max(0.5, widthCm / 2)
  return { left: center - half, right: center + half, len }
}

/**
 * Houd de vaste kant van een breedte-resize; knip alleen de versleepte zijde af.
 * `start` = muur-A-zijde (links langs A→B), `end` = muur-B-zijde.
 */
export function clampOpeningWidthKeepOppositeEdge(
  wall: Pick<Wall, 'a' | 'b' | 'thickness'> & { id?: string },
  start: Pick<Opening, 't' | 'width'>,
  next: Pick<Opening, 't' | 'width'>,
  side: OpeningAlongWallSide,
  planWalls: readonly Pick<Wall, 'id' | 'a' | 'b'>[] = [],
  minW = MIN_OPENING_WIDTH_CM,
): { t: number; width: number } {
  const startEdges = openingEdgesAlongWall(wall, start.t, start.width)
  const nextEdges = openingEdgesAlongWall(wall, next.t, next.width)
  const cap = Math.max(0, (wall.thickness ?? 0) / 2)
  const ends = wall.id ? wallCollinearEnds(planWalls, wall.id) : { a: false, b: false }
  let left: number
  let right: number
  if (side === 'end') {
    left = startEdges.left
    const maxRight = ends.b ? Number.POSITIVE_INFINITY : startEdges.len + cap
    right = Math.min(Math.max(left + minW, nextEdges.right), maxRight)
  } else {
    right = startEdges.right
    const minLeft = ends.a ? Number.NEGATIVE_INFINITY : -cap
    left = Math.max(Math.min(right - minW, nextEdges.left), minLeft)
  }
  const width = Math.max(minW, Math.min(MAX_OPENING_WIDTH_CM, right - left))
  if (side === 'end') right = left + width
  else left = right - width
  const t = startEdges.len < 1e-6 ? 0.5 : (left + right) / 2 / startEdges.len
  return {
    t: Number.isFinite(t) ? t : 0.5,
    width: Math.round(width),
  }
}
