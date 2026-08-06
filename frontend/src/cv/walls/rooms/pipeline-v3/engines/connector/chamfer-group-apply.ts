/**
 * L6 chamfer-group apply — weld arms + remove diagonals (public API).
 */
import { tally } from '@/core/diagnostics'
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { dropZeroLengthSegments, incidentAt, replaceSegmentEndpoint } from '../segment-ops'
import type { ChamferGroupGeometry } from './chamfer-group-geometry'
import { applyLandingChamferGroup } from './chamfer-group-apply-landing'
import { applyLtChamferGroup } from './chamfer-group-apply-lt'
import {
  LAYER6_COLLAPSE_SHIFT_RATIO,
  LAYER6_FALLBACK_AXIS_MAX_SHIFT_RATIO,
  resolveHvBandPx,
  resolveLayer6Scale,
} from './constants'
import { classifyLayer6Segment } from './segment-classify'

/** Weld armen + verwijder diagonaalgroep. Caller valideert connectivity. */
export function applyChamferGroupRepair(params: {
  segments: Segment[]
  geometry: ChamferGroupGeometry
  referenceWallThicknessPx?: number
}): { segments: Segment[]; removedDiagonalCount: number } {
  const scale = resolveLayer6Scale(params.referenceWallThicknessPx)
  const hvBandPx = resolveHvBandPx(scale.hvBandPx)
  const endpointSnapPx = scale.endpointSnapPx
  const nearbyWeldPx = scale.nearbyWeldPx
  const classify = (segment: Segment, segIndex: number) =>
    classifyLayer6Segment(segment, segIndex, hvBandPx)
  const work = params.segments
  const maxConnectorPx = scale.connectorMaxPx
  const maxArmShift = Math.max(
    scale.maxAttachmentShiftPx * LAYER6_COLLAPSE_SHIFT_RATIO,
    maxConnectorPx,
  )

  const diagSet = new Set(params.geometry.diagonalIndices)
  const removeSet = new Set(params.geometry.diagonalIndices)
  const diagEndpoints: Array<{ x: number; y: number }> = []
  for (const diagIndex of params.geometry.diagonalIndices) {
    const diag = work[diagIndex]
    if (!diag) continue
    diagEndpoints.push({ ...diag.a }, { ...diag.b })
  }

  const snapAnyEndpointNearDiagToHit = (segIndex: number, hit: { x: number; y: number }) => {
    const seg = work[segIndex]
    if (!seg) return
    const thicknessMargin = scale.thicknessMarginPx
    for (const end of [seg.a, seg.b]) {
      const onDiag = diagEndpoints.some((p) => Math.hypot(p.x - end.x, p.y - end.y) <= nearbyWeldPx)
      if (!onDiag) continue
      const shift = Math.hypot(end.x - hit.x, end.y - hit.y)
      // ESC:W-37 (B)
      // Nooit een arm plat trekken naar een verre hit (zero-length segment + gat).
      if (shift > Math.min(maxArmShift, thicknessMargin)) {
        tally('W-37', 'skip_far_hit')
        continue
      }
      const other = end === seg.a ? seg.b : seg.a
      if (Math.hypot(other.x - hit.x, other.y - hit.y) <= nearbyWeldPx) {
        // Andere kant zit al op hit → snap zou segment nul maken.
        tally('W-37', 'skip_would_zero')
        continue
      }
      tally('W-37', 'snapped')
      replaceSegmentEndpoint(work, segIndex, end, hit, endpointSnapPx)
      return
    }
  }

  if (params.geometry.kind === 'landing' && params.geometry.landingJunctionPoint != null) {
    applyLandingChamferGroup({
      work,
      geometry: params.geometry,
      scale,
      hvBandPx,
      endpointSnapPx,
      maxConnectorPx,
      maxArmShift,
      diagSet,
      removeSet,
    })
  } else {
    applyLtChamferGroup({
      work,
      geometry: params.geometry,
      scale,
      hvBandPx,
      endpointSnapPx,
      nearbyWeldPx,
      maxConnectorPx,
      maxArmShift,
      diagSet,
      removeSet,
      diagEndpoints,
    })
  }

  // Extra snap alleen voor korte armen nabij diag (niet lange muren trekken).
  if (params.geometry.kind !== 'landing') {
    for (let i = 0; i < work.length; i += 1) {
      if (diagSet.has(i) || removeSet.has(i)) continue
      const kind = classify(work[i], i).kind
      if (kind !== 'H' && kind !== 'V') continue
      if (segmentLength(work[i]) > maxConnectorPx * LAYER6_FALLBACK_AXIS_MAX_SHIFT_RATIO) continue
      snapAnyEndpointNearDiagToHit(i, params.geometry.hit)
    }
  }

  for (const diagIndex of params.geometry.diagonalIndices) {
    const diag = work[diagIndex]
    if (!diag) continue
    for (const point of [diag.a, diag.b]) {
      for (const inc of incidentAt(work, point, endpointSnapPx)) {
        if (removeSet.has(inc.segIndex)) continue
        if (params.geometry.hSegIndices.includes(inc.segIndex)) continue
        if (params.geometry.vSegIndices.includes(inc.segIndex)) continue
        const kind = classify(inc.segment, inc.segIndex).kind
        if (kind !== 'H' && kind !== 'V') continue
        if (inc.lengthPx > Math.min(maxConnectorPx, scale.stubCapPx)) continue
        const hvCount = incidentAt(work, point, endpointSnapPx).filter((other) => {
          if (removeSet.has(other.segIndex) || other.segIndex === inc.segIndex) return false
          const k = classify(other.segment, other.segIndex).kind
          return k === 'H' || k === 'V'
        }).length
        if (hvCount >= 1) continue
        removeSet.add(inc.segIndex)
      }
    }
  }

  const filtered = work.filter((_, index) => !removeSet.has(index))
  const noZero = dropZeroLengthSegments(filtered)
  return {
    segments: noZero.segments,
    removedDiagonalCount: params.geometry.diagonalIndices.length,
  }
}
