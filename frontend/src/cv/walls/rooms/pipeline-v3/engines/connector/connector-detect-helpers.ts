/**
 * L6 connector-detect — shared pick / synthetic-V helpers.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { buildSyntheticBranchSegmentAtT, resolveChamferBranchTipFromT } from './chamfer-chain'
import { pickDominantChainIncident } from './collinear-chain'

export type IncidentRef = {
  segIndex: number
  lengthPx: number
  anchorPoint: { x: number; y: number }
}

export function pickDominantIncident(
  segments: Segment[],
  incidents: IncidentRef[],
  hvBandPx: number,
  endpointSnapPx?: number,
  nearbyWeldPx?: number,
): IncidentRef | null {
  const picked = pickDominantChainIncident({
    segments,
    incidents,
    hvBandPx,
    endpointSnapPx,
    nearbyWeldPx,
  })
  if (!picked) return null
  return incidents.find((incident) => incident.segIndex === picked.segIndex) ?? null
}

export function resolveSyntheticVFromChamferChain(params: {
  segments: Segment[]
  connector: Segment
  connectorIndex: number
  hAnchor: { x: number; y: number }
  maxChainPx: number
  hvBandPx: number
  shortHStubPx: number
  endpointSnapPx: number
}): Segment | null {
  const tip = resolveChamferBranchTipFromT({
    segments: params.segments,
    tPoint: params.hAnchor,
    maxChainPx: params.maxChainPx,
    hvBandPx: params.hvBandPx,
    endpointSnapPx: params.endpointSnapPx,
  })
  if (!tip) return null
  if (Math.hypot(tip.x - params.hAnchor.x, tip.y - params.hAnchor.y) < params.shortHStubPx)
    return null
  return buildSyntheticBranchSegmentAtT({
    tPoint: params.hAnchor,
    tipPoint: tip,
  })
}

export function endpointDistanceToSegmentEndpoints(
  point: { x: number; y: number },
  seg: Segment,
): number {
  const da = Math.hypot(point.x - seg.a.x, point.y - seg.a.y)
  const db = Math.hypot(point.x - seg.b.x, point.y - seg.b.y)
  return Math.min(da, db)
}
