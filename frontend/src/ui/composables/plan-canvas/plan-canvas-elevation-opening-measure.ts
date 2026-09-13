import type { ElevationRect, ElevationWallRect } from '@/core/fml/facade-elevation'
import { elevationWallYsAtX } from '@/core/fml/facade-elevation'
import { OPENING_MOVE_MEASURE_INSET_CM } from './plan-canvas-opening-move-measure'
import { type MeasureLine, measureDistanceCm } from './plan-canvas-measure'

const EPS = 1e-6
/** Zet horizontale rest boven de opening als de dorpel bijna op de vloer zit. */
const NEAR_EDGE_CM = 12

export type ElevationOpeningMeasureLengths = {
  leftCm: number
  rightCm: number
  floorCm: number
  ceilingCm: number
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

/**
 * Restmaten in het gevel-aanzicht tijdens verplaatsen/resizen:
 * binnenkant-X → opening, opening → binnenkant-X,
 * vloer → dorpel, latei → plafond (muurtop op het opening-midden).
 * Lijnen liggen iets naast de opening (zelfde inset als plattegrond-restmaten).
 */
export function buildElevationOpeningMeasureLines(
  wall: ElevationWallRect,
  opening: ElevationRect,
): MeasureLine[] {
  const wallLeft = Math.min(wall.innerATop.x, wall.innerBTop.x)
  const wallRight = Math.max(wall.innerATop.x, wall.innerBTop.x)
  if (wallRight - wallLeft < EPS) return []

  const ox0 = Math.min(opening.x0, opening.x1)
  const ox1 = Math.max(opening.x0, opening.x1)
  const oy0 = Math.min(opening.y0, opening.y1)
  const oy1 = Math.max(opening.y0, opening.y1)

  const outerLo = Math.min(wall.aTop.x, wall.bTop.x)
  const outerHi = Math.max(wall.aTop.x, wall.bTop.x)
  const midX = clamp((ox0 + ox1) / 2, outerLo, outerHi)
  const ys = elevationWallYsAtX(wall, midX)
  if (!ys) return []

  const inset = OPENING_MOVE_MEASURE_INSET_CM
  const nearFloor = ys.bot - oy1 < NEAR_EDGE_CM
  const hY = nearFloor ? oy0 - inset : oy1 + inset
  const nearRight = wallRight - ox1 < NEAR_EDGE_CM
  const vX = nearRight ? ox0 - inset : ox1 + inset

  return [
    { id: 'elev-opening-left', a: { x: wallLeft, y: hY }, b: { x: ox0, y: hY } },
    { id: 'elev-opening-right', a: { x: ox1, y: hY }, b: { x: wallRight, y: hY } },
    { id: 'elev-opening-floor', a: { x: vX, y: oy1 }, b: { x: vX, y: ys.bot } },
    { id: 'elev-opening-ceiling', a: { x: vX, y: oy0 }, b: { x: vX, y: ys.top } },
  ]
}

export function elevationOpeningMeasureLengthsCm(
  wall: ElevationWallRect,
  opening: ElevationRect,
): ElevationOpeningMeasureLengths | null {
  const lines = buildElevationOpeningMeasureLines(wall, opening)
  if (lines.length < 4) return null
  return {
    leftCm: measureDistanceCm(lines[0].a, lines[0].b),
    rightCm: measureDistanceCm(lines[1].a, lines[1].b),
    floorCm: measureDistanceCm(lines[2].a, lines[2].b),
    ceilingCm: measureDistanceCm(lines[3].a, lines[3].b),
  }
}
