/**
 * L6 connector-detect — primary pass + chain-tip pass (public API).
 */
import type { Segment } from '@/cv/port/wallGraph'
import { infiniteLineIntersection } from '@/cv/walls/rooms/wall-segment-geometry'
import { incidentAt } from '../segment-ops'
import {
  collectChamferChainSegmentIndices,
  hasBlockingCompanionDiagonalAtEndpoint,
  isSegmentInMultiStubChamferChain,
  resolveLandingChamferGeometry,
} from './chamfer-chain'
import {
  LAYER6_FALLBACK_AXIS_MAX_SHIFT_RATIO,
  LAYER6_MIN_SEGMENT_LEN_PX,
  LAYER6_NEAR_GROUP_AXIS_CHAIN_RATIO,
  resolveLayer6Scale,
} from './constants'
import { tryHvChamferBridgeCandidate } from './connector-detect-bridge'
import { appendChamferChainTipCandidates } from './connector-detect-chain-pass'
import {
  endpointDistanceToSegmentEndpoints,
  pickDominantIncident,
  resolveSyntheticVFromChamferChain,
  type IncidentRef,
} from './connector-detect-helpers'
import type { Layer6ConnectorCandidate } from './connector-detect-types'
import { classifyLayer6Segments } from './segment-classify'

export type { Layer6ConnectorCandidate } from './connector-detect-types'

