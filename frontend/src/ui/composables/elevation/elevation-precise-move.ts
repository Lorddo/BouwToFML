import type { Point2D } from '@/core/plan/types'

/** Klik-jitter: negeer per ongeluk bijna-nul. Alleen getypt mag tot 1 mm. */
export const ELEV_PRECISE_CLICK_MIN_CM = 0.5
export const ELEV_PRECISE_TYPED_MIN_CM = 0.1

/**
 * Offset vanaf start → hover. Getypte maat volgt de hover-richting.
 * Axis-lock houdt alleen de dominante as.
 */
export function elevationPreciseOffset(
  start: Point2D,
  hover: Point2D,
  overrideCm: number | null,
  axisLock = false,
): Point2D {
  let dx = hover.x - start.x
  let dy = hover.y - start.y
  if (axisLock) {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0
    else dx = 0
  }
  const len = Math.hypot(dx, dy)
  if (overrideCm != null && overrideCm !== 0) {
    const ux = len > 1e-9 ? dx / len : 1
    const uy = len > 1e-9 ? dy / len : 0
    const sign = overrideCm < 0 ? -1 : 1
    const dist = Math.abs(overrideCm) * sign
    return { x: ux * dist, y: uy * dist }
  }
  return { x: dx, y: dy }
}

/** Hoogte-delta: muis omhoog (kleinere Y) = positief. Getypte maat volgt die richting. */
export function elevationPreciseHeightDelta(
  startY: number,
  hoverY: number,
  overrideCm: number | null,
): number {
  const raw = startY - hoverY
  if (overrideCm != null && overrideCm !== 0) {
    const sign = overrideCm < 0 ? -1 : raw !== 0 ? Math.sign(raw) : 1
    return Math.abs(overrideCm) * sign
  }
  return raw
}

/**
 * Resultaat-hoogte voor knoop/nok: positieve typ = absolute hoogte (vanaf vloer),
 * niet Δ. Negatieve typ / geen typ = oude delta-semantiek.
 */
export function elevationPreciseResultHeightCm(
  startHeightCm: number,
  startY: number,
  hoverY: number,
  overrideCm: number | null,
): number {
  if (overrideCm != null && overrideCm > 0) return overrideCm
  return startHeightCm + elevationPreciseHeightDelta(startY, hoverY, overrideCm)
}

/**
 * Nok-precise: altijd H/V. Positieve typ = absolute vloer→onderkant (alleen Y).
 * Zonder typ / negatief = as-locked offset (zoals muur).
 */
export function elevationPreciseRidgeOffset(
  start: Point2D,
  hover: Point2D,
  overrideCm: number | null,
  startBottomZCm: number,
): Point2D {
  if (overrideCm != null && overrideCm > 0) {
    return { x: 0, y: -(overrideCm - startBottomZCm) }
  }
  return elevationPreciseOffset(start, hover, overrideCm, true)
}

/** Onderkant-Z van een aanzicht-rect t.o.v. de verdiepingsvloer. */
export function elevationRectBottomZCm(rect: { y0: number; y1: number }, floorBaseWorldZ: number): number {
  const yBot = Math.max(rect.y0, rect.y1)
  return Math.max(0, Math.round(-yBot - floorBaseWorldZ))
}

export type ElevationOpeningRestLengths = {
  leftCm: number
  rightCm: number
  floorCm: number
  ceilingCm: number
}

export type ElevationOpeningRestSide = 'left' | 'right' | 'floor' | 'ceiling'

const EPS = 1e-6

/** Actieve restmaat uit hover-richting (zelfde as-keuze als opening-offset). */
export function elevationPreciseOpeningRestSide(
  start: Point2D,
  hover: Point2D,
  axisLock = false,
): ElevationOpeningRestSide | null {
  let dx = hover.x - start.x
  let dy = hover.y - start.y
  if (axisLock) {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0
    else dx = 0
  }
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return null
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'floor' : 'ceiling'
}

export function elevationOpeningRestLineId(side: ElevationOpeningRestSide): string {
  return `elev-opening-${side}`
}

export function elevationOpeningRestLengthCm(
  lengths: ElevationOpeningRestLengths,
  side: ElevationOpeningRestSide,
): number {
  if (side === 'left') return lengths.leftCm
  if (side === 'right') return lengths.rightCm
  if (side === 'floor') return lengths.floorCm
  return lengths.ceilingCm
}

/**
 * Opening-precise: positieve typ = restmaat (L/R of vloer/plafond) volgens hover.
 * Negatief / geen lengths → oude delta-offset.
 */
export function elevationPreciseOpeningOffset(
  start: Point2D,
  hover: Point2D,
  overrideCm: number | null,
  lengths: ElevationOpeningRestLengths | null,
  axisLock = false,
): Point2D {
  if (overrideCm == null || overrideCm <= 0 || !lengths) {
    return elevationPreciseOffset(start, hover, overrideCm, axisLock)
  }
  const side = elevationPreciseOpeningRestSide(start, hover, axisLock)
  if (!side) return elevationPreciseOffset(start, hover, overrideCm, axisLock)
  const typedI = overrideCm
  if (side === 'right') return { x: lengths.rightCm - typedI, y: 0 }
  if (side === 'left') return { x: typedI - lengths.leftCm, y: 0 }
  if (side === 'floor') return { x: 0, y: lengths.floorCm - typedI }
  return { x: 0, y: typedI - lengths.ceilingCm }
}

export function elevationPreciseCommitMinCm(typed: boolean): number {
  return typed ? ELEV_PRECISE_TYPED_MIN_CM : ELEV_PRECISE_CLICK_MIN_CM
}
