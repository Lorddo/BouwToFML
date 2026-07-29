/**
 * L6 chamfer-chain — landing geometry (classic / inverted / T-jog).
 */
import type { Segment } from '@/cv/port/wallGraph'
import { infiniteLineIntersection, segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { incidentAt } from '../segment-ops'
import { classifyLayer6Segment, classifyLayer6Segments } from './segment-classify'
import {
  LAYER6_BRIDGE_MAX_SHIFT_RATIO,
  LAYER6_DIAGONAL_MAX_RATIO,
  resolveLayer6Scale,
} from './constants'

/**
 * Offset T-branch (≥2 H op T, geen through-V): chamfer → orthogonale jog.
 * Through-junctions (V/H doorlopend) → false → normale H×V-weld.
 */
function isOffsetBranchTJunction(params: {
  segments: Segment[]
  tPoint: { x: number; y: number }
  branchTipPoint?: { x: number; y: number }
  referenceWallThicknessPx?: number
  hvBandPx?: number
}): boolean {
  const scale = resolveLayer6Scale(params.referenceWallThicknessPx)
  const hvBandPx = params.hvBandPx ?? scale.hvBandPx
  const endpointSnapPx = scale.endpointSnapPx
  const nearbyWeldPx = scale.nearbyWeldPx
  const classified = classifyLayer6Segments(params.segments, hvBandPx)
  const hAtT = incidentAt(params.segments, params.tPoint, endpointSnapPx).filter(
    (inc) => classified[inc.segIndex]?.kind === 'H',
  )
  if (hAtT.length < 2) return false

  const vAtT = incidentAt(params.segments, params.tPoint, endpointSnapPx).filter(
    (inc) => classified[inc.segIndex]?.kind === 'V' && inc.lengthPx >= scale.minVArmPx,
  )
  for (const vInc of vAtT) {
    const seg = params.segments[vInc.segIndex]!
    const da = Math.hypot(seg.a.x - params.tPoint.x, seg.a.y - params.tPoint.y)
    const db = Math.hypot(seg.b.x - params.tPoint.x, seg.b.y - params.tPoint.y)
    const other = da <= db ? seg.b : seg.a
    if (Math.abs(other.x - params.tPoint.x) <= endpointSnapPx) return false
    if (Math.abs(other.y - params.tPoint.y) <= endpointSnapPx) return false
  }

  if (params.branchTipPoint) {
    const tipDist = Math.hypot(
      params.branchTipPoint.x - params.tPoint.x,
      params.branchTipPoint.y - params.tPoint.y,
    )
    if (tipDist <= nearbyWeldPx) return false
  }

  return true
}

/** Diagonaal die T verbindt met landingspunt op lange H of V (H-landing of V-landing). */
export function isLandingChamferAtJunction(params: {
  segments: Segment[]
  diagonal: Segment
  junctionPoint: { x: number; y: number }
  minArmPx?: number
  referenceWallThicknessPx?: number
  hvBandPx?: number
}): boolean {
  const scale = resolveLayer6Scale(params.referenceWallThicknessPx)
  const hvBandPx = params.hvBandPx ?? scale.hvBandPx
  const endpointSnapPx = scale.endpointSnapPx
  const da = Math.hypot(params.diagonal.a.x - params.junctionPoint.x, params.diagonal.a.y - params.junctionPoint.y)
  const db = Math.hypot(params.diagonal.b.x - params.junctionPoint.x, params.diagonal.b.y - params.junctionPoint.y)
  const landing = da <= db ? params.diagonal.b : params.diagonal.a
  if (
    Math.hypot(landing.x - params.junctionPoint.x, landing.y - params.junctionPoint.y)
    <= endpointSnapPx
  ) {
    return false
  }
  const minArm = params.minArmPx ?? scale.armStrictPx
  return incidentAt(params.segments, landing, endpointSnapPx).some((inc) => {
    const kind = classifyLayer6Segment(inc.segment, inc.segIndex, hvBandPx).kind
    return (kind === 'H' || kind === 'V') && inc.lengthPx >= minArm
  })
}

/**
 * Through-T landing:
 * - klassiek: lange H op landing, V (+optionele H-stub) op junction
 * - inverted: through-H (2×H) op junction, V op landing (west @653)
 */
export function resolveLandingChamferGeometry(params: {
  segments: Segment[]
  diagonal: Segment
  minArmPx?: number
  referenceWallThicknessPx?: number
  hvBandPx?: number
}): {
  junctionPoint: { x: number; y: number }
  landingPoint: { x: number; y: number }
  longHSegIndex: number
  vSegIndex: number
  hit: { x: number; y: number }
  /** true = V ligt op landing (snap V→hit); false = H op landing (snap H→hit). */
  vAtLanding?: boolean
} | null {
  const scale = resolveLayer6Scale(params.referenceWallThicknessPx)
  const hvBandPx = params.hvBandPx ?? scale.hvBandPx
  const endpointSnapPx = scale.endpointSnapPx
  const minArm = params.minArmPx ?? scale.armStrictPx
  const maxConnectorPx = scale.connectorMaxPx
  const maxBridgePx = scale.maxAttachmentShiftPx * LAYER6_BRIDGE_MAX_SHIFT_RATIO
  const diagLen = segmentLength(params.diagonal)
  for (const junctionPoint of [params.diagonal.a, params.diagonal.b]) {
    if (
      !isLandingChamferAtJunction({
        segments: params.segments,
        diagonal: params.diagonal,
        junctionPoint,
        minArmPx: minArm,
        referenceWallThicknessPx: scale.refPx,
        hvBandPx,
      })
    ) {
      continue
    }
    const da = Math.hypot(
      params.diagonal.a.x - junctionPoint.x,
      params.diagonal.a.y - junctionPoint.y,
    )
    const db = Math.hypot(
      params.diagonal.b.x - junctionPoint.x,
      params.diagonal.b.y - junctionPoint.y,
    )
    const landingPoint = da <= db ? params.diagonal.b : params.diagonal.a

    const hAtJunction = incidentAt(params.segments, junctionPoint, endpointSnapPx).filter(
      (inc) => classifyLayer6Segment(inc.segment, inc.segIndex, hvBandPx).kind === 'H',
    )
    const vAtJunction = incidentAt(params.segments, junctionPoint, endpointSnapPx).filter(
      (inc) => {
        const kind = classifyLayer6Segment(inc.segment, inc.segIndex, hvBandPx).kind
        // Korte V-stubs op T (bv. y-jog 2px @660) tellen mee voor landing.
        return kind === 'V' && inc.lengthPx >= Math.min(minArm, scale.jogEpsilonPx)
      },
    )
    const hAtLanding = incidentAt(params.segments, landingPoint, endpointSnapPx).filter(
      (inc) => {
        const kind = classifyLayer6Segment(inc.segment, inc.segIndex, hvBandPx).kind
        return kind === 'H' && inc.lengthPx >= minArm
      },
    )
    const vAtLandingList = incidentAt(params.segments, landingPoint, endpointSnapPx).filter(
      (inc) => {
        const kind = classifyLayer6Segment(inc.segment, inc.segIndex, hvBandPx).kind
        return kind === 'V' && inc.lengthPx >= minArm
      },
    )
    const hAtJunctionLoose = incidentAt(params.segments, junctionPoint, endpointSnapPx).filter(
      (inc) => {
        const kind = classifyLayer6Segment(inc.segment, inc.segIndex, hvBandPx).kind
        return kind === 'H' && inc.lengthPx >= scale.jogEpsilonPx
      },
    )

    // Inverted: through-H op junction + V op landing → brug junction→hit, V naar hit.
    // Alleen korte chamfer-diagonalen (geen lange schuine muren / jogs).
    if (
      hAtJunctionLoose.length >= 2
      && vAtJunction.length === 0
      && vAtLandingList.length >= 1
      && hAtLanding.length === 0
      && diagLen <= maxConnectorPx * LAYER6_DIAGONAL_MAX_RATIO
    ) {
      const dx = Math.abs(params.diagonal.a.x - params.diagonal.b.x)
      const dy = Math.abs(params.diagonal.a.y - params.diagonal.b.y)
      if (dx < scale.jogEpsilonPx || dy < scale.jogEpsilonPx) continue
      const longH = [...hAtJunctionLoose].sort((a, b) => b.lengthPx - a.lengthPx)[0]!
      const vPick = [...vAtLandingList].sort((a, b) => b.lengthPx - a.lengthPx)[0]!
      const hit = infiniteLineIntersection(
        params.segments[longH.segIndex]!,
        params.segments[vPick.segIndex]!,
      )
      if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y)) continue
      const bridge = Math.hypot(hit.x - junctionPoint.x, hit.y - junctionPoint.y)
      if (bridge > maxBridgePx) continue
      return {
        junctionPoint: { ...junctionPoint },
        landingPoint: { ...landingPoint },
        longHSegIndex: longH.segIndex,
        vSegIndex: vPick.segIndex,
        hit,
        vAtLanding: true,
      }
    }

    // T-jog: korte H+V stubs op junction + lange V op landing (export 49 @660, y-jog).
    // Geen lange V-stam op junction — dat is oost-T / classic through-T.
    if (
      hAtJunctionLoose.length >= 1
      && vAtJunction.length >= 1
      && vAtJunction.every((inc) => inc.lengthPx <= Math.min(maxConnectorPx, scale.stubCapPx))
      && vAtLandingList.length >= 1
      && hAtLanding.length === 0
      && diagLen <= maxConnectorPx * LAYER6_DIAGONAL_MAX_RATIO
    ) {
      const dx = Math.abs(params.diagonal.a.x - params.diagonal.b.x)
      const dy = Math.abs(params.diagonal.a.y - params.diagonal.b.y)
      if (dx < scale.jogEpsilonPx || dy < scale.jogEpsilonPx) continue
      const longH = [...hAtJunctionLoose].sort((a, b) => b.lengthPx - a.lengthPx)[0]!
      const vPick = [...vAtLandingList].sort((a, b) => b.lengthPx - a.lengthPx)[0]!
      const hit = infiniteLineIntersection(
        params.segments[longH.segIndex]!,
        params.segments[vPick.segIndex]!,
      )
      if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y)) continue
      const bridge = Math.hypot(hit.x - junctionPoint.x, hit.y - junctionPoint.y)
      if (bridge > maxBridgePx) continue
      return {
        junctionPoint: { ...junctionPoint },
        landingPoint: { ...landingPoint },
        longHSegIndex: longH.segIndex,
        vSegIndex: vPick.segIndex,
        hit,
        vAtLanding: true,
      }
    }

    if (
      isOffsetBranchTJunction({
        segments: params.segments,
        tPoint: junctionPoint,
        branchTipPoint: landingPoint,
        referenceWallThicknessPx: scale.refPx,
        hvBandPx,
      })
    ) {
      continue
    }

    // Echte L-hoek (één V-stam, géén H op junction): simple-L, niet landing.
    // Through-V (≥2 V) is wel classic through-T — diagonaal naar H-landing (BouwTek11 @1489).
    if (
      hAtLanding.length >= 1
      && vAtLandingList.length === 0
      && vAtJunction.length === 1
      && hAtJunction.length === 0
    ) {
      continue
    }
    // Klassiek through-T: ≥1 V (+hooguit één H-stub); landing = één lange H.
    if (hAtJunction.length >= 2 || vAtJunction.length === 0 || hAtLanding.length === 0 || hAtLanding.length >= 2) {
      continue
    }

    const longH = [...hAtLanding].sort((a, b) => b.lengthPx - a.lengthPx)[0]!
    const vPick = [...vAtJunction].sort((a, b) => b.lengthPx - a.lengthPx)[0]!

    const hit = infiniteLineIntersection(
      params.segments[longH.segIndex]!,
      params.segments[vPick.segIndex]!,
    )
    if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y)) continue

    return {
      junctionPoint: { ...junctionPoint },
      landingPoint: { ...landingPoint },
      longHSegIndex: longH.segIndex,
      vSegIndex: vPick.segIndex,
      hit,
      vAtLanding: false,
    }
  }
  return null
}
