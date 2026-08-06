/**
 * L6 chamfer-group geometry — resolve-entry (landing / simple-L / multi / T-branch).
 */
import type { Segment } from '@/cv/port/wallGraph'
import { tally } from '@/core/diagnostics'
import { infiniteLineIntersection, segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { incidentAt } from '../segment-ops'
import { resolveLandingChamferGeometry, resolveSimpleLChamferGeometry } from './chamfer-chain'
import { measureCollinearChainSpan, pickDominantChainIncident } from './collinear-chain'
import {
  LAYER6_BRIDGE_MAX_SHIFT_RATIO,
  LAYER6_LONG_H_MIN_CONNECTOR_RATIO,
  LAYER6_NEAR_GROUP_AXIS_CHAIN_RATIO,
  LAYER6_SHALLOW_JOG_DEG,
  LAYER6_STEEP_JOG_DEG,
  resolveHvBandPx,
  resolveLayer6Scale,
} from './constants'
import { classifyLayer6Segment, classifyLayer6Segments } from './segment-classify'
import { collectDiagonalGroupIndices } from './chamfer-group-geometry-expand'
import { isAlternatingStairDiagonalChain } from './chamfer-group-geometry-stair'
import type { ChamferGroupGeometry, ChamferGroupKind } from './chamfer-group-geometry-types'

// ESC:W-35 (A)
function hvIncidentsNearGroup(params: {
  segments: Segment[]
  diagonalIndices: number[]
  maxNearPx: number
  hvBandPx: number
  endpointSnapPx: number
}): {
  h: Array<{ segIndex: number; lengthPx: number; anchorPoint: { x: number; y: number } }>
  v: Array<{ segIndex: number; lengthPx: number; anchorPoint: { x: number; y: number } }>
} {
  const diagSet = new Set(params.diagonalIndices)
  const h: Array<{ segIndex: number; lengthPx: number; anchorPoint: { x: number; y: number } }> = []
  const v: Array<{ segIndex: number; lengthPx: number; anchorPoint: { x: number; y: number } }> = []
  const seenH = new Set<number>()
  const seenV = new Set<number>()

  for (const diagIndex of params.diagonalIndices) {
    const diag = params.segments[diagIndex]
    if (!diag) continue
    for (const point of [diag.a, diag.b]) {
      for (const inc of incidentAt(params.segments, point, params.endpointSnapPx)) {
        if (diagSet.has(inc.segIndex)) continue
        const kind = classifyLayer6Segment(inc.segment, inc.segIndex, params.hvBandPx).kind
        if (kind === 'H' && !seenH.has(inc.segIndex)) {
          seenH.add(inc.segIndex)
          h.push({ segIndex: inc.segIndex, lengthPx: inc.lengthPx, anchorPoint: { ...point } })
        } else if (kind === 'V' && !seenV.has(inc.segIndex)) {
          seenV.add(inc.segIndex)
          v.push({ segIndex: inc.segIndex, lengthPx: inc.lengthPx, anchorPoint: { ...point } })
        }
      }
    }
  }

  // Nabije H/V binnen maxNearPx (keten-assen wanneer chamfer niet direct op endpoint zit).
  if (h.length > 0 && v.length > 0) {
    tally('W-35', 'endpoint')
  } else {
    tally('W-35', 'near_scan')
    const classified = classifyLayer6Segments(params.segments, params.hvBandPx)
    for (let i = 0; i < params.segments.length; i += 1) {
      if (diagSet.has(i)) continue
      const kind = classified[i]?.kind
      if (kind !== 'H' && kind !== 'V') continue
      const seg = params.segments[i]
      let bestDist = Number.POSITIVE_INFINITY
      let bestAnchor = seg.a
      for (const diagIndex of params.diagonalIndices) {
        const diag = params.segments[diagIndex]
        for (const point of [diag.a, diag.b]) {
          const d = Math.min(
            Math.hypot(point.x - seg.a.x, point.y - seg.a.y),
            Math.hypot(point.x - seg.b.x, point.y - seg.b.y),
          )
          if (d < bestDist) {
            bestDist = d
            bestAnchor =
              Math.hypot(point.x - seg.a.x, point.y - seg.a.y) <=
              Math.hypot(point.x - seg.b.x, point.y - seg.b.y)
                ? seg.a
                : seg.b
          }
        }
      }
      if (bestDist > params.maxNearPx) continue
      if (kind === 'H' && !seenH.has(i)) {
        seenH.add(i)
        h.push({
          segIndex: i,
          lengthPx: classified[i].lengthPx,
          anchorPoint: { ...bestAnchor },
        })
      }
      if (kind === 'V' && !seenV.has(i)) {
        seenV.add(i)
        v.push({
          segIndex: i,
          lengthPx: classified[i].lengthPx,
          anchorPoint: { ...bestAnchor },
        })
      }
    }
    if (h.length === 0 || v.length === 0) {
      tally('W-35', 'incomplete')
    }
  }

  return { h, v }
}

function consensusAxisSegment(params: {
  segments: Segment[]
  segIndex: number
  anchorPoint: { x: number; y: number }
  kind: 'H' | 'V'
  hvBandPx: number
  consensusReachPx: number
  endpointSnapPx?: number
  nearbyWeldPx?: number
}): Segment {
  const seg = params.segments[params.segIndex]
  const span = measureCollinearChainSpan({
    segments: params.segments,
    startSegIndex: params.segIndex,
    anchorPoint: params.anchorPoint,
    hvBandPx: params.hvBandPx,
    endpointSnapPx: params.endpointSnapPx,
    nearbyWeldPx: params.nearbyWeldPx,
  })
  // Representatieve oneindige as: verleng langs consensus-aswaarde.
  const classified = classifyLayer6Segment(seg, params.segIndex, params.hvBandPx)
  const axis =
    classified.targetAxis ??
    (params.kind === 'H' ? (seg.a.y + seg.b.y) / 2 : (seg.a.x + seg.b.x) / 2)
  const reach = Math.max(span, params.consensusReachPx)
  if (params.kind === 'H') {
    return {
      a: { x: params.anchorPoint.x - reach, y: axis },
      b: { x: params.anchorPoint.x + reach, y: axis },
    }
  }
  return {
    a: { x: axis, y: params.anchorPoint.y - reach },
    b: { x: axis, y: params.anchorPoint.y + reach },
  }
}

/**
 * Bepaal H×V-hit + te lassen armen voor één diagonaal-seed (hele chamfer-groep).
 * null = geen betrouwbare assen → skip (diagonaal laten staan).
 */
export function resolveChamferGroupGeometry(params: {
  segments: Segment[]
  connectorIndex: number
  referenceWallThicknessPx?: number
}): ChamferGroupGeometry | null {
  const scale = resolveLayer6Scale(params.referenceWallThicknessPx)
  const hvBandPx = resolveHvBandPx(scale.hvBandPx)
  const endpointSnapPx = scale.endpointSnapPx
  const nearbyWeldPx = scale.nearbyWeldPx
  const connector = params.segments[params.connectorIndex]
  if (!connector) return null
  if (classifyLayer6Segment(connector, params.connectorIndex, hvBandPx).kind !== 'D') return null

  const maxChainPx = scale.axisChainPx
  const maxConnectorPx = scale.connectorMaxPx

  // ESC:W-34 (A)
  // Prioriteit: landing / simple-L (expliciete H+V-topology). Geen hoekfilter hier —
  // korte ondiepe L-chamfers (~9px, ~24°) zijn geldig; zigzag-jogs matchen geen simple-L.
  const landing = resolveLandingChamferGeometry({
    segments: params.segments,
    diagonal: connector,
    minArmPx: scale.armLoosePx,
    referenceWallThicknessPx: scale.refPx,
    hvBandPx,
  })
  if (landing) {
    const diagonalIndices = collectDiagonalGroupIndices({
      segments: params.segments,
      seedIndex: params.connectorIndex,
      maxChainPx,
      maxStubPx: maxConnectorPx,
      hvBandPx,
      endpointSnapPx,
    })
    const vAtLanding = landing.vAtLanding === true
    tally('W-34', 'landing')
    return {
      kind: 'landing',
      hit: landing.hit,
      diagonalIndices,
      hSegIndices: [landing.longHSegIndex],
      vSegIndices: [landing.vSegIndex],
      // Touch-punten: landing-as ver van junction, junction-as dichtbij.
      hTouchPoint: vAtLanding ? landing.junctionPoint : landing.landingPoint,
      vTouchPoint: vAtLanding ? landing.landingPoint : landing.junctionPoint,
      landingJunctionPoint: landing.junctionPoint,
      longHSegIndex: landing.longHSegIndex,
      vAtLanding,
    }
  }

  const simpleL = resolveSimpleLChamferGeometry({
    segments: params.segments,
    diagonal: connector,
    connectorIndex: params.connectorIndex,
    minArmPx: scale.armLoosePx,
    referenceWallThicknessPx: scale.refPx,
    hvBandPx,
  })
  if (simpleL) {
    const diagonalIndices = collectDiagonalGroupIndices({
      segments: params.segments,
      seedIndex: params.connectorIndex,
      maxChainPx,
      maxStubPx: maxConnectorPx,
      hvBandPx,
      endpointSnapPx,
    })
    tally('W-34', 'simple_L')
    return {
      kind: 'L',
      hit: simpleL.hit,
      diagonalIndices,
      hSegIndices: [simpleL.hSegIndex],
      vSegIndices: [simpleL.vSegIndex],
      hTouchPoint: simpleL.hTouchPoint,
      vTouchPoint: simpleL.vTouchPoint,
    }
  }

  // Generiek multi-chamfer pad: skip ondiepe jogs (<28°) en bijna-verticale connectors.
  {
    const dx = Math.abs(connector.a.x - connector.b.x)
    const dy = Math.abs(connector.a.y - connector.b.y)
    const angleFromH = (Math.atan2(dy, dx) * 180) / Math.PI
    if (angleFromH < LAYER6_SHALLOW_JOG_DEG || angleFromH > LAYER6_STEEP_JOG_DEG) {
      tally('W-34', 'skip_shallow_steep')
      return null
    }
  }

  const diagonalIndices = collectDiagonalGroupIndices({
    segments: params.segments,
    seedIndex: params.connectorIndex,
    maxChainPx,
    maxStubPx: maxConnectorPx,
    hvBandPx,
    endpointSnapPx,
  })

  // Trap-keten (draaizin wisselt): niet als chamfer-groep collapsen.
  if (
    isAlternatingStairDiagonalChain({ segments: params.segments, diagonalIndices, endpointSnapPx })
  ) {
    tally('W-34', 'skip_stair')
    return null
  }

  // Multi-chamfer L: H op één groep-einde, V op het andere — alleen leaf-eindpunten
  // (geen interne anti-parallel knopen), bereik ≤ connector×2.
  const leafEnds: Array<{ x: number; y: number }> = []
  for (const idx of diagonalIndices) {
    const seg = params.segments[idx]
    for (const p of [seg.a, seg.b]) {
      const diagDeg = incidentAt(params.segments, p, endpointSnapPx).filter((inc) =>
        diagonalIndices.includes(inc.segIndex),
      ).length
      if (diagDeg !== 1) continue
      if (!leafEnds.some((e) => Math.hypot(e.x - p.x, e.y - p.y) <= endpointSnapPx)) {
        leafEnds.push({ ...p })
      }
    }
  }
  const hvAtEnds = leafEnds.map((point) => {
    const incidents = incidentAt(params.segments, point, endpointSnapPx).filter(
      (inc) => !diagonalIndices.includes(inc.segIndex),
    )
    const h = incidents
      .filter((inc) => classifyLayer6Segment(inc.segment, inc.segIndex, hvBandPx).kind === 'H')
      .sort((a, b) => b.lengthPx - a.lengthPx)
    const v = incidents
      .filter((inc) => classifyLayer6Segment(inc.segment, inc.segIndex, hvBandPx).kind === 'V')
      .sort((a, b) => b.lengthPx - a.lengthPx)
    return { point, h, v }
  })

  for (let i = 0; i < hvAtEnds.length; i += 1) {
    for (let j = 0; j < hvAtEnds.length; j += 1) {
      if (i === j) continue
      const hSide = hvAtEnds[i]
      const vSide = hvAtEnds[j]
      if (hSide.h.length === 0 || vSide.v.length === 0) continue
      const hPick = hSide.h[0]
      const vPick = vSide.v[0]
      // Gebruik langste H-as (stub×V kan numeriek ok zijn; lange arm is stabieler).
      const hForHit =
        hSide.h.find(
          (inc) => segmentLength(inc.segment) >= maxConnectorPx * LAYER6_LONG_H_MIN_CONNECTOR_RATIO,
        ) ?? hPick
      const hit = infiniteLineIntersection(hForHit.segment, vPick.segment)
      if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y)) continue
      const reach = Math.max(
        Math.hypot(hit.x - hSide.point.x, hit.y - hSide.point.y),
        Math.hypot(hit.x - vSide.point.x, hit.y - vSide.point.y),
      )
      if (reach > maxConnectorPx * 2) continue

      // T of through-H op het H-eind: niet simple-L yanken.
      // Landing-brug alleen bij korte V-jog-stub of ≥2 H.
      // Lange V op hetzelfde eind = echte T-stam → gewoon naar H×V lassen (oost-T).
      const shortVAtH = hSide.v.filter(
        (inc) => inc.lengthPx <= Math.min(maxConnectorPx, scale.stubCapPx),
      )
      const longVAtH = hSide.v.filter(
        (inc) => inc.lengthPx > Math.min(maxConnectorPx, scale.stubCapPx),
      )
      if ((hSide.h.length >= 2 || shortVAtH.length > 0) && longVAtH.length === 0) {
        const maxBridge = scale.maxAttachmentShiftPx * LAYER6_BRIDGE_MAX_SHIFT_RATIO
        const bridgeLen = Math.hypot(hit.x - hSide.point.x, hit.y - hSide.point.y)
        if (bridgeLen > maxBridge) continue
        tally('W-34', 'multi')
        return {
          kind: 'landing',
          hit,
          diagonalIndices,
          hSegIndices: [...new Set(hSide.h.map((inc) => inc.segIndex))],
          vSegIndices: [...new Set(vSide.v.map((inc) => inc.segIndex))],
          hTouchPoint: { ...hSide.point },
          vTouchPoint: { ...vSide.point },
          landingJunctionPoint: { ...hSide.point },
          longHSegIndex: hForHit.segIndex,
          vAtLanding: true,
        }
      }

      tally('W-34', 'multi')
      return {
        kind: 'L',
        hit,
        diagonalIndices,
        hSegIndices: [...new Set(hSide.h.map((inc) => inc.segIndex))],
        vSegIndices: [...new Set(vSide.v.map((inc) => inc.segIndex))],
        hTouchPoint: hSide.point,
        vTouchPoint: vSide.point,
      }
    }
  }

  const { h, v } = hvIncidentsNearGroup({
    segments: params.segments,
    diagonalIndices,
    maxNearPx: Math.min(maxConnectorPx * 2, scale.nearGroupPx),
    hvBandPx,
    endpointSnapPx,
  })

  const hPick = pickDominantChainIncident({
    segments: params.segments,
    incidents: h,
    hvBandPx,
    endpointSnapPx,
    nearbyWeldPx,
  })
  const vPick = pickDominantChainIncident({
    segments: params.segments,
    incidents: v,
    hvBandPx,
    endpointSnapPx,
    nearbyWeldPx,
  })

  // T-branch: H op T, V alleen aan tip van diagonaalketting.
  if (hPick && !vPick) {
    const hInc = h.find((item) => item.segIndex === hPick.segIndex)!
    const tipCandidates = diagonalIndices.flatMap((idx) => {
      const seg = params.segments[idx]
      return [seg.a, seg.b]
    })
    let bestV: {
      segIndex: number
      lengthPx: number
      anchorPoint: { x: number; y: number }
    } | null = null
    let bestSpan = 0
    for (const tip of tipCandidates) {
      const vAtTip = incidentAt(params.segments, tip, endpointSnapPx).filter((inc) => {
        if (diagonalIndices.includes(inc.segIndex)) return false
        return classifyLayer6Segment(inc.segment, inc.segIndex, hvBandPx).kind === 'V'
      })
      for (const inc of vAtTip) {
        const span = measureCollinearChainSpan({
          segments: params.segments,
          startSegIndex: inc.segIndex,
          anchorPoint: tip,
          hvBandPx,
          endpointSnapPx,
          nearbyWeldPx,
        })
        if (span > bestSpan) {
          bestSpan = span
          bestV = { segIndex: inc.segIndex, lengthPx: span, anchorPoint: { ...tip } }
        }
      }
    }
    if (bestV) {
      const hAxis = consensusAxisSegment({
        segments: params.segments,
        segIndex: hPick.segIndex,
        anchorPoint: hInc.anchorPoint,
        kind: 'H',
        hvBandPx,
        consensusReachPx: scale.consensusReachPx,
        endpointSnapPx,
        nearbyWeldPx,
      })
      const vAxis = consensusAxisSegment({
        segments: params.segments,
        segIndex: bestV.segIndex,
        anchorPoint: bestV.anchorPoint,
        kind: 'V',
        hvBandPx,
        consensusReachPx: scale.consensusReachPx,
        endpointSnapPx,
        nearbyWeldPx,
      })
      const hit = infiniteLineIntersection(hAxis, vAxis)
      if (hit && Number.isFinite(hit.x) && Number.isFinite(hit.y)) {
        const hAtT = incidentAt(params.segments, hInc.anchorPoint, endpointSnapPx)
          .filter((inc) => classifyLayer6Segment(inc.segment, inc.segIndex, hvBandPx).kind === 'H')
          .map((inc) => inc.segIndex)
        tally('W-34', 'multi')
        return {
          kind: hAtT.length >= 2 ? 'T' : 'L',
          hit,
          diagonalIndices,
          hSegIndices: [...new Set([hPick.segIndex, ...hAtT])],
          vSegIndices: [bestV.segIndex],
          hTouchPoint: hInc.anchorPoint,
          vTouchPoint: bestV.anchorPoint,
        }
      }
    }
  }

  if (!hPick || !vPick) {
    tally('W-34', 'null')
    return null
  }

  const hInc = h.find((item) => item.segIndex === hPick.segIndex)!
  const vInc = v.find((item) => item.segIndex === vPick.segIndex)!
  const hAxis = consensusAxisSegment({
    segments: params.segments,
    segIndex: hPick.segIndex,
    anchorPoint: hInc.anchorPoint,
    kind: 'H',
    hvBandPx,
    consensusReachPx: scale.consensusReachPx,
    endpointSnapPx,
    nearbyWeldPx,
  })
  const vAxis = consensusAxisSegment({
    segments: params.segments,
    segIndex: vPick.segIndex,
    anchorPoint: vInc.anchorPoint,
    kind: 'V',
    hvBandPx,
    consensusReachPx: scale.consensusReachPx,
    endpointSnapPx,
    nearbyWeldPx,
  })
  const hit = infiniteLineIntersection(hAxis, vAxis)
  if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y)) {
    tally('W-34', 'null')
    return null
  }

  // Seed-diagonaal moet aan H- of V-touch hangen — geen verre T via losse diag repareren.
  const seed = params.segments[params.connectorIndex]
  const seedTouches = (point: { x: number; y: number }) =>
    Math.hypot(seed.a.x - point.x, seed.a.y - point.y) <= nearbyWeldPx ||
    Math.hypot(seed.b.x - point.x, seed.b.y - point.y) <= nearbyWeldPx
  // ESC:W-36 (B)
  const seedOnGroupTouch =
    seedTouches(hInc.anchorPoint) ||
    seedTouches(vInc.anchorPoint) ||
    diagonalIndices.some((idx) => {
      if (idx === params.connectorIndex) return false
      const other = params.segments[idx]
      return (
        (seedTouches(other.a) || seedTouches(other.b)) &&
        (Math.hypot(other.a.x - hInc.anchorPoint.x, other.a.y - hInc.anchorPoint.y) <=
          nearbyWeldPx ||
          Math.hypot(other.b.x - hInc.anchorPoint.x, other.b.y - hInc.anchorPoint.y) <=
            nearbyWeldPx ||
          Math.hypot(other.a.x - vInc.anchorPoint.x, other.a.y - vInc.anchorPoint.y) <=
            nearbyWeldPx ||
          Math.hypot(other.b.x - vInc.anchorPoint.x, other.b.y - vInc.anchorPoint.y) <=
            nearbyWeldPx)
      )
    })
  if (!seedOnGroupTouch) {
    tally('W-36', 'reject_seed_not_on_touch')
    return null
  }
  tally('W-36', 'accepted')

  const maxShift = Math.max(
    scale.maxAttachmentShiftPx * 2,
    maxConnectorPx * 1.5,
    maxChainPx * LAYER6_NEAR_GROUP_AXIS_CHAIN_RATIO,
  )
  const nearGroup = diagonalIndices.some((idx) => {
    const seg = params.segments[idx]
    return (
      Math.hypot(seg.a.x - hit.x, seg.a.y - hit.y) <= maxShift ||
      Math.hypot(seg.b.x - hit.x, seg.b.y - hit.y) <= maxShift
    )
  })
  if (!nearGroup) {
    tally('W-34', 'null')
    return null
  }

  const hAtTouch = incidentAt(params.segments, hInc.anchorPoint, endpointSnapPx)
    .filter((inc) => classifyLayer6Segment(inc.segment, inc.segIndex, hvBandPx).kind === 'H')
    .map((inc) => inc.segIndex)
  const vAtTouch = incidentAt(params.segments, vInc.anchorPoint, endpointSnapPx)
    .filter((inc) => classifyLayer6Segment(inc.segment, inc.segIndex, hvBandPx).kind === 'V')
    .map((inc) => inc.segIndex)

  const kind: ChamferGroupKind = hAtTouch.length >= 2 || vAtTouch.length >= 2 ? 'T' : 'L'

  tally('W-34', 'multi')
  return {
    kind,
    hit,
    diagonalIndices,
    hSegIndices: [...new Set([hPick.segIndex, ...hAtTouch])],
    vSegIndices: [...new Set([vPick.segIndex, ...vAtTouch])],
    hTouchPoint: hInc.anchorPoint,
    vTouchPoint: vInc.anchorPoint,
  }
}
