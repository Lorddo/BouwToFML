import type { Opening, Point2D, Wall } from '@/core/plan/types'
import { connectorInsetAlong } from './plan-canvas-draw-measure'
import { type MeasureLine } from './plan-canvas-measure'
import { OPENING_MOVE_MEASURE_INSET_CM } from './plan-canvas-opening-move-measure'

const EPS = 1e-6

type ThickWall = Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'> & {
  id?: string
  openings?: readonly Pick<Opening, 't' | 'width'>[]
}

type JunctionLike = {
  id: string
  refs: readonly { wallId: string }[]
}

function offsetAlongNormal(p: Point2D, nx: number, ny: number, offsetCm: number): Point2D {
  return { x: p.x + nx * offsetCm, y: p.y + ny * offsetCm }
}

/**
 * Binnenmaten langs een muursegment (zelfde inset/offset als opening-restmaten).
 * Geen openingen → één lijn binnenkant A → binnenkant B.
 * Wel openingen → keten: A → opening, tussen openingen, opening → B.
 */
export function buildWallInternalMeasureLines(
  wall: ThickWall,
  walls: ReadonlyArray<ThickWall> = [wall],
): MeasureLine[] {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len = Math.hypot(dx, dy)
  if (len < EPS) return []

  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  const offsetCm = Math.max(0, wall.thickness ?? 0) / 2 + OPENING_MOVE_MEASURE_INSET_CM

  const insetA = connectorInsetAlong(wall.a, { x: ux, y: uy }, walls)
  const insetB = connectorInsetAlong(wall.b, { x: -ux, y: -uy }, walls)
  const startAlong = Math.min(Math.max(0, insetA), len)
  const endAlong = Math.max(startAlong, Math.min(len, len - insetB))
  if (endAlong - startAlong < EPS) return []

  const onAxis = (along: number): Point2D => ({
    x: wall.a.x + ux * along,
    y: wall.a.y + uy * along,
  })
  const at = (along: number): Point2D => offsetAlongNormal(onAxis(along), nx, ny, offsetCm)

  const intervals = (wall.openings ?? [])
    .map((opening) => {
      const t = Number.isFinite(opening.t) ? Math.max(0, Math.min(1, opening.t)) : 0.5
      const half = Math.max(0.5, (opening.width ?? 0) / 2)
      const center = t * len
      return {
        left: center - half,
        right: center + half,
      }
    })
    .sort((a, b) => a.left - b.left)

  const prefix = wall.id ? `wall-internal:${wall.id}` : 'wall-internal'
  const lines: MeasureLine[] = []
  let cursor = startAlong
  let index = 0

  for (const interval of intervals) {
    const left = Math.max(cursor, Math.min(interval.left, endAlong))
    if (left - cursor > -EPS) {
      lines.push({ id: `${prefix}:${index}`, a: at(cursor), b: at(left) })
      index += 1
    }
    cursor = Math.max(cursor, Math.min(endAlong, interval.right))
  }

  if (endAlong - cursor > -EPS) {
    lines.push({ id: `${prefix}:${index}`, a: at(cursor), b: at(endAlong) })
  }

  return lines
}

export function buildWallsInternalMeasureLines(
  wallIds: readonly string[],
  walls: ReadonlyArray<Wall>,
): MeasureLine[] {
  if (wallIds.length === 0) return []
  const byId = new Map(walls.map((wall) => [wall.id, wall]))
  const lines: MeasureLine[] = []
  for (const id of wallIds) {
    const wall = byId.get(id)
    if (!wall) continue
    lines.push(...buildWallInternalMeasureLines(wall, walls))
  }
  return lines
}

export function wallIdsForJunctionMove(
  junctionId: string,
  junctions: readonly JunctionLike[],
): string[] {
  const junction = junctions.find((item) => item.id === junctionId)
  if (!junction) return []
  return [...new Set(junction.refs.map((ref) => ref.wallId))]
}

export function wallIdsForSegmentMove(
  wallId: string,
  junctions: readonly JunctionLike[],
): string[] {
  const ids = new Set<string>([wallId])
  for (const junction of junctions) {
    if (!junction.refs.some((ref) => ref.wallId === wallId)) continue
    for (const ref of junction.refs) ids.add(ref.wallId)
  }
  return [...ids]
}
