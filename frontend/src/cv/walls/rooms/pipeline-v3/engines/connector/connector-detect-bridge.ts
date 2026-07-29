/**
 * L6 connector-detect — H×V chamfer-bridge candidate.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { infiniteLineIntersection } from '@/cv/walls/rooms/wall-segment-geometry'
import { incidentAt } from '../segment-ops'
import { buildSyntheticBranchSegmentAtT } from './chamfer-chain'
import type { Layer6ConnectorCandidate } from './connector-detect-types'
import { pickDominantIncident } from './connector-detect-helpers'
import { classifyLayer6Segments } from './segment-classify'

export function tryHvChamferBridgeCandidate(params: {
  segments: Segment[]
  connector: Segment
  connectorIndex: number
  classified: ReturnType<typeof classifyLayer6Segments>
  incidentsA: ReturnType<typeof incidentAt>
  incidentsB: ReturnType<typeof incidentAt>
  lengthPx: number
  hvBandPx: number
  endpointSnapPx: number
  nearbyWeldPx: number
}): Layer6ConnectorCandidate | null {
  const hFromA = params.incidentsA.filter((inc) => params.classified[inc.segIndex]?.kind === 'H')
  const vFromA = params.incidentsA.filter((inc) => params.classified[inc.segIndex]?.kind === 'V')
  const hFromB = params.incidentsB.filter((inc) => params.classified[inc.segIndex]?.kind === 'H')
  const vFromB = params.incidentsB.filter((inc) => params.classified[inc.segIndex]?.kind === 'V')

  let hAnchor: { x: number; y: number } | null = null
  let vAnchor: { x: number; y: number } | null = null
  let hIncidents: typeof params.incidentsA = []
  let vIncidents: typeof params.incidentsA = []

  if (hFromB.length > 0 && vFromA.length > 0) {
    hAnchor = params.connector.b
    vAnchor = params.connector.a
    hIncidents = hFromB
    vIncidents = vFromA
  } else if (hFromA.length > 0 && vFromB.length > 0) {
    hAnchor = params.connector.a
    vAnchor = params.connector.b
    hIncidents = hFromA
    vIncidents = vFromB
  } else {
    return null
  }

  const hPick = pickDominantIncident(
    params.segments,
    hIncidents.map((inc) => ({
      segIndex: inc.segIndex,
      lengthPx: inc.lengthPx,
      anchorPoint: hAnchor!,
    })),
    params.hvBandPx,
    params.endpointSnapPx,
    params.nearbyWeldPx,
  )
  const vPick = pickDominantIncident(
    params.segments,
    vIncidents.map((inc) => ({
      segIndex: inc.segIndex,
      lengthPx: inc.lengthPx,
      anchorPoint: vAnchor!,
    })),
    params.hvBandPx,
    params.endpointSnapPx,
    params.nearbyWeldPx,
  )
  if (!hPick || !vPick) return null

  const hAtT = incidentAt(params.segments, hAnchor!, params.endpointSnapPx).filter(
    (inc) => params.classified[inc.segIndex]?.kind === 'H',
  )
  if (hAtT.length < 2) return null

  const hSeg = params.segments[hPick.segIndex]!
  const vSeg = params.segments[vPick.segIndex]!
  const directHit = infiniteLineIntersection(hSeg, vSeg)
  if (directHit) {
    const hJunctionDist = Math.hypot(directHit.x - hAnchor!.x, directHit.y - hAnchor!.y)
    if (hJunctionDist <= params.nearbyWeldPx) return null
  }

  const synthetic = buildSyntheticBranchSegmentAtT({
    tPoint: hAnchor!,
    tipPoint: vAnchor!,
  })
  if (!infiniteLineIntersection(hSeg, synthetic)) return null

  return {
    connectorIndex: params.connectorIndex,
    hSegmentIndex: hPick.segIndex,
    vSegmentIndex: vPick.segIndex,
    lengthPx: params.lengthPx,
    syntheticVSegment: synthetic,
    branchTipPoint: { ...vAnchor! },
  }
}