export function detectLayer6ConnectorCandidates(params: {
  segments: Segment[]
  referenceWallThicknessPx?: number
}): Layer6ConnectorCandidate[] {
  const scale = resolveLayer6Scale(params.referenceWallThicknessPx)
  const endpointSnapPx = scale.endpointSnapPx
  const nearbyWeldPx = scale.nearbyWeldPx
  const maxConnectorPx = scale.connectorMaxPx
  const maxChainPx = scale.axisChainPx
  const fallbackAxisMaxPx = Math.max(
    scale.armStrictPx,
    Math.round(scale.maxAttachmentShiftPx * LAYER6_FALLBACK_AXIS_MAX_SHIFT_RATIO),
    Math.round(maxChainPx * LAYER6_NEAR_GROUP_AXIS_CHAIN_RATIO),
  )
  const classified = classifyLayer6Segments(params.segments, scale.hvBandPx)
  const out: Layer6ConnectorCandidate[] = []

  for (const entry of classified) {
    if (entry.kind !== 'D') continue
    if (entry.lengthPx > maxConnectorPx || entry.lengthPx < LAYER6_MIN_SEGMENT_LEN_PX) continue

    const connector = params.segments[entry.index]
    if (
      hasBlockingCompanionDiagonalAtEndpoint({
        segments: params.segments,
        point: connector.a,
        connectorIndex: entry.index,
        maxChainPx,
        hvBandPx: scale.hvBandPx,
        endpointSnapPx,
      }) ||
      hasBlockingCompanionDiagonalAtEndpoint({
        segments: params.segments,
        point: connector.b,
        connectorIndex: entry.index,
        maxChainPx,
        hvBandPx: scale.hvBandPx,
        endpointSnapPx,
      })
    ) {
      continue
    }

    // ESC:W-33 (A)
    const landingGeom = resolveLandingChamferGeometry({
      segments: params.segments,
      diagonal: connector,
      referenceWallThicknessPx: scale.refPx,
      hvBandPx: scale.hvBandPx,
    })
    if (landingGeom) {
      out.push({
        connectorIndex: entry.index,
        hSegmentIndex: landingGeom.longHSegIndex,
        vSegmentIndex: landingGeom.vSegIndex,
        lengthPx: entry.lengthPx,
      })
      continue
    }

    const incidentsA = incidentAt(params.segments, connector.a, endpointSnapPx).filter(
      (incident) => incident.segIndex !== entry.index,
    )
    const incidentsB = incidentAt(params.segments, connector.b, endpointSnapPx).filter(
      (incident) => incident.segIndex !== entry.index,
    )
    const incidents = [...incidentsA, ...incidentsB]
    if (incidents.length === 0) continue

    const hvBridge = tryHvChamferBridgeCandidate({
      segments: params.segments,
      connector,
      connectorIndex: entry.index,
      classified,
      incidentsA,
      incidentsB,
      lengthPx: entry.lengthPx,
      hvBandPx: scale.hvBandPx,
      endpointSnapPx,
      nearbyWeldPx,
    })
    if (hvBridge) {
      out.push(hvBridge)
      continue
    }

    const hCandidates: IncidentRef[] = []
    const vCandidates: IncidentRef[] = []
    for (const incident of incidentsA) {
      const kind = classified[incident.segIndex]?.kind
      if (kind === 'H') {
        hCandidates.push({
          segIndex: incident.segIndex,
          lengthPx: incident.lengthPx,
          anchorPoint: connector.a,
        })
      } else if (kind === 'V') {
        vCandidates.push({
          segIndex: incident.segIndex,
          lengthPx: incident.lengthPx,
          anchorPoint: connector.a,
        })
      }
    }
    for (const incident of incidentsB) {
      const kind = classified[incident.segIndex]?.kind
      if (kind === 'H') {
        hCandidates.push({
          segIndex: incident.segIndex,
          lengthPx: incident.lengthPx,
          anchorPoint: connector.b,
        })
      } else if (kind === 'V') {
        vCandidates.push({
          segIndex: incident.segIndex,
          lengthPx: incident.lengthPx,
          anchorPoint: connector.b,
        })
      }
    }
    let h = pickDominantIncident(
      params.segments,
      hCandidates,
      scale.hvBandPx,
      endpointSnapPx,
      nearbyWeldPx,
    )
    let v = pickDominantIncident(
      params.segments,
      vCandidates,
      scale.hvBandPx,
      endpointSnapPx,
      nearbyWeldPx,
    )
    const hadLocalH = !!h
    const hadLocalV = !!v
    let syntheticV: Segment | undefined

    if (h && !v && hadLocalH) {
      const stubIndices = collectChamferChainSegmentIndices({
        segments: params.segments,
        tPoint: h.anchorPoint,
        maxChainPx,
        maxStubSegmentPx: maxConnectorPx,
        hvBandPx: scale.hvBandPx,
        endpointSnapPx,
      })
      if (stubIndices.length >= 2) {
        const synthetic = resolveSyntheticVFromChamferChain({
          segments: params.segments,
          connector,
          connectorIndex: entry.index,
          hAnchor: h.anchorPoint,
          maxChainPx,
          hvBandPx: scale.hvBandPx,
          shortHStubPx: scale.shortHStubPx,
          endpointSnapPx,
        })
        if (synthetic) {
          const hSeg = params.segments[h.segIndex]
          if (infiniteLineIntersection(hSeg, synthetic)) {
            syntheticV = synthetic
          }
        }
      }
    }

    if ((!h || !v) && !syntheticV) {
      if (
        isSegmentInMultiStubChamferChain({
          segments: params.segments,
          segIndex: entry.index,
          connector,
          maxChainPx,
          maxStubSegmentPx: maxConnectorPx,
          hvBandPx: scale.hvBandPx,
        })
      ) {
        continue
      }
      const fallbackMaxPx = maxConnectorPx * LAYER6_FALLBACK_AXIS_MAX_SHIFT_RATIO
      const fallbackH: IncidentRef[] = []
      const fallbackV: IncidentRef[] = []
      for (let i = 0; i < params.segments.length; i += 1) {
        if (i === entry.index) continue
        const kind = classified[i]?.kind
        if (kind !== 'H' && kind !== 'V') continue
        const seg = params.segments[i]
        const near = Math.min(
          endpointDistanceToSegmentEndpoints(connector.a, seg),
          endpointDistanceToSegmentEndpoints(connector.b, seg),
        )
        if (near > fallbackMaxPx) continue
        const anchor =
          endpointDistanceToSegmentEndpoints(connector.a, seg) <=
          endpointDistanceToSegmentEndpoints(connector.b, seg)
            ? connector.a
            : connector.b
        const candidateRef = {
          segIndex: i,
          lengthPx: classified[i].lengthPx,
          anchorPoint: anchor,
        }
        if (kind === 'H') fallbackH.push(candidateRef)
        if (kind === 'V') fallbackV.push(candidateRef)
      }
      if (!h)
        h = pickDominantIncident(
          params.segments,
          fallbackH,
          scale.hvBandPx,
          endpointSnapPx,
          nearbyWeldPx,
        )
      if (!v)
        v = pickDominantIncident(
          params.segments,
          fallbackV,
          scale.hvBandPx,
          endpointSnapPx,
          nearbyWeldPx,
        )
    }

    // Vermijd reparaties op volledig "remote" fallback-paren; die trekken ketens scheef.
    if (!hadLocalH && !hadLocalV && !syntheticV) continue
    if (!h) continue

    if (syntheticV) {
      out.push({
        connectorIndex: entry.index,
        hSegmentIndex: h.segIndex,
        vSegmentIndex: h.segIndex,
        lengthPx: entry.lengthPx,
        syntheticVSegment: syntheticV,
      })
      continue
    }

    if (!v) continue

    // Fallback-as moet lokaal genoeg zijn; anders trek je een verre tak naar een fout knooppunt.
    if (!hadLocalH) {
      const hSeg = params.segments[h.segIndex]
      const nearH = Math.min(
        endpointDistanceToSegmentEndpoints(connector.a, hSeg),
        endpointDistanceToSegmentEndpoints(connector.b, hSeg),
      )
      if (nearH > fallbackAxisMaxPx) continue
    }
    if (!hadLocalV) {
      const vSeg = params.segments[v.segIndex]
      const nearV = Math.min(
        endpointDistanceToSegmentEndpoints(connector.a, vSeg),
        endpointDistanceToSegmentEndpoints(connector.b, vSeg),
      )
      if (nearV > fallbackAxisMaxPx) continue
    }

    out.push({
      connectorIndex: entry.index,
      hSegmentIndex: h.segIndex,
      vSegmentIndex: v.segIndex,
      lengthPx: entry.lengthPx,
    })
  }

  appendChamferChainTipCandidates({
    segments: params.segments,
    classified,
    out,
    maxConnectorPx,
    maxChainPx,
    hvBandPx: scale.hvBandPx,
    endpointSnapPx,
    nearbyWeldPx,
    shortHStubPx: scale.shortHStubPx,
  })

  return out
}
