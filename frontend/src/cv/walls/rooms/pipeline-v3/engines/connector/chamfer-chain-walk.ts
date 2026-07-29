/**
 * L6 chamfer-chain — diagonal walk / tip-from-T / companion block / synthetic V.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { incidentAt } from '../segment-ops'
import { classifyLayer6Segment } from './segment-classify'
import {
  LAYER6_ANTIPARALLEL_DOT_MAX,
  LAYER6_CHAIN_WALK_MAX_STEPS,
  LAYER6_ENDPOINT_SNAP_PX,
  LAYER6_HV_BAND_FALLBACK_PX,
} from './constants'

interface DiagonalChamferChainWalk {
  segIndices: number[]
  totalLengthPx: number
  tipPoint: { x: number; y: number }
  rootPoint: { x: number; y: number }
}

function unitFrom(point: { x: number; y: number }, toward: { x: number; y: number }): { x: number; y: number } {
  const dx = toward.x - point.x
  const dy = toward.y - point.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return { x: 0, y: 0 }
  return { x: dx / len, y: dy / len }
}

export function diagonalIncidentsAt(
  segments: Segment[],
  point: { x: number; y: number },
  hvBandPx: number,
  endpointSnapPx: number = LAYER6_ENDPOINT_SNAP_PX,
  excludeSegIndex?: number,
): ReturnType<typeof incidentAt> {
  return incidentAt(segments, point, endpointSnapPx).filter((incident) => {
    if (excludeSegIndex != null && incident.segIndex === excludeSegIndex) return false
    return classifyLayer6Segment(incident.segment, incident.segIndex, hvBandPx).kind === 'D'
  })
}

/** Twee diagonalen op één knoop die ~180° verder lopen = chamfer-ketting, geen hoek. */
function areDiagonalsAntiParallelChainAtPoint(params: {
  segments: Segment[]
  point: { x: number; y: number }
  hvBandPx: number
  endpointSnapPx?: number
  excludeSegIndex?: number
}): boolean {
  const endpointSnapPx = params.endpointSnapPx ?? LAYER6_ENDPOINT_SNAP_PX
  const diags = diagonalIncidentsAt(
    params.segments,
    params.point,
    params.hvBandPx,
    endpointSnapPx,
    params.excludeSegIndex,
  )
  if (diags.length !== 2) return false
  const [a, b] = diags
  const dirA = unitFrom(params.point, a.other)
  const dirB = unitFrom(params.point, b.other)
  const dot = dirA.x * dirB.x + dirA.y * dirB.y
  return dot < LAYER6_ANTIPARALLEL_DOT_MAX
}

/**
 * Loop een degree-2 diagonaal-ketting vanaf `fromPoint` (excl. inkomend segment).
 * Stopt bij tak-splitsing, H/V-arm of max-lengte.
 */
export function walkDiagonalChamferChain(params: {
  segments: Segment[]
  fromPoint: { x: number; y: number }
  hvBandPx?: number
  excludeSegIndex?: number
  /** Voorkom teruglopen naar T-wortel of vorig knooppunt. */
  excludePoint?: { x: number; y: number }
  maxLengthPx: number
  endpointSnapPx?: number
}): DiagonalChamferChainWalk | null {
  const hvBandPx = params.hvBandPx ?? LAYER6_HV_BAND_FALLBACK_PX
  const endpointSnapPx = params.endpointSnapPx ?? LAYER6_ENDPOINT_SNAP_PX
  const visited = new Set<number>()
  if (params.excludeSegIndex != null) visited.add(params.excludeSegIndex)

  const segIndices: number[] = []
  let totalLengthPx = 0
  let current = { ...params.fromPoint }
  const rootPoint = { ...params.fromPoint }
  let prevPoint: { x: number; y: number } | undefined = params.excludePoint
    ? { ...params.excludePoint }
    : undefined

  for (let step = 0; step < LAYER6_CHAIN_WALK_MAX_STEPS; step += 1) {
    const diags = diagonalIncidentsAt(params.segments, current, hvBandPx, endpointSnapPx).filter((incident) => {
      if (visited.has(incident.segIndex)) return false
      if (prevPoint) {
        const da = Math.hypot(incident.other.x - prevPoint.x, incident.other.y - prevPoint.y)
        if (da <= endpointSnapPx) return false
      }
      return true
    })
    if (diags.length === 0) break
    if (diags.length > 1 && !areDiagonalsAntiParallelChainAtPoint({
      segments: params.segments,
      point: current,
      hvBandPx,
      endpointSnapPx,
    })) {
      break
    }

    const next = diags[0]!
    if (totalLengthPx + next.lengthPx > params.maxLengthPx) break

    visited.add(next.segIndex)
    segIndices.push(next.segIndex)
    totalLengthPx += next.lengthPx
    prevPoint = current
    current = { ...next.other }
  }

  if (segIndices.length === 0) return null
  return {
    segIndices,
    totalLengthPx,
    tipPoint: current,
    rootPoint,
  }
}

