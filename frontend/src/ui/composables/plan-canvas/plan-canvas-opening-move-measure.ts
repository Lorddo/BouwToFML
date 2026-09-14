import type { Opening, Point2D, Wall } from '@/core/plan/types'
import { connectorInsetAlong } from './plan-canvas-draw-measure'
import { type MeasureLine, measureDistanceCm } from './plan-canvas-measure'

/** Extra inset buiten de muurdikte zodat de lijn naast de hartlijn ligt (cm). */
export const OPENING_MOVE_MEASURE_INSET_CM = 8

const EPS = 1e-6

type ThickWall = Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>

function offsetAlongNormal(p: Point2D, nx: number, ny: number, offsetCm: number): Point2D {
  return { x: p.x + nx * offsetCm, y: p.y + ny * offsetCm }
}

/**
 * Restmaten langs het muursegment (binnenmaat):
 * binnenkant eind A → linker openingrand, rechter rand → binnenkant eind B.
 * Eind-insets = connector-dikte van loodrechte buren (zelfde als muur/kamer-tekenen).
 * Lijnen liggen loodrecht naast de hartlijn (thickness/2 + inset).
 */
export function buildOpeningMoveMeasureLines(
  wall: ThickWall,
  opening: Pick<Opening, 't' | 'width'>,
  walls: ReadonlyArray<ThickWall> = [wall],
): MeasureLine[] {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len = Math.hypot(dx, dy)
  if (len < EPS) return []

  const ux = dx / len
  const uy = dy / len
  // Left normal (a→b): (−uy, ux)
  const nx = -uy
  const ny = ux
  const offsetCm = Math.max(0, wall.thickness ?? 0) / 2 + OPENING_MOVE_MEASURE_INSET_CM

  const insetA = connectorInsetAlong(wall.a, { x: ux, y: uy }, walls)
  const insetB = connectorInsetAlong(wall.b, { x: -ux, y: -uy }, walls)

  const t = Number.isFinite(opening.t) ? Math.max(0, Math.min(1, opening.t)) : 0.5
  const half = Math.max(0.5, (opening.width ?? 0) / 2)
  const centerAlong = t * len
  const leftAlong = centerAlong - half
  const rightAlong = centerAlong + half

  // Binnenkant: as-eind + connector-inset (meetbare hoek → kozijn).
  const startAlong = Math.min(Math.max(0, insetA), len)
  const endAlong = Math.max(startAlong, Math.min(len, len - insetB))

  const onAxis = (along: number): Point2D => ({
    x: wall.a.x + ux * along,
    y: wall.a.y + uy * along,
  })

  const aInner = offsetAlongNormal(onAxis(startAlong), nx, ny, offsetCm)
  const leftEdge = offsetAlongNormal(onAxis(leftAlong), nx, ny, offsetCm)
  const rightEdge = offsetAlongNormal(onAxis(rightAlong), nx, ny, offsetCm)
  const bInner = offsetAlongNormal(onAxis(endAlong), nx, ny, offsetCm)

  return [
    { id: 'opening-move-left', a: aInner, b: leftEdge },
    { id: 'opening-move-right', a: rightEdge, b: bInner },
  ]
}

export function openingMoveMeasureLengthsCm(
  wall: ThickWall,
  opening: Pick<Opening, 't' | 'width'>,
  walls: ReadonlyArray<ThickWall> = [wall],
): { leftCm: number; rightCm: number } | null {
  const lines = buildOpeningMoveMeasureLines(wall, opening, walls)
  if (lines.length < 2) return null
  return {
    leftCm: measureDistanceCm(lines[0].a, lines[0].b),
    rightCm: measureDistanceCm(lines[1].a, lines[1].b),
  }
}
