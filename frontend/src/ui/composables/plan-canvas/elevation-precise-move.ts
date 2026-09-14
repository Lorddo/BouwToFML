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

export function elevationPreciseCommitMinCm(typed: boolean): number {
  return typed ? ELEV_PRECISE_TYPED_MIN_CM : ELEV_PRECISE_CLICK_MIN_CM
}
