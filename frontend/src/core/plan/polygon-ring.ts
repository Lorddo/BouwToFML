/**
 * Gedeelde shoelace + polygon-clipping ring-helpers.
 * Signed = winding; abs = oppervlakte in cm².
 */
import polygonClipping from 'polygon-clipping'
import type { Point2D } from './types'

/** Shoelace / 2 — CCW positief, CW negatief. */
export function ringAreaSigned(ring: readonly Point2D[]): number {
  let sum = 0
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (!a || !b) continue
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/** Oppervlakte in cm² (altijd ≥ 0). */
export function ringAreaAbs(ring: readonly Point2D[]): number {
  return Math.abs(ringAreaSigned(ring))
}

/** Ring voor polygon-clipping: sluit open rings. */
export function toClipRing(poly: readonly Point2D[]): Array<[number, number]> {
  const ring: Array<[number, number]> = poly.map((p) => [p.x, p.y])
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]])
  }
  return ring
}

/** polygon-clipping.intersection — default/named unwrap. */
export function resolvePolygonIntersection(): typeof polygonClipping.intersection {
  const mod = polygonClipping as unknown as {
    intersection?: typeof polygonClipping.intersection
    default?: { intersection?: typeof polygonClipping.intersection }
  }
  const fn = mod.intersection ?? mod.default?.intersection
  if (!fn) throw new Error('polygon-clipping.intersection is not available')
  return fn
}
