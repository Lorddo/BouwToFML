/**
 * V3 assen-inventaris — leest werkelijk schuine assen op laag 3.
 *
 * Laag 3 is het laatste punt waar de gevelketen ongesnapt is: op
 * `schuine-gevel-bg` liggen alle 16 gevelstukken daar 0–1,5 px van de hartlijn,
 * terwijl laag 4 ze naar H/V trekt en er een trap van maakt. Hier wordt dus
 * alleen gelezen; de reparatie gebeurt aan het eind van laag 10.
 */
import { tally } from '@/core/diagnostics'
import type { Segment } from '@/cv/port/wallGraph'
import { segmentAngleDeg, segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import type { ObliquePolicy } from '../policy-types'
import {
  angleDiff180,
  fitAxisLine,
  lineAngleDeg,
  normalizeAngle180,
  offAxisDeg,
  pointAtT,
  projectT,
  signedOffset,
  type AxisLine,
} from './axis-line'
import { probeSegmentRidge, type RidgeField, type RidgeProbe } from './ridge-probe'

export type ObliqueAxis = {
  line: AxisLine
  angleDeg: number
  /** Span langs de lijn waarover bewijs is gevonden. */
  tMin: number
  tMax: number
  /** Som van de lidmaatlengtes. */
  evidencePx: number
  memberCount: number
  ridge: RidgeProbe
}

type Candidate = {
  index: number
  segment: Segment
  lengthPx: number
  angleDeg: number
  midpoint: { x: number; y: number }
}

function toCandidates(segments: Segment[], policy: ObliquePolicy): Candidate[] {
  const out: Candidate[] = []
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    const lengthPx = segmentLength(segment)
    if (lengthPx < policy.minMemberLengthPx) continue
    out.push({
      index,
      segment,
      lengthPx,
      angleDeg: normalizeAngle180(segmentAngleDeg(segment)),
      midpoint: {
        x: (segment.a.x + segment.b.x) / 2,
        y: (segment.a.y + segment.b.y) / 2,
      },
    })
  }
  return out.sort((a, b) => b.lengthPx - a.lengthPx)
}

/** Single-link clustering op loodrechte afstand tot de zaadrichting. */
function groupByOffset(
  members: Candidate[],
  seedLine: AxisLine,
  maxOffsetPx: number,
): Candidate[][] {
  const sorted = members
    .map((member) => ({ member, offset: signedOffset(seedLine, member.midpoint) }))
    .sort((a, b) => a.offset - b.offset)

  const groups: Candidate[][] = []
  let current: Candidate[] = []
  let previousOffset = Number.NaN
  for (const entry of sorted) {
    if (current.length > 0 && Math.abs(entry.offset - previousOffset) > maxOffsetPx) {
      groups.push(current)
      current = []
    }
    current.push(entry.member)
    previousOffset = entry.offset
  }
  if (current.length > 0) groups.push(current)
  return groups
}

// ESC:W-54 (B) — schuine-as hypothese: elke afkeur is een telsite, want een
// gemiste as betekent dat de trap uit laag 4 blijft staan.
function fitGroup(
  group: Candidate[],
  policy: ObliquePolicy,
  field: RidgeField,
): ObliqueAxis | null {
  const evidencePx = group.reduce((sum, member) => sum + member.lengthPx, 0)
  if (group.length < policy.minMemberCount) {
    tally('W-54', 'too_few_members')
    return null
  }
  if (evidencePx < policy.minEvidencePx) {
    tally('W-54', 'too_little_evidence')
    return null
  }

  const line = fitAxisLine(
    group.flatMap((member) => [
      { p: member.segment.a, weight: member.lengthPx },
      { p: member.segment.b, weight: member.lengthPx },
    ]),
  )
  if (!line) {
    tally('W-54', 'fit_failed')
    return null
  }

  const angleDeg = lineAngleDeg(line)
  if (offAxisDeg(angleDeg) <= policy.deadzoneDeg) {
    tally('W-54', 'fit_inside_deadzone')
    return null
  }

  const ts = group.flatMap((member) => [
    projectT(line, member.segment.a),
    projectT(line, member.segment.b),
  ])
  const tMin = Math.min(...ts)
  const tMax = Math.max(...ts)

  const ridge = probeSegmentRidge({ a: pointAtT(line, tMin), b: pointAtT(line, tMax) }, field)
  if (!ridge) {
    tally('W-54', 'ridge_probe_failed')
    return null
  }
  if (
    ridge.offsetMedianPx > policy.maxRidgeOffsetMedianPx ||
    ridge.offsetP90Px > policy.maxRidgeOffsetP90Px ||
    ridge.inInkRatio < policy.minInInkRatio
  ) {
    tally('W-54', 'ridge_rejected')
    return null
  }

  tally('W-54', 'axis_accepted')
  return {
    line,
    angleDeg,
    tMin,
    tMax,
    evidencePx,
    memberCount: group.length,
    ridge,
  }
}

/**
 * Assen die noch horizontaal noch verticaal zijn en die op de hartlijn van een
 * muur liggen. Lege uitvoer is de normale uitkomst voor orthogonale tekeningen.
 */
export function collectObliqueAxes(params: {
  segments: Segment[]
  policy: ObliquePolicy
  field: RidgeField
}): ObliqueAxis[] {
  const candidates = toCandidates(params.segments, params.policy)
  const consumed = new Set<number>()
  const axes: ObliqueAxis[] = []

  for (const seed of candidates) {
    if (consumed.has(seed.index)) continue
    if (offAxisDeg(seed.angleDeg) <= params.policy.deadzoneDeg) continue
    consumed.add(seed.index)

    const cluster = candidates.filter(
      (candidate) =>
        (candidate.index === seed.index || !consumed.has(candidate.index)) &&
        angleDiff180(candidate.angleDeg, seed.angleDeg) <= params.policy.angleToleranceDeg,
    )
    if (cluster.length < params.policy.minMemberCount) continue

    const seedRad = (seed.angleDeg * Math.PI) / 180
    const seedLine: AxisLine = {
      anchor: seed.midpoint,
      direction: { x: Math.cos(seedRad), y: Math.sin(seedRad) },
    }
    for (const group of groupByOffset(cluster, seedLine, params.policy.maxMemberOffsetPx)) {
      const axis = fitGroup(group, params.policy, params.field)
      if (!axis) continue
      axes.push(axis)
      for (const member of group) consumed.add(member.index)
    }
  }

  return axes.sort((a, b) => b.evidencePx - a.evidencePx)
}
