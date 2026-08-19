import type { Point2D } from '@/core/fml/types'

const EPS = 1e-6

/** Cursorrichting vanaf start → eindpunt op vaste lengte (cm). Geen richting → +X. */
export function endFromDirection(start: Point2D, hover: Point2D, lengthCm: number): Point2D {
  const dx = hover.x - start.x
  const dy = hover.y - start.y
  const len = Math.hypot(dx, dy)
  if (len < EPS) {
    return { x: start.x + lengthCm, y: start.y }
  }
  const scale = lengthCm / len
  return { x: start.x + dx * scale, y: start.y + dy * scale }
}

/**
 * Kamer-eindhoek: H/V in cm met teken uit hover-kwadrant.
 * Geen hover-delta → +X / +Y.
 */
export function roomEndFromHv(start: Point2D, hover: Point2D, hCm: number, vCm: number): Point2D {
  const dx = hover.x - start.x
  const dy = hover.y - start.y
  const sx = Math.abs(dx) < EPS ? 1 : Math.sign(dx)
  const sy = Math.abs(dy) < EPS ? 1 : Math.sign(dy)
  return {
    x: start.x + sx * Math.abs(hCm),
    y: start.y + sy * Math.abs(vCm),
  }
}

/**
 * Parse maat → cm. Default zonder suffix = meters (inmeten).
 * Accepteert `2`, `2m`, `200cm`, `2000mm` (komma of punt).
 */
export function parseDrawLengthToCm(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase().replace(',', '.')
  if (!trimmed) return null
  const match = /^(-?\d+(?:\.\d+)?)\s*(m|cm|mm)?$/.exec(trimmed)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value) || value < 0) return null
  const unit = match[2] ?? 'm'
  if (unit === 'mm') return value / 10
  if (unit === 'cm') return value
  return value * 100
}

/** cm → weergave in meters (2 decimalen, trailing zeros weg waar netjes). */
export function formatDrawLengthMeters(cm: number): string {
  if (!Number.isFinite(cm)) return '0'
  const meters = cm / 100
  const rounded = Math.round(meters * 100) / 100
  return String(rounded)
}
