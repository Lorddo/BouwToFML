import type { ElevationJunction, ElevationWallRect } from '@/core/fml/facade-elevation'
import { OPENING_MOVE_MEASURE_INSET_CM } from './fml-preview-opening-move-measure'
import { type MeasureLine, measureDistanceCm } from './fml-preview-measure'

const EPS = 1e-6
/** Eindhoogtes apart tonen als het vlak meer dan 1 cm scheef is. */
const SLOPE_SPLIT_CM = 1

export type ElevationWallFaceMeasureLengths = {
  heightLeftCm: number
  heightRightCm: number
}

function wallEndYs(wall: ElevationWallRect, left: boolean): { top: number; bot: number } {
  const aIsLeft = wall.aTop.x <= wall.bTop.x
  const useA = left === aIsLeft
  return useA
    ? { top: wall.aTop.y, bot: wall.aBottom.y }
    : { top: wall.bTop.y, bot: wall.bBottom.y }
}

/**
 * Hoogte van het hele gevelvlak (niet rond ramen/deuren).
 * Lijnen liggen naast de muur. Rechte muur = één hoogte rechts;
 * scheve kopgevel = beide einden.
 */
export function buildElevationWallFaceMeasureLines(wall: ElevationWallRect): MeasureLine[] {
  const left = Math.min(wall.aTop.x, wall.bTop.x)
  const right = Math.max(wall.aTop.x, wall.bTop.x)
  if (right - left < EPS) return []

  const inset = OPENING_MOVE_MEASURE_INSET_CM
  const leftYs = wallEndYs(wall, true)
  const rightYs = wallEndYs(wall, false)
  const leftH = Math.abs(leftYs.bot - leftYs.top)
  const rightH = Math.abs(rightYs.bot - rightYs.top)
  if (leftH < EPS && rightH < EPS) return []

  if (Math.abs(leftH - rightH) > SLOPE_SPLIT_CM) {
    return [
      {
        id: 'elev-wall-height-left',
        a: { x: left - inset, y: leftYs.top },
        b: { x: left - inset, y: leftYs.bot },
      },
      {
        id: 'elev-wall-height-right',
        a: { x: right + inset, y: rightYs.top },
        b: { x: right + inset, y: rightYs.bot },
      },
    ]
  }

  return [
    {
      id: 'elev-wall-height',
      a: { x: right + inset, y: rightYs.top },
      b: { x: right + inset, y: rightYs.bot },
    },
  ]
}

export function elevationWallFaceMeasureLengthsCm(
  wall: ElevationWallRect,
): ElevationWallFaceMeasureLengths | null {
  const lines = buildElevationWallFaceMeasureLines(wall)
  if (lines.length === 0) return null
  if (lines.length === 1) {
    const heightCm = measureDistanceCm(lines[0].a, lines[0].b)
    return { heightLeftCm: heightCm, heightRightCm: heightCm }
  }
  return {
    heightLeftCm: measureDistanceCm(lines[0].a, lines[0].b),
    heightRightCm: measureDistanceCm(lines[1].a, lines[1].b),
  }
}

/** Knoop-hoogte naast de knoop (zelfde inset); nok slaat over. */
export function buildElevationJunctionHeightMeasureLines(
  junction: Pick<ElevationJunction, 'id' | 'x' | 'yTop' | 'yBot' | 'ridge'>,
): MeasureLine[] {
  if (junction.ridge) return []
  if (Math.abs(junction.yBot - junction.yTop) < EPS) return []
  const inset = OPENING_MOVE_MEASURE_INSET_CM
  return [
    {
      id: `elev-junction-height:${junction.id}`,
      a: { x: junction.x + inset, y: junction.yTop },
      b: { x: junction.x + inset, y: junction.yBot },
    },
  ]
}
