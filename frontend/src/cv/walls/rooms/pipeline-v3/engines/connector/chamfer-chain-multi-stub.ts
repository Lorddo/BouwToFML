/**
 * L6 chamfer-chain — multi-stub chain collect / membership.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { classifyLayer6Segment } from './segment-classify'
import { LAYER6_HV_BAND_FALLBACK_PX } from './constants'
import { diagonalIncidentsAt, walkDiagonalChamferChain } from './chamfer-chain-walk'

export function collectChamferChainSegmentIndices(params: {
  segments: Segment[]
  tPoint: { x: number; y: number }
  maxChainPx: number
  maxStubSegmentPx?: number
  hvBandPx?: number
  endpointSnapPx?: number
}): number[] {
  const hvBandPx = params.hvBandPx ?? LAYER6_HV_BAND_FALLBACK_PX
  const endpointSnapPx = params.endpointSnapPx
  const stubMax = params.maxStubSegmentPx ?? params.maxChainPx
  const diags = diagonalIncidentsAt(params.segments, params.tPoint, hvBandPx, endpointSnapPx)
  let best: number[] = []
  let bestLen = 0
  for (const diag of diags) {
    if (diag.lengthPx > stubMax) continue
    let totalLengthPx = diag.lengthPx
    const indices = [diag.segIndex]
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
      for (const segIndex of walk.segIndices) {
        const len = segmentLength(params.segments[segIndex]!)
        if (len > stubMax) break
        indices.push(segIndex)
        totalLengthPx += len
        tipPoint = walk.tipPoint
      }
    }
    if (totalLengthPx > params.maxChainPx) continue
    if (totalLengthPx > bestLen) {
      bestLen = totalLengthPx
      best = indices
    }
  }
  return best
}

export function isSegmentInMultiStubChamferChain(params: {
  segments: Segment[]
  segIndex: number
  connector: Segment
  maxChainPx: number
  maxStubSegmentPx: number
  hvBandPx?: number
}): boolean {
  const hvBandPx = params.hvBandPx ?? LAYER6_HV_BAND_FALLBACK_PX
  const classified = classifyLayer6Segment(
    params.segments[params.segIndex]!,
    params.segIndex,
    hvBandPx,
  )
  if (classified.kind !== 'D') return false

  const stubLists: number[][] = []
  const pushStubs = (tPoint: { x: number; y: number }) => {
    const stubs = collectChamferChainSegmentIndices({
      segments: params.segments,
      tPoint,
      maxChainPx: params.maxChainPx,
      maxStubSegmentPx: params.maxStubSegmentPx,
      hvBandPx,
    })
    if (stubs.length >= 2) stubLists.push(stubs)
  }

  for (const point of [params.connector.a, params.connector.b]) {
    pushStubs(point)
    for (let i = 0; i < params.segments.length; i += 1) {
      const kind = classifyLayer6Segment(params.segments[i]!, i, hvBandPx).kind
      if (kind !== 'H') continue
      const seg = params.segments[i]!
      const near = Math.min(
        Math.hypot(point.x - seg.a.x, point.y - seg.a.y),
        Math.hypot(point.x - seg.b.x, point.y - seg.b.y),
      )
      if (near > params.maxChainPx) continue
      pushStubs(seg.a)
      pushStubs(seg.b)
    }
  }

  return stubLists.some((stubs) => stubs.includes(params.segIndex))
}
