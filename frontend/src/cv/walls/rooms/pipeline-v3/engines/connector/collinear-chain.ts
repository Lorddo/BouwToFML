import type { Segment } from '@/cv/port/wallGraph'
import { pointsNear } from '../segment-ops'
import {
  LAYER6_ENDPOINT_SNAP_PX,
  LAYER6_HV_BAND_FALLBACK_PX,
  LAYER6_NEARBY_WELD_PX,
} from './constants'
import { classifyLayer6Segment } from './segment-classify'

function axisValueFor(seg: Segment, segIndex: number, kind: 'H' | 'V', hvBandPx: number): number {
  const classified = classifyLayer6Segment(seg, segIndex, hvBandPx)
  if (classified.targetAxis != null) return classified.targetAxis
  return kind === 'H' ? (seg.a.y + seg.b.y) / 2 : (seg.a.x + seg.b.x) / 2
}

function sameAxisKind(
  seg: Segment,
  segIndex: number,
  axis: 'H' | 'V',
  axisValue: number,
  hvBandPx: number,
  nearbyWeldPx: number,
): boolean {
  const classified = classifyLayer6Segment(seg, segIndex, hvBandPx)
  if (classified.kind !== axis) return false
  const value = axisValueFor(seg, segIndex, axis, hvBandPx)
  return Math.abs(value - axisValue) <= nearbyWeldPx
}

/**
 * Totale collineaire keten-lengte langs dezelfde H/V-as vanaf een ankerpunt op startSegIndex.
 * Voorkomt dat Laag 6 op een fragmentje blijft hangen i.p.v. de dominante muurlijn.
 */
export function measureCollinearChainSpan(params: {
  segments: Segment[]
  startSegIndex: number
  anchorPoint: { x: number; y: number }
  hvBandPx?: number
  endpointSnapPx?: number
  nearbyWeldPx?: number
}): number {
  const hvBandPx = params.hvBandPx ?? LAYER6_HV_BAND_FALLBACK_PX
  const endpointSnapPx = params.endpointSnapPx ?? LAYER6_ENDPOINT_SNAP_PX
  const nearbyWeldPx = params.nearbyWeldPx ?? LAYER6_NEARBY_WELD_PX
  const startSeg = params.segments[params.startSegIndex]
  if (!startSeg) return 0
  const classified = classifyLayer6Segment(startSeg, params.startSegIndex, hvBandPx)
  if (classified.kind !== 'H' && classified.kind !== 'V') return classified.lengthPx

  const axis = classified.kind
  const axisValue = axisValueFor(startSeg, params.startSegIndex, axis, hvBandPx)
  const consumed = new Set<number>([params.startSegIndex])
  let span = classified.lengthPx

  const walkFrom = (fromPoint: { x: number; y: number }, initialVia: number) => {
    let atPoint = fromPoint
    let viaSegIndex = initialVia
    while (true) {
      let found: { segIndex: number; nextPoint: { x: number; y: number } } | null = null
      for (let i = 0; i < params.segments.length; i += 1) {
        if (consumed.has(i) || i === viaSegIndex) continue
        const seg = params.segments[i]
        if (!sameAxisKind(seg, i, axis, axisValue, hvBandPx, nearbyWeldPx)) continue
        if (pointsNear(seg.a, atPoint, endpointSnapPx)) {
          found = { segIndex: i, nextPoint: { ...seg.b } }
          break
        }
        if (pointsNear(seg.b, atPoint, endpointSnapPx)) {
          found = { segIndex: i, nextPoint: { ...seg.a } }
          break
        }
      }
      if (!found) break
      consumed.add(found.segIndex)
      span += classifyLayer6Segment(
        params.segments[found.segIndex],
        found.segIndex,
        hvBandPx,
      ).lengthPx
      viaSegIndex = found.segIndex
      atPoint = found.nextPoint
    }
  }

  if (
    !pointsNear(startSeg.a, params.anchorPoint, endpointSnapPx) &&
    !pointsNear(startSeg.b, params.anchorPoint, endpointSnapPx)
  ) {
    return classified.lengthPx
  }

  const atStartA = pointsNear(startSeg.a, params.anchorPoint, endpointSnapPx)
  walkFrom(atStartA ? startSeg.b : startSeg.a, params.startSegIndex)
  walkFrom(atStartA ? startSeg.a : startSeg.b, params.startSegIndex)
  return span
}

export function pickDominantChainIncident(params: {
  segments: Segment[]
  incidents: Array<{ segIndex: number; lengthPx: number; anchorPoint: { x: number; y: number } }>
  hvBandPx?: number
  endpointSnapPx?: number
  nearbyWeldPx?: number
}): { segIndex: number; lengthPx: number } | null {
  const hvBandPx = params.hvBandPx ?? LAYER6_HV_BAND_FALLBACK_PX
  const endpointSnapPx = params.endpointSnapPx ?? LAYER6_ENDPOINT_SNAP_PX
  const nearbyWeldPx = params.nearbyWeldPx ?? LAYER6_NEARBY_WELD_PX
  if (params.incidents.length === 0) return null
  let best = params.incidents[0]
  let bestSpan = measureCollinearChainSpan({
    segments: params.segments,
    startSegIndex: best.segIndex,
    anchorPoint: best.anchorPoint,
    hvBandPx,
    endpointSnapPx,
    nearbyWeldPx,
  })
  for (let i = 1; i < params.incidents.length; i += 1) {
    const candidate = params.incidents[i]
    const span = measureCollinearChainSpan({
      segments: params.segments,
      startSegIndex: candidate.segIndex,
      anchorPoint: candidate.anchorPoint,
      hvBandPx,
      endpointSnapPx,
      nearbyWeldPx,
    })
    if (
      span > bestSpan ||
      (span === bestSpan &&
        classifyLayer6Segment(params.segments[candidate.segIndex], candidate.segIndex, hvBandPx)
          .lengthPx >
          classifyLayer6Segment(params.segments[best.segIndex], best.segIndex, hvBandPx).lengthPx)
    ) {
      best = candidate
      bestSpan = span
    }
  }
  return { segIndex: best.segIndex, lengthPx: bestSpan }
}
