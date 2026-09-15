import type { ElevationJunction, ElevationWallRect } from '@/core/plan/facade-elevation'
import type { Point2D } from '@/core/plan/types'
import { OPENING_MOVE_MEASURE_INSET_CM } from '@/ui/composables/canvas-kernel/plan-canvas-opening-move-measure'
import { type MeasureLine, measureDistanceCm } from '@/ui/composables/canvas-kernel/plan-canvas-measure'

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

/**
 * Nokhoogte tot de verdiepingsvloer (onderkant balk → vloer), naast het segment.
 * Scheve nok = beide einden.
 */
export function buildElevationRidgeHeightMeasureLines(
  wall: ElevationWallRect,
  floorY: number,
): MeasureLine[] {
  const left = Math.min(wall.aTop.x, wall.bTop.x, wall.aBottom.x, wall.bBottom.x)
  const right = Math.max(wall.aTop.x, wall.bTop.x, wall.aBottom.x, wall.bBottom.x)
  const inset = OPENING_MOVE_MEASURE_INSET_CM
  const leftYs = wallEndYs(wall, true)
  const rightYs = wallEndYs(wall, false)
  const leftH = Math.abs(leftYs.bot - floorY)
  const rightH = Math.abs(rightYs.bot - floorY)
  if (leftH < EPS && rightH < EPS) return []

  if (right - left < EPS) {
    return [
      {
        id: 'elev-ridge-height',
        a: { x: right + inset, y: rightYs.bot },
        b: { x: right + inset, y: floorY },
      },
    ]
  }

  if (Math.abs(leftH - rightH) > SLOPE_SPLIT_CM) {
    return [
      {
        id: 'elev-ridge-height-left',
        a: { x: left - inset, y: leftYs.bot },
        b: { x: left - inset, y: floorY },
      },
      {
        id: 'elev-ridge-height-right',
        a: { x: right + inset, y: rightYs.bot },
        b: { x: right + inset, y: floorY },
      },
    ]
  }

  return [
    {
      id: 'elev-ridge-height',
      a: { x: right + inset, y: rightYs.bot },
      b: { x: right + inset, y: floorY },
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

/**
 * Hoogte van een dakvlak-punt tot de verdiepingsvloer (hart van de plaat),
 * naast het punt — zelfde overlay als knoop/nok.
 */
export function buildElevationRoofVertexHeightMeasureLines(
  point: Point2D,
  floorY: number,
  vertexIndex = 0,
): MeasureLine[] {
  const inset = OPENING_MOVE_MEASURE_INSET_CM
  if (Math.abs(point.y - floorY) < EPS) return []
  return [
    {
      id: `elev-roof-vertex-height:${vertexIndex}`,
      a: { x: point.x + inset, y: point.y },
      b: { x: point.x + inset, y: floorY },
    },
  ]
}

/** Knoop-hoogte naast de knoop (zelfde inset). Nok = onderkant tot vloer. */
export function buildElevationJunctionHeightMeasureLines(
  junction: Pick<ElevationJunction, 'id' | 'x' | 'yTop' | 'yBot' | 'ridge'>,
  floorY?: number,
): MeasureLine[] {
  const inset = OPENING_MOVE_MEASURE_INSET_CM
  if (junction.ridge) {
    if (floorY == null || Math.abs(junction.yBot - floorY) < EPS) return []
    return [
      {
        id: `elev-junction-height:${junction.id}`,
        a: { x: junction.x + inset, y: junction.yBot },
        b: { x: junction.x + inset, y: floorY },
      },
    ]
  }
  if (Math.abs(junction.yBot - junction.yTop) < EPS) return []
  return [
    {
      id: `elev-junction-height:${junction.id}`,
      a: { x: junction.x + inset, y: junction.yTop },
      b: { x: junction.x + inset, y: junction.yBot },
    },
  ]
}