/** Ketting-tip vanaf T-hoek langs diagonale branch (niet through). */
export function resolveChamferBranchTipFromT(params: {
  segments: Segment[]
  tPoint: { x: number; y: number }
  maxChainPx: number
  hvBandPx?: number
  endpointSnapPx?: number
}): { x: number; y: number } | null {
  const hvBandPx = params.hvBandPx ?? LAYER6_HV_BAND_FALLBACK_PX
  const endpointSnapPx = params.endpointSnapPx ?? LAYER6_ENDPOINT_SNAP_PX
  const diags = diagonalIncidentsAt(params.segments, params.tPoint, hvBandPx, endpointSnapPx)
  if (diags.length === 0) return null

  let bestTip: { x: number; y: number } | null = null
  let bestLen = 0

  for (const diag of diags) {
    let totalLengthPx = diag.lengthPx
    let tipPoint = { ...diag.other }
    const walk = walkDiagonalChamferChain({
      segments: params.segments,
      fromPoint: tipPoint,
      hvBandPx,
      excludePoint: params.tPoint,
      maxLengthPx: params.maxChainPx - totalLengthPx,
      endpointSnapPx,
    })
    if (walk) {
      totalLengthPx += walk.totalLengthPx
      tipPoint = walk.tipPoint
    }
    if (totalLengthPx > params.maxChainPx) continue
    if (totalLengthPx > bestLen) {
      bestLen = totalLengthPx
      bestTip = tipPoint
    }
  }
  return bestTip
}

/**
 * Meerdere diagonalen op één eindpunt: blokkeer alleen echte schuine hoeken.
 * Degree-2 anti-parallell ketting = T-branch chamfer (1058→1044→1043).
 */
export function hasBlockingCompanionDiagonalAtEndpoint(params: {
  segments: Segment[]
  point: { x: number; y: number }
  connectorIndex: number
  maxChainPx: number
  hvBandPx?: number
  endpointSnapPx?: number
}): boolean {
  const hvBandPx = params.hvBandPx ?? LAYER6_HV_BAND_FALLBACK_PX
  const endpointSnapPx = params.endpointSnapPx ?? LAYER6_ENDPOINT_SNAP_PX
  const companions = diagonalIncidentsAt(
    params.segments,
    params.point,
    hvBandPx,
    endpointSnapPx,
    params.connectorIndex,
  )
  if (companions.length === 0) return false

  const allDiagonals = diagonalIncidentsAt(params.segments, params.point, hvBandPx, endpointSnapPx)
  if (
    allDiagonals.length === 2 &&
    areDiagonalsAntiParallelChainAtPoint({
      segments: params.segments,
      point: params.point,
      hvBandPx,
      endpointSnapPx,
    })
  ) {
    return false
  }

  if (areDiagonalsAntiParallelChainAtPoint({
    segments: params.segments,
    point: params.point,
    hvBandPx,
    endpointSnapPx,
    excludeSegIndex: params.connectorIndex,
  })) {
    return false
  }

  if (companions.length === 1) {
    const walk = walkDiagonalChamferChain({
      segments: params.segments,
      fromPoint: params.point,
      hvBandPx,
      excludeSegIndex: params.connectorIndex,
      excludePoint: companions[0]!.other,
      maxLengthPx: params.maxChainPx,
      endpointSnapPx,
    })
    if (walk && walk.segIndices.length > 0) return false
  }

  return true
}

/** Synthetisch V-segment langs chamfer-branch voor H×V-snijpunt op T. */
export function buildSyntheticBranchSegmentAtT(params: {
  tPoint: { x: number; y: number }
  tipPoint: { x: number; y: number }
}): Segment {
  return {
    type: 'wall',
    a: { ...params.tPoint },
    b: { ...params.tipPoint },
    confidence: 0.75,
  }
}
