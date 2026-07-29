/**
 * L6 connector-detect — second pass: chamfer-chain → T tip candidates.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { infiniteLineIntersection } from '@/cv/walls/rooms/wall-segment-geometry'
import { incidentAt } from '../segment-ops'
import {
  collectChamferChainSegmentIndices,
  hasBlockingCompanionDiagonalAtEndpoint,
  resolveChamferBranchTipFromT,
} from './chamfer-chain'
import {
  LAYER6_BRIDGE_MAX_SHIFT_RATIO,
  LAYER6_MIN_SEGMENT_LEN_PX,
} from './constants'
import type { Layer6ConnectorCandidate } from './connector-detect-types'
import {
  pickDominantIncident,
  resolveSyntheticVFromChamferChain,
} from './connector-detect-helpers'
import { classifyLayer6Segments } from './segment-classify'

export function appendChamferChainTipCandidates(params: {
  segments: Segment[]
  classified: ReturnType<typeof classifyLayer6Segments>
  out: Layer6ConnectorCandidate[]
  maxConnectorPx: number
  maxChainPx: number
  hvBandPx: number
  endpointSnapPx: number
  nearbyWeldPx: number
  shortHStubPx: number
}): void {
  const {
    segments,
    classified,
    out,
    maxConnectorPx,
    maxChainPx,
    hvBandPx,
    endpointSnapPx,
    nearbyWeldPx,
    shortHStubPx,
  } = params

  // Chamfer-ketting → T: ontbrekende V via branch-tip (bv. 1058→1044→1043).
  for (const entry of classified) {
    if (entry.kind !== 'D') continue
    if (entry.lengthPx > maxConnectorPx || entry.lengthPx < LAYER6_MIN_SEGMENT_LEN_PX) continue
    if (out.some((candidate) => candidate.connectorIndex === entry.index)) continue

    const connector = segments[entry.index]!
    if (
      hasBlockingCompanionDiagonalAtEndpoint({
        segments,
        point: connector.a,
        connectorIndex: entry.index,
        maxChainPx,
        hvBandPx,
        endpointSnapPx,
      }) ||
      hasBlockingCompanionDiagonalAtEndpoint({
        segments,
        point: connector.b,
        connectorIndex: entry.index,
        maxChainPx,
        hvBandPx,
        endpointSnapPx,
      })
    ) {
      continue
    }

    const incidentsA = incidentAt(segments, connector.a, endpointSnapPx).filter(
      (incident) => incident.segIndex !== entry.index,
    )
    const incidentsB = incidentAt(segments, connector.b, endpointSnapPx).filter(
      (incident) => incident.segIndex !== entry.index,
    )

    const hCandidatesA = incidentsA.filter(
      (inc) => classified[inc.segIndex]?.kind === 'H',
    )
    const hCandidatesB = incidentsB.filter(
      (inc) => classified[inc.segIndex]?.kind === 'H',
    )

    let hAnchor: { x: number; y: number } | null = null
    if (hCandidatesA.length > 0 && incidentsB.every(
      (inc) => classified[inc.segIndex]?.kind === 'D',
    )) {
      hAnchor = connector.a
    } else if (hCandidatesB.length > 0 && incidentsA.every(
      (inc) => classified[inc.segIndex]?.kind === 'D',
    )) {
      hAnchor = connector.b
    }
    if (!hAnchor) continue

    const stubIndices = collectChamferChainSegmentIndices({
      segments,
      tPoint: hAnchor,
      maxChainPx,
      maxStubSegmentPx: maxConnectorPx,
      hvBandPx,
      endpointSnapPx,
    })
    if (stubIndices.length < 2) continue

    const tip = resolveChamferBranchTipFromT({
      segments,
      tPoint: hAnchor,
      maxChainPx,
      hvBandPx,
      endpointSnapPx,
    })
    if (!tip) continue

    const hPick = pickDominantIncident(
      segments,
      (hAnchor === connector.a ? hCandidatesA : hCandidatesB).map((inc) => ({
        segIndex: inc.segIndex,
        lengthPx: inc.lengthPx,
        anchorPoint: hAnchor!,
      })),
      hvBandPx,
      endpointSnapPx,
      nearbyWeldPx,
    )
    if (!hPick) continue

    const synthetic = resolveSyntheticVFromChamferChain({
      segments,
      connector,
      connectorIndex: entry.index,
      hAnchor,
      maxChainPx,
      hvBandPx,
      shortHStubPx,
      endpointSnapPx,
    })
    if (!synthetic) continue

    const hSeg = segments[hPick.segIndex]!
    const hit = infiniteLineIntersection(hSeg, synthetic)
    if (!hit) continue
    if (Math.hypot(hit.x - hAnchor.x, hit.y - hAnchor.y) > maxConnectorPx * LAYER6_BRIDGE_MAX_SHIFT_RATIO) continue

    out.push({
      connectorIndex: entry.index,
      hSegmentIndex: hPick.segIndex,
      vSegmentIndex: hPick.segIndex,
      lengthPx: entry.lengthPx,
      syntheticVSegment: synthetic,
    })
  }
}
