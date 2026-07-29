/**
 * L6 chamfer-group geometry — shared types + nearest endpoint.
 */
import type { Segment } from '@/cv/port/wallGraph'

export type ChamferGroupKind = 'L' | 'T' | 'landing'

export interface ChamferGroupGeometry {
  kind: ChamferGroupKind
  hit: { x: number; y: number }
  diagonalIndices: number[]
  hSegIndices: number[]
  vSegIndices: number[]
  hTouchPoint: { x: number; y: number }
  vTouchPoint: { x: number; y: number }
  /** Through-T: junction blijft; lange H naar landing-hit. */
  landingJunctionPoint?: { x: number; y: number }
  longHSegIndex?: number
  /** Inverted landing: V op landing → snap V i.p.v. H. */
  vAtLanding?: boolean
}

export function nearestEndpoint(
  seg: Segment,
  point: { x: number; y: number },
): { x: number; y: number } {
  const da = Math.hypot(seg.a.x - point.x, seg.a.y - point.y)
  const db = Math.hypot(seg.b.x - point.x, seg.b.y - point.y)
  return da <= db ? { x: seg.a.x, y: seg.a.y } : { x: seg.b.x, y: seg.b.y }
}
