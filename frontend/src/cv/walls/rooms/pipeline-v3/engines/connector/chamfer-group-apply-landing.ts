/**
 * L6 chamfer-group apply — landing kind weld/collapse.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { incidentAt } from '../segment-ops'
import type { ChamferGroupGeometry } from './chamfer-group-geometry'
import { snapArmToHit } from './chamfer-group-apply-snap'
import { LAYER6_BRIDGE_MAX_SHIFT_RATIO, LAYER6_COLLAPSE_SHIFT_RATIO } from './constants'
import type { Layer6Scale } from './constants'
import { classifyLayer6Segment } from './segment-classify'

export function applyLandingChamferGroup(params: {
  work: Segment[]
  geometry: ChamferGroupGeometry
  scale: Layer6Scale
  hvBandPx: number
  endpointSnapPx: number
  maxConnectorPx: number
  maxArmShift: number
  diagSet: Set<number>
  removeSet: Set<number>
}): void {
  const {
    work,
    geometry,
    scale,
    hvBandPx,
    endpointSnapPx,
    maxConnectorPx,
    maxArmShift,
    diagSet,
    removeSet,
  } = params
  const classify = (segment: Segment, segIndex: number) =>
    classifyLayer6Segment(segment, segIndex, hvBandPx)

  const junction = geometry.landingJunctionPoint!
  const vAtLanding = geometry.vAtLanding === true
  const hit = geometry.hit
  const thicknessMargin = scale.thicknessMarginPx
  // Shift-budget = max(oude arm-shift, muurdikte): H/V mag "een tikje scheef".
  const collapseShift = Math.max(maxArmShift, thicknessMargin, maxConnectorPx)

  if (vAtLanding) {
    /**
     * Collapse naar één H×V-hit binnen muurdikte-marge.
     * Geen micro-jog (V-stub + parallelle H + brug) — dat is onoplosbaar voor L7+.
     * Lichte scheefheid op lange H is OK; latere lagen orthogonaliseren.
     */
    const hToSnap = new Set<number>(geometry.hSegIndices)
    const vToSnap = new Set<number>(geometry.vSegIndices)
    const stubRemove = new Set<number>()

    for (const inc of incidentAt(work, junction, endpointSnapPx)) {
      if (diagSet.has(inc.segIndex) || removeSet.has(inc.segIndex)) continue
      const kind = classify(inc.segment, inc.segIndex).kind
      if (kind === 'H') {
        hToSnap.add(inc.segIndex)
        if (inc.lengthPx <= thicknessMargin) {
          // Korte H-stub: lange arm aan de andere kant ook meenemen.
          const seg = work[inc.segIndex]!
          const other =
            Math.hypot(seg.a.x - junction.x, seg.a.y - junction.y) <= endpointSnapPx ? seg.b : seg.a
          for (const far of incidentAt(work, other, endpointSnapPx)) {
            if (far.segIndex === inc.segIndex) continue
            if (classify(far.segment, far.segIndex).kind === 'H') {
              hToSnap.add(far.segIndex)
            }
          }
        }
      }
      if (kind === 'V' && inc.lengthPx <= thicknessMargin) {
        // Korte V-jog-stub: volg naar andere kant (linker H op andere y), stub weg.
        stubRemove.add(inc.segIndex)
        const seg = work[inc.segIndex]!
        const other =
          Math.hypot(seg.a.x - junction.x, seg.a.y - junction.y) <= endpointSnapPx ? seg.b : seg.a
        for (const far of incidentAt(work, other, endpointSnapPx)) {
          if (diagSet.has(far.segIndex) || far.segIndex === inc.segIndex) continue
          const farKind = classify(far.segment, far.segIndex).kind
          if (farKind === 'H') hToSnap.add(far.segIndex)
          if (farKind === 'V' && far.lengthPx > thicknessMargin) vToSnap.add(far.segIndex)
        }
      } else if (kind === 'V') {
        vToSnap.add(inc.segIndex)
      }
    }

    for (const vIdx of vToSnap) {
      if (stubRemove.has(vIdx)) continue
      const seg = work[vIdx]
      if (!seg) continue
      const touch =
        Math.hypot(seg.a.x - geometry.vTouchPoint.x, seg.a.y - geometry.vTouchPoint.y) <=
        Math.hypot(seg.b.x - geometry.vTouchPoint.x, seg.b.y - geometry.vTouchPoint.y)
          ? seg.a
          : seg.b
      snapArmToHit({
        segments: work,
        segIndex: vIdx,
        touchPoint: touch,
        hit,
        maxArmShift: collapseShift,
        longSegmentShiftGuardPx: scale.armLoosePx,
        allowLongSegment: true,
      })
    }

    for (const hIdx of hToSnap) {
      if (stubRemove.has(hIdx)) continue
      const seg = work[hIdx]
      if (!seg) continue
      // Eindpunt dichter bij junction OF bij oude diag-zone → naar hit (mag scheef).
      const nearJ =
        Math.hypot(seg.a.x - junction.x, seg.a.y - junction.y) <=
        Math.hypot(seg.b.x - junction.x, seg.b.y - junction.y)
          ? seg.a
          : seg.b
      const nearHit =
        Math.hypot(seg.a.x - hit.x, seg.a.y - hit.y) <= Math.hypot(seg.b.x - hit.x, seg.b.y - hit.y)
          ? seg.a
          : seg.b
      const touch =
        Math.hypot(nearJ.x - hit.x, nearJ.y - hit.y) <=
        Math.hypot(nearHit.x - hit.x, nearHit.y - hit.y) + 1
          ? nearJ
          : nearHit
      // Alleen snappen als binnen muurdikte-budget t.o.v. hit (Δy of totale shift).
      const shift = Math.hypot(touch.x - hit.x, touch.y - hit.y)
      if (shift > collapseShift * LAYER6_COLLAPSE_SHIFT_RATIO) continue
      snapArmToHit({
        segments: work,
        segIndex: hIdx,
        touchPoint: touch,
        hit,
        maxArmShift: collapseShift * LAYER6_COLLAPSE_SHIFT_RATIO,
        longSegmentShiftGuardPx: scale.armLoosePx,
        allowLongSegment: true,
      })
    }

    for (const stubIdx of stubRemove) removeSet.add(stubIdx)
    // H die collinear volledig onder een langere H valt (zelfde y-band) → weg,
    // ook als snap de stub langer maakte dan thicknessMargin (oost-T: 80 vs 90).
    for (const hIdx of [...hToSnap]) {
      if (removeSet.has(hIdx)) continue
      const seg = work[hIdx]
      if (!seg) continue
      const len = segmentLength(seg)
      const sMinX = Math.min(seg.a.x, seg.b.x)
      const sMaxX = Math.max(seg.a.x, seg.b.x)
      const sMidY = (seg.a.y + seg.b.y) / 2
      const coveredByLonger = [...hToSnap].some((otherIdx) => {
        if (otherIdx === hIdx || removeSet.has(otherIdx)) return false
        const other = work[otherIdx]
        if (!other || segmentLength(other) <= len + 1) return false
        const dy = Math.abs((other.a.y + other.b.y) / 2 - sMidY)
        if (dy > scale.jogEpsilonPx) return false
        const oMinX = Math.min(other.a.x, other.b.x)
        const oMaxX = Math.max(other.a.x, other.b.x)
        return oMinX <= sMinX + scale.jogEpsilonPx && oMaxX >= sMaxX - scale.jogEpsilonPx
      })
      if (coveredByLonger) removeSet.add(hIdx)
    }
  } else {
    // Klassiek: lange H op landing → hit; brug junction→hit; V blijft op junction.
    const longH = geometry.longHSegIndex ?? geometry.hSegIndices[0]
    if (longH != null) {
      snapArmToHit({
        segments: work,
        segIndex: longH,
        touchPoint: geometry.hTouchPoint,
        hit,
        maxArmShift: collapseShift,
        longSegmentShiftGuardPx: scale.armLoosePx,
        allowLongSegment: true,
      })
    }
    const junctionDist = Math.hypot(hit.x - junction.x, hit.y - junction.y)
    if (
      junctionDist > scale.shortHStubPx &&
      junctionDist <= collapseShift * LAYER6_BRIDGE_MAX_SHIFT_RATIO
    ) {
      const alreadyLinked = work.some((seg, idx) => {
        if (diagSet.has(idx) || removeSet.has(idx)) return false
        const aNearJ = Math.hypot(seg.a.x - junction.x, seg.a.y - junction.y) <= endpointSnapPx
        const bNearH = Math.hypot(seg.b.x - hit.x, seg.b.y - hit.y) <= endpointSnapPx
        const bNearJ = Math.hypot(seg.b.x - junction.x, seg.b.y - junction.y) <= endpointSnapPx
        const aNearH = Math.hypot(seg.a.x - hit.x, seg.a.y - hit.y) <= endpointSnapPx
        return (aNearJ && bNearH) || (bNearJ && aNearH)
      })
      if (!alreadyLinked) {
        // Alleen brug als Δ buiten "tikje scheef"-collapse van bestaande H/V.
        const hAtJ = incidentAt(work, junction, endpointSnapPx).filter(
          (inc) =>
            !diagSet.has(inc.segIndex) &&
            !removeSet.has(inc.segIndex) &&
            classify(inc.segment, inc.segIndex).kind === 'H' &&
            inc.lengthPx > scale.armStrictPx,
        )
        if (hAtJ.length > 0) {
          for (const inc of hAtJ) {
            snapArmToHit({
              segments: work,
              segIndex: inc.segIndex,
              touchPoint: junction,
              hit,
              maxArmShift: collapseShift,
              longSegmentShiftGuardPx: scale.armLoosePx,
              allowLongSegment: true,
            })
          }
        } else {
          work.push({
            a: { ...junction },
            b: { ...hit },
          })
        }
      }
    }
  }
}
