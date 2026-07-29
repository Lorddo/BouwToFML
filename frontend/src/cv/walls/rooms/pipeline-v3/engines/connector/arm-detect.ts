import type { Segment } from '@/cv/port/wallGraph'
import { incidentAt, pointsNear } from '../segment-ops'
import { classifyLayer6Segment } from './segment-classify'
import {
  LAYER6_ENDPOINT_SNAP_PX,
  LAYER6_HV_DOMINANCE_RATIO,
  LAYER6_THROUGH_OFFSET_RATIO,
  LAYER6_HV_BAND_FALLBACK_PX,
} from './constants'
import { measureCollinearChainSpan } from './collinear-chain'

export interface Layer6ArmRef {
  segIndex: number
  segment: Segment
  lengthPx: number
  kind: 'H' | 'V'
  axis: number
}

export type Layer6JunctionArmMode = 'L' | 'T'

function otherEndpointAt(
  seg: Segment,
  point: { x: number; y: number },
  epsPx: number = LAYER6_ENDPOINT_SNAP_PX,
): { x: number; y: number } {
  if (pointsNear(seg.a, point, epsPx)) return { ...seg.b }
  if (pointsNear(seg.b, point, epsPx)) return { ...seg.a }
  return { ...seg.b }
}

function axisDistanceToPoint(
  point: { x: number; y: number },
  seg: Segment,
  kind: 'H' | 'V',
): number {
  if (kind === 'H') {
    return Math.abs(point.y - (seg.a.y + seg.b.y) / 2)
  }
  return Math.abs(point.x - (seg.a.x + seg.b.x) / 2)
}

function pointNearSegmentSpan(
  point: { x: number; y: number },
  seg: Segment,
  kind: 'H' | 'V',
  marginPx: number,
): boolean {
  if (kind === 'H') {
    const minX = Math.min(seg.a.x, seg.b.x) - marginPx
    const maxX = Math.max(seg.a.x, seg.b.x) + marginPx
    return point.x >= minX && point.x <= maxX
  }
  const minY = Math.min(seg.a.y, seg.b.y) - marginPx
  const maxY = Math.max(seg.a.y, seg.b.y) + marginPx
  return point.y >= minY && point.y <= maxY
}

function isHvArmNearJunction(
  point: { x: number; y: number },
  seg: Segment,
  kind: 'H' | 'V',
  armDetectPx: number,
): boolean {
  return (
    axisDistanceToPoint(point, seg, kind) <= armDetectPx &&
    pointNearSegmentSpan(point, seg, kind, armDetectPx)
  )
}

function weightedAxis(arms: Array<{ axis: number; lengthPx: number }>): number | null {
  if (arms.length === 0) return null
  let sum = 0
  let weight = 0
  for (const arm of arms) {
    sum += arm.axis * arm.lengthPx
    weight += arm.lengthPx
  }
  return weight > 0 ? sum / weight : null
}

/**
 * Chamfer-diagonaal op de branch-arm (geel), niet op through (rood).
 * Through-chamfer: diagonaal loopt vooral langs de through-as.
 * Branch-chamfer: diagonaal wijkt vooral af loodrecht op de through-as.
 */
function isChamferDiagonalOnBranchAtT(params: {
  point: { x: number; y: number }
  diagSeg: Segment
  throughKind: 'H' | 'V'
  throughAxis: number
}): boolean {
  const other = otherEndpointAt(params.diagSeg, params.point)
  const alongThrough =
    params.throughKind === 'H'
      ? Math.abs(other.x - params.point.x)
      : Math.abs(other.y - params.point.y)
  const offThrough =
    params.throughKind === 'H'
      ? Math.abs(other.y - params.throughAxis)
      : Math.abs(other.x - params.throughAxis)
  return offThrough > alongThrough * LAYER6_THROUGH_OFFSET_RATIO
}

/**
 * As-nabij chamfer-detectie bij T alleen als een diagonaal op de branch-arm zit,
 * niet wanneer de chamfer op de through-lijn ligt.
 */
