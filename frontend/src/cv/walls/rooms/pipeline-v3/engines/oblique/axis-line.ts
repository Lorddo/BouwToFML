/** Oneindige lijn als anker + eenheidsrichting — de drager van een schuine as. */
import type { Segment } from '@/cv/port/wallGraph'

export type Point2 = { x: number; y: number }

export type AxisLine = {
  anchor: Point2
  /** Eenheidsvector, gecanoniseerd naar hoek in [0,180). */
  direction: Point2
}

/** Hoek modulo 180 graden. */
export function normalizeAngle180(deg: number): number {
  return ((deg % 180) + 180) % 180
}

/** Kleinste verschil tussen twee richtingen modulo 180. */
export function angleDiff180(a: number, b: number): number {
  const d = Math.abs(normalizeAngle180(a) - normalizeAngle180(b)) % 180
  return d > 90 ? 180 - d : d
}

/** Afwijking t.o.v. de dichtstbijzijnde as (0 of 90). */
export function offAxisDeg(deg: number): number {
  const a = normalizeAngle180(deg)
  return Math.min(a, Math.abs(a - 90), 180 - a)
}

/** Richting met hoek in [0,180), zodat dezelfde lijn altijd dezelfde vector geeft. */
export function canonicalDirection(dx: number, dy: number): Point2 | null {
  const len = Math.hypot(dx, dy)
  if (len <= 1e-9) return null
  let x = dx / len
  let y = dy / len
  if (y < 0 || (y === 0 && x < 0)) {
    x = -x
    y = -y
  }
  return { x, y }
}

export function lineAngleDeg(line: AxisLine): number {
  return normalizeAngle180((Math.atan2(line.direction.y, line.direction.x) * 180) / Math.PI)
}

/** Positie langs de lijn, gemeten vanaf het anker. */
export function projectT(line: AxisLine, p: Point2): number {
  return (p.x - line.anchor.x) * line.direction.x + (p.y - line.anchor.y) * line.direction.y
}

/** Loodrechte, getekende afstand tot de lijn. */
export function signedOffset(line: AxisLine, p: Point2): number {
  return -(p.x - line.anchor.x) * line.direction.y + (p.y - line.anchor.y) * line.direction.x
}

export function pointAtT(line: AxisLine, t: number): Point2 {
  return {
    x: line.anchor.x + line.direction.x * t,
    y: line.anchor.y + line.direction.y * t,
  }
}

/** Punt op de lijn dat het dichtst bij `p` ligt. */
export function projectOnto(line: AxisLine, p: Point2): Point2 {
  return pointAtT(line, projectT(line, p))
}

/** Snijpunt met de drager van `seg`; `null` bij (bijna) parallel. */
export function intersectWithSegmentLine(line: AxisLine, seg: Segment): Point2 | null {
  const sx = seg.b.x - seg.a.x
  const sy = seg.b.y - seg.a.y
  const den = line.direction.x * sy - line.direction.y * sx
  if (Math.abs(den) < 1e-9) return null
  const t = ((seg.a.x - line.anchor.x) * sy - (seg.a.y - line.anchor.y) * sx) / den
  return pointAtT(line, t)
}

/**
 * Gewogen total-least-squares fit: minimaliseert loodrechte afstand, dus geen
 * voorkeur voor x of y. Nodig omdat een bijna-verticale gevel in een gewone
 * kleinste-kwadratenfit op y ontspoort.
 */
export function fitAxisLine(points: Array<{ p: Point2; weight: number }>): AxisLine | null {
  let sumW = 0
  let cx = 0
  let cy = 0
  for (const { p, weight } of points) {
    const w = Math.max(weight, 1e-9)
    sumW += w
    cx += p.x * w
    cy += p.y * w
  }
  if (sumW <= 0 || points.length < 2) return null
  cx /= sumW
  cy /= sumW

  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const { p, weight } of points) {
    const w = Math.max(weight, 1e-9)
    const dx = p.x - cx
    const dy = p.y - cy
    sxx += w * dx * dx
    syy += w * dy * dy
    sxy += w * dx * dy
  }
  if (sxx <= 0 && syy <= 0) return null
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const direction = canonicalDirection(Math.cos(theta), Math.sin(theta))
  if (!direction) return null
  return { anchor: { x: cx, y: cy }, direction }
}
