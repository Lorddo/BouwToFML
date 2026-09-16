/**
 * Overlap-policy voor dakvlakken: sibling planes mogen niet overlappen;
 * dakkapel mag alleen overlappen met zijn ouder.
 */
import {
  resolvePolygonIntersection,
  ringAreaAbs,
  toClipRing,
} from './polygon-ring'
import { ROOF_TOUCH_SLACK_CM, isRoofSurface, roofKindOf } from './roof-planes'
import type { FloorSurface, Point2D } from './types'

export type RoofOverlapViolation =
  | { code: 'plane_plane'; aId: string; bId: string }
  | { code: 'dormer_dormer'; aId: string; bId: string }
  | { code: 'dormer_wrong_parent'; aId: string; bId: string }
  | { code: 'dormer_no_parent'; aId: string }

/** Overlap-oppervlakte in cm² (0 als geen snede). */
export function roofPolyOverlapAreaCm2(a: readonly Point2D[], b: readonly Point2D[]): number {
  if (a.length < 3 || b.length < 3) return 0
  try {
    const intersection = resolvePolygonIntersection()
    const result = intersection([toClipRing(a)], [toClipRing(b)])
    let area = 0
    for (const polygon of result) {
      const outer = polygon[0]
      if (!outer || outer.length < 3) continue
      area += ringAreaAbs(outer.map(([x, y]) => ({ x, y })))
      for (let i = 1; i < polygon.length; i += 1) {
        const hole = polygon[i]
        if (!hole || hole.length < 3) continue
        area -= ringAreaAbs(hole.map(([x, y]) => ({ x, y })))
      }
    }
    return Math.max(0, area)
  } catch {
    return 0
  }
}

/** Slack: overlap tot ~band langs de rand telt niet (zelfde orde als ROOF_TOUCH_SLACK). */
const OVERLAP_AREA_SLACK_CM2 = ROOF_TOUCH_SLACK_CM * ROOF_TOUCH_SLACK_CM

export function roofsOverlapBeyondSlack(
  a: readonly Point2D[],
  b: readonly Point2D[],
  slackCm2 = OVERLAP_AREA_SLACK_CM2,
): boolean {
  return roofPolyOverlapAreaCm2(a, b) > slackCm2
}

/**
 * Valideer `candidate` tegen bestaande dakvlakken op dezelfde floor.
 * `candidate` mag al in `existing` zitten (bij edit); dan wordt die overgeslagen.
 */
export function validateRoofOverlap(
  candidate: FloorSurface,
  existing: ReadonlyArray<FloorSurface>,
): RoofOverlapViolation | null {
  if (!isRoofSurface(candidate) || candidate.poly.length < 3) return null
  const candKind = roofKindOf(candidate)
  const candParent = candidate.roofParentId?.trim() || null

  for (const other of existing) {
    if (!isRoofSurface(other) || other.id === candidate.id || other.poly.length < 3) continue
    if (!roofsOverlapBeyondSlack(candidate.poly, other.poly)) continue
    const otherKind = roofKindOf(other)

    if (candKind === 'plane' && otherKind === 'plane') {
      return { code: 'plane_plane', aId: candidate.id, bId: other.id }
    }
    if (candKind === 'dormer' && otherKind === 'dormer') {
      return { code: 'dormer_dormer', aId: candidate.id, bId: other.id }
    }
    if (candKind === 'dormer' && otherKind === 'plane') {
      if (candParent && candParent !== other.id) {
        return { code: 'dormer_wrong_parent', aId: candidate.id, bId: other.id }
      }
      continue
    }
    if (candKind === 'plane' && otherKind === 'dormer') {
      const otherParent = other.roofParentId?.trim()
      if (otherParent && otherParent !== candidate.id) {
        return { code: 'dormer_wrong_parent', aId: other.id, bId: candidate.id }
      }
      continue
    }
  }
  return null
}

export function roofOverlapMessage(violation: RoofOverlapViolation): string {
  switch (violation.code) {
    case 'plane_plane':
      return 'Dakvlakken mogen elkaar niet overlappen (gebruik Dakkapel voor een kindvlak).'
    case 'dormer_dormer':
      return 'Twee dakkapellen mogen elkaar niet overlappen.'
    case 'dormer_wrong_parent':
      return 'Een dakkapel mag alleen overlappen met het gekozen oudervlak.'
    case 'dormer_no_parent':
      return 'Een dakkapel zonder oudervlak is toegestaan tot het hoofddak er is.'
    default:
      return 'Dakvlak-overlap is niet toegestaan.'
  }
}