function shouldEnableChamferAxisNearAtT(
  segments: Segment[],
  point: { x: number; y: number },
  hvBandPx: number,
  endpointSnapPx: number,
): boolean {
  const classify = (segment: Segment, segIndex: number) =>
    classifyLayer6Segment(segment, segIndex, hvBandPx)
  const endpointIncidents = incidentAt(segments, point, endpointSnapPx)
  const diags = endpointIncidents.filter((incident) => {
    const kind = classify(incident.segment, incident.segIndex).kind
    return kind === 'D'
  })
  if (diags.length === 0) return false

  const hs = endpointIncidents
    .map((incident) => ({
      incident,
      classified: classify(incident.segment, incident.segIndex),
    }))
    .filter((entry) => entry.classified.kind === 'H' && entry.classified.targetAxis != null)
  const vs = endpointIncidents
    .map((incident) => ({
      incident,
      classified: classify(incident.segment, incident.segIndex),
    }))
    .filter((entry) => entry.classified.kind === 'V' && entry.classified.targetAxis != null)

  let throughKind: 'H' | 'V' | null = null
  let throughAxis: number | null = null

  if (hs.length >= 2 && vs.length >= 1) {
    throughKind = 'H'
    throughAxis = weightedAxis(
      hs.map((entry) => ({
        axis: entry.classified.targetAxis as number,
        lengthPx: entry.classified.lengthPx,
      })),
    )
  } else if (vs.length >= 2 && hs.length >= 1) {
    throughKind = 'V'
    throughAxis = weightedAxis(
      vs.map((entry) => ({
        axis: entry.classified.targetAxis as number,
        lengthPx: entry.classified.lengthPx,
      })),
    )
  } else if (hs.length === 1 && vs.length === 1) {
    for (const diag of diags) {
      const other = otherEndpointAt(diag.segment, point)
      const dx = Math.abs(other.x - point.x)
      const dy = Math.abs(other.y - point.y)
      if (dx > dy * LAYER6_HV_DOMINANCE_RATIO) return false
      if (dy > dx * LAYER6_HV_DOMINANCE_RATIO) return true
    }
    return false
  } else {
    return false
  }

  if (throughKind == null || throughAxis == null) return false

  return diags.some((diag) =>
    isChamferDiagonalOnBranchAtT({
      point,
      diagSeg: diag.segment,
      throughKind,
      throughAxis,
    }),
  )
}

function shouldEnableChamferAxisNear(
  segments: Segment[],
  point: { x: number; y: number },
  hvBandPx: number,
  junctionKind: Layer6JunctionArmMode | undefined,
  endpointSnapPx: number,
): boolean {
  if (!junctionKind) return false
  if (junctionKind === 'L') {
    return incidentAt(segments, point, endpointSnapPx).some((incident) => {
      return classifyLayer6Segment(incident.segment, incident.segIndex, hvBandPx).kind === 'D'
    })
  }
  return shouldEnableChamferAxisNearAtT(segments, point, hvBandPx, endpointSnapPx)
}

/**
 * H/V-armen voor L/T-repair.
 * Eindpunt-incident: altijd strak (1.25px).
 * As-nabij: alleen bij chamfer — L altijd; T alleen branch-chamfer (niet through-chamfer).
 */
export function collectLayer6HvArmsAtPoint(params: {
  segments: Segment[]
  point: { x: number; y: number }
  armDetectPx: number
  hvBandPx?: number
  junctionKind?: Layer6JunctionArmMode
  endpointSnapPx?: number
}): Layer6ArmRef[] {
  const hvBandPx = params.hvBandPx ?? LAYER6_HV_BAND_FALLBACK_PX
  const endpointSnapPx = params.endpointSnapPx ?? LAYER6_ENDPOINT_SNAP_PX
  const classify = (segment: Segment, segIndex: number) =>
    classifyLayer6Segment(segment, segIndex, hvBandPx)
  const seen = new Set<number>()
  const out: Layer6ArmRef[] = []

  const push = (segIndex: number) => {
    if (seen.has(segIndex)) return
    const segment = params.segments[segIndex]
    if (!segment) return
    const classified = classify(segment, segIndex)
    if (classified.kind !== 'H' && classified.kind !== 'V') return
    if (classified.targetAxis == null) return
    seen.add(segIndex)
    out.push({
      segIndex,
      segment,
      lengthPx: measureCollinearChainSpan({
        segments: params.segments,
        startSegIndex: segIndex,
        anchorPoint: params.point,
        hvBandPx,
        endpointSnapPx,
      }),
      kind: classified.kind,
      axis: classified.targetAxis,
    })
  }

  for (const incident of incidentAt(params.segments, params.point, endpointSnapPx)) {
    push(incident.segIndex)
  }

  if (
    !shouldEnableChamferAxisNear(
      params.segments,
      params.point,
      hvBandPx,
      params.junctionKind,
      endpointSnapPx,
    )
  ) {
    return out
  }

  for (let i = 0; i < params.segments.length; i += 1) {
    if (seen.has(i)) continue
    const segment = params.segments[i]!
    const classified = classify(segment, i)
    if (classified.kind !== 'H' && classified.kind !== 'V') continue
    if (!isHvArmNearJunction(params.point, segment, classified.kind, params.armDetectPx)) continue
    push(i)
  }

  return out
}
