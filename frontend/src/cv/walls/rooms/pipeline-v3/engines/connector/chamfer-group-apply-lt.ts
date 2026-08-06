/**
 * L6 chamfer-group apply — L/T kind weld/collapse.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { incidentAt, replaceSegmentEndpoint } from '../segment-ops'
import type { ChamferGroupGeometry } from './chamfer-group-geometry'
import { snapArmToHit } from './chamfer-group-apply-snap'
import type { Layer6Scale } from './constants'
import { classifyLayer6Segment } from './segment-classify'

export function applyLtChamferGroup(params: {
  work: Segment[]
  geometry: ChamferGroupGeometry
  scale: Layer6Scale
  hvBandPx: number
  endpointSnapPx: number
  nearbyWeldPx: number
  maxConnectorPx: number
  maxArmShift: number
  diagSet: Set<number>
  removeSet: Set<number>
  diagEndpoints: Array<{ x: number; y: number }>
}): void {
  const {
    work,
    geometry,
    scale,
    hvBandPx,
    endpointSnapPx,
    nearbyWeldPx,
    maxConnectorPx,
    maxArmShift,
    diagSet,
    removeSet,
    diagEndpoints,
  } = params
  const classify = (segment: Segment, segIndex: number) =>
    classifyLayer6Segment(segment, segIndex, hvBandPx)

  /**
   * L/T-groep → één H×V-hit binnen muurdikte-marge.
   * Korte stubs op de T-touch (H tussen V en diag) verwijderen — niet naar hit
   * draaien tot V-stub (korte H tussen V en diag → valse T blijven).
   * Lange H/V mogen meeschuiven (tikje scheef); L7+ orthogonaliseert.
   */
  const thicknessMargin = scale.thicknessMarginPx
  const collapseShift = Math.max(maxArmShift, thicknessMargin, maxConnectorPx)

  const snapAnyEndpointNearDiagToHit = (segIndex: number, hit: { x: number; y: number }) => {
    const seg = work[segIndex]
    if (!seg) return
    for (const end of [seg.a, seg.b]) {
      const onDiag = diagEndpoints.some((p) => Math.hypot(p.x - end.x, p.y - end.y) <= nearbyWeldPx)
      if (!onDiag) continue
      const shift = Math.hypot(end.x - hit.x, end.y - hit.y)
      // Nooit een arm plat trekken naar een verre hit (zero-length segment + gat).
      if (shift > Math.min(maxArmShift, thicknessMargin)) continue
      const other = end === seg.a ? seg.b : seg.a
      if (Math.hypot(other.x - hit.x, other.y - hit.y) <= nearbyWeldPx) {
        // Andere kant zit al op hit → snap zou segment nul maken.
        continue
      }
      replaceSegmentEndpoint(work, segIndex, end, hit, endpointSnapPx)
      return
    }
  }

  // Alleen stubs op V-touch: korte H tussen through-V en diag (niet de primaire H-as).
  for (const inc of incidentAt(work, geometry.vTouchPoint, endpointSnapPx)) {
    if (diagSet.has(inc.segIndex) || removeSet.has(inc.segIndex)) continue
    if (geometry.hSegIndices.includes(inc.segIndex)) continue
    if (geometry.vSegIndices.includes(inc.segIndex)) continue
    if (inc.lengthPx > thicknessMargin) continue
    if (classify(inc.segment, inc.segIndex).kind !== 'H') continue
    const touchesDiag = diagEndpoints.some(
      (p) =>
        Math.hypot(p.x - inc.segment.a.x, p.y - inc.segment.a.y) <= nearbyWeldPx ||
        Math.hypot(p.x - inc.segment.b.x, p.y - inc.segment.b.y) <= nearbyWeldPx,
    )
    if (touchesDiag) removeSet.add(inc.segIndex)
  }
  // Micro-V-jog op H-touch (diag → korte V → H) mag niet naar hit gedraaid worden tot H-stub.
  for (const inc of incidentAt(work, geometry.hTouchPoint, endpointSnapPx)) {
    if (diagSet.has(inc.segIndex) || removeSet.has(inc.segIndex)) continue
    if (geometry.vSegIndices.includes(inc.segIndex)) continue
    if (inc.lengthPx > thicknessMargin) continue
    if (classify(inc.segment, inc.segIndex).kind !== 'V') continue
    const touchesDiag = diagEndpoints.some(
      (p) =>
        Math.hypot(p.x - inc.segment.a.x, p.y - inc.segment.a.y) <= nearbyWeldPx ||
        Math.hypot(p.x - inc.segment.b.x, p.y - inc.segment.b.y) <= nearbyWeldPx,
    )
    if (touchesDiag) removeSet.add(inc.segIndex)
  }

  for (const segIndex of geometry.hSegIndices) {
    if (removeSet.has(segIndex)) continue
    snapArmToHit({
      segments: work,
      segIndex,
      touchPoint: geometry.hTouchPoint,
      hit: geometry.hit,
      maxArmShift: collapseShift,
      longSegmentShiftGuardPx: scale.armLoosePx,
      allowLongSegment: true,
    })
    snapAnyEndpointNearDiagToHit(segIndex, geometry.hit)
  }
  for (const segIndex of geometry.vSegIndices) {
    if (removeSet.has(segIndex)) continue
    snapArmToHit({
      segments: work,
      segIndex,
      touchPoint: geometry.vTouchPoint,
      hit: geometry.hit,
      maxArmShift: collapseShift,
      longSegmentShiftGuardPx: scale.armLoosePx,
      allowLongSegment: true,
    })
    snapAnyEndpointNearDiagToHit(segIndex, geometry.hit)
  }

  // Collinear H-overlap na snap (korte stub onder langere H op oost-T).
  const hForCover = new Set<number>(geometry.hSegIndices)
  for (let i = 0; i < work.length; i += 1) {
    if (diagSet.has(i) || removeSet.has(i)) continue
    if (classify(work[i], i).kind !== 'H') continue
    const aHit =
      Math.hypot(work[i].a.x - geometry.hit.x, work[i].a.y - geometry.hit.y) <= nearbyWeldPx
    const bHit =
      Math.hypot(work[i].b.x - geometry.hit.x, work[i].b.y - geometry.hit.y) <= nearbyWeldPx
    if (aHit || bHit) hForCover.add(i)
  }
  for (const hIdx of [...hForCover]) {
    if (removeSet.has(hIdx)) continue
    const seg = work[hIdx]
    if (!seg) continue
    const len = segmentLength(seg)
    const sMinX = Math.min(seg.a.x, seg.b.x)
    const sMaxX = Math.max(seg.a.x, seg.b.x)
    const sMidY = (seg.a.y + seg.b.y) / 2
    const covered = [...hForCover].some((otherIdx) => {
      if (otherIdx === hIdx || removeSet.has(otherIdx)) return false
      const other = work[otherIdx]
      if (!other || segmentLength(other) <= len + 1) return false
      if (Math.abs((other.a.y + other.b.y) / 2 - sMidY) > scale.jogEpsilonPx) return false
      const oMinX = Math.min(other.a.x, other.b.x)
      const oMaxX = Math.max(other.a.x, other.b.x)
      return oMinX <= sMinX + scale.jogEpsilonPx && oMaxX >= sMaxX - scale.jogEpsilonPx
    })
    if (covered) removeSet.add(hIdx)
  }
}
