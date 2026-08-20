import type { HScaleState } from '@/platform/calibration'
import {
  SCALE_GEOMETRY_FACTOR_MAX,
  SCALE_GEOMETRY_FACTOR_MIN,
  SCALE_RESCALE_MIN_MEASURED_CM,
} from '@/platform/calibration'
import { toCmX, toCmY } from '@/core/fml/extraction-to-plan-geom'
import type { PlanScaleFactors } from '@/core/fml/scale-floor-plan'
import type { Point2D, Wall } from '@/core/fml/types'

/**
 * Pure helpers for stap-4 H/V-liniaal → anisotrope geometry rescale (zoals stap 1).
 * Separated so unit tests need no Vue/workspace harness.
 */

export function resolveRescaleGeometryFactor(measuredCm: number, trueCm: number): number | null {
  if (!(measuredCm >= SCALE_RESCALE_MIN_MEASURED_CM) || !(trueCm > 0)) return null
  if (!Number.isFinite(measuredCm) || !Number.isFinite(trueCm)) return null
  const factor = trueCm / measuredCm
  if (factor < SCALE_GEOMETRY_FACTOR_MIN || factor > SCALE_GEOMETRY_FACTOR_MAX) return null
  if (Math.abs(factor - 1) < 1e-9) return null
  return factor
}

function axisFactor(measuredCm: number, trueMm: number): number | null {
  if (!(measuredCm >= SCALE_RESCALE_MIN_MEASURED_CM) || !(trueMm > 0)) return null
  if (!Number.isFinite(measuredCm) || !Number.isFinite(trueMm)) return null
  const factor = trueMm / 10 / measuredCm
  if (factor < SCALE_GEOMETRY_FACTOR_MIN || factor > SCALE_GEOMETRY_FACTOR_MAX) return null
  return factor
}

/**
 * Aparte H/V-factoren (trueMm / measuredCm), zoals stap-1 schaal.
 * Beide spans ≥ 50 cm; minstens één as ≠ 1.
 */
export function resolveRescaleFactorsFromRulers(params: {
  measuredCmX: number
  measuredCmY: number
  trueMmX: number
  trueMmY: number
}): PlanScaleFactors | null {
  const factorX = axisFactor(params.measuredCmX, params.trueMmX)
  const factorY = axisFactor(params.measuredCmY, params.trueMmY)
  if (factorX == null || factorY == null) return null
  if (Math.abs(factorX - 1) < 1e-9 && Math.abs(factorY - 1) < 1e-9) return null
  return { x: factorX, y: factorY }
}

/** @deprecated alias — gebruik resolveRescaleFactorsFromRulers */
export function resolveRescaleFactorFromRulers(params: {
  measuredCmX: number
  measuredCmY: number
  trueMmX: number
  trueMmY: number
}): PlanScaleFactors | null {
  return resolveRescaleFactorsFromRulers(params)
}

/** |factorX − factorY| / avg als procent (zelfde drempel-idee als stap-1 axisMismatch). */
export function rescaleAxisMismatchPct(params: {
  measuredCmX: number
  measuredCmY: number
  trueMmX: number
  trueMmY: number
}): number {
  const { measuredCmX, measuredCmY, trueMmX, trueMmY } = params
  if (!(measuredCmX > 0) || !(measuredCmY > 0) || !(trueMmX > 0) || !(trueMmY > 0)) return 0
  const factorX = trueMmX / 10 / measuredCmX
  const factorY = trueMmY / 10 / measuredCmY
  const avg = (factorX + factorY) / 2
  if (!(avg > 0)) return 0
  return (Math.abs(factorX - factorY) / avg) * 100
}

export function measuredCmFromRescaleState(state: HScaleState): { x: number; y: number } {
  return {
    x: Math.abs(state.xRight - state.xLeft),
    y: Math.abs(state.yBottom - state.yTop),
  }
}

export type FmlRescaleImageLayout = {
  origin: Point2D
  pxPerMmX: number
  pxPerMmY: number
}

/**
 * Stap-1 pixel-handles → FML-cm via huidige underlay-layout.
 * Nulpunt zit in `origin` (wallCm = imageCm − origin); plek op de scan blijft.
 */
export function fmlRescaleStateFromImageHandles(
  state: HScaleState,
  layout: FmlRescaleImageLayout,
): HScaleState | null {
  if (!(layout.pxPerMmX > 0) || !(layout.pxPerMmY > 0)) return null
  if (!Number.isFinite(layout.pxPerMmX) || !Number.isFinite(layout.pxPerMmY)) return null
  return {
    xLeft: toCmX(state.xLeft, layout.pxPerMmX) - layout.origin.x,
    xRight: toCmX(state.xRight, layout.pxPerMmX) - layout.origin.x,
    xGuideY: toCmY(state.xGuideY, layout.pxPerMmY) - layout.origin.y,
    yTop: toCmY(state.yTop, layout.pxPerMmY) - layout.origin.y,
    yBottom: toCmY(state.yBottom, layout.pxPerMmY) - layout.origin.y,
    yGuideX: toCmX(state.yGuideX, layout.pxPerMmX) - layout.origin.x,
  }
}

/** Stap-1 handles als die er zijn; anders ~70% van de muur-bbox. */
export function resolveFmlRescaleState(params: {
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b'>>
  imageState?: HScaleState | null
  layout?: FmlRescaleImageLayout | null
}): HScaleState | null {
  if (params.imageState && params.layout) {
    const fromStep1 = fmlRescaleStateFromImageHandles(params.imageState, params.layout)
    if (fromStep1) return fromStep1
  }
  return initFmlRescaleStateFromWalls(params.walls)
}

/** Stap-1-achtige H/V-handles in image-pixels (35% span, midden). */
export function initImageScaleHandles(width: number, height: number): HScaleState | null {
  if (!(width > 0) || !(height > 0)) return null
  const centerX = width / 2
  const centerY = height / 2
  const spanX = width * 0.35
  const spanY = height * 0.35
  if (!(spanX > 3) || !(spanY > 3)) return null
  return {
    xLeft: Math.round(centerX - spanX / 2),
    xRight: Math.round(centerX + spanX / 2),
    xGuideY: Math.round(centerY),
    yTop: Math.round(centerY - spanY / 2),
    yBottom: Math.round(centerY + spanY / 2),
    yGuideX: Math.round(centerX),
  }
}

/** Start-H/V-linialen in FML-cm, ~70% van de muur-bbox. */
export function initFmlRescaleStateFromWalls(
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b'>>,
): HScaleState | null {
  if (walls.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const wall of walls) {
    minX = Math.min(minX, wall.a.x, wall.b.x)
    minY = Math.min(minY, wall.a.y, wall.b.y)
    maxX = Math.max(maxX, wall.a.x, wall.b.x)
    maxY = Math.max(maxY, wall.a.y, wall.b.y)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const insetX = spanX * 0.15
  const insetY = spanY * 0.15
  return {
    xLeft: minX + insetX,
    xRight: maxX - insetX,
    xGuideY: (minY + maxY) / 2,
    yTop: minY + insetY,
    yBottom: maxY - insetY,
    yGuideX: (minX + maxX) / 2,
  }
}

/** Scale image-cm nulpunt (pixel blijft op FML 0,0). */
export function scaleNulpuntImageCm(
  point: { x: number; y: number },
  factor: number | PlanScaleFactors,
): { x: number; y: number } {
  const fx = typeof factor === 'number' ? factor : factor.x
  const fy = typeof factor === 'number' ? factor : factor.y
  return { x: point.x * fx, y: point.y * fy }
}
