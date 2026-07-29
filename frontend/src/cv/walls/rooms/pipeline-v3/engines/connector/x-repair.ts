import type { Segment } from '@/cv/port/wallGraph'
import { replaceEndpoint } from '../segment-ops'
import { classifyLayer6Segment } from './segment-classify'
import { LAYER6_ENDPOINT_SNAP_PX, LAYER6_HV_BAND_FALLBACK_PX } from './constants'

export function repairLayer6XAtPoint(params: {
  segments: Segment[]
  point: { x: number; y: number }
  maxShiftPx: number
  hvBandPx?: number
  endpointSnapPx?: number
}): boolean {
  const hvBandPx = params.hvBandPx ?? LAYER6_HV_BAND_FALLBACK_PX
  const endpointSnapPx = params.endpointSnapPx ?? LAYER6_ENDPOINT_SNAP_PX
  const incidents: Array<{ index: number; kind: 'H' | 'V' | 'D'; axis: number | null }> = []
  for (let i = 0; i < params.segments.length; i += 1) {
    const seg = params.segments[i]
    const touches =
      Math.hypot(seg.a.x - params.point.x, seg.a.y - params.point.y) <= endpointSnapPx ||
      Math.hypot(seg.b.x - params.point.x, seg.b.y - params.point.y) <= endpointSnapPx
    if (!touches) continue
    const c = classifyLayer6Segment(seg, i, hvBandPx)
    incidents.push({ index: i, kind: c.kind, axis: c.targetAxis })
  }

  const hs = incidents.filter((entry) => entry.kind === 'H' && entry.axis != null)
  const vs = incidents.filter((entry) => entry.kind === 'V' && entry.axis != null)
  if (hs.length < 2 || vs.length < 2) return false

  const x = vs.reduce((sum, entry) => sum + (entry.axis as number), 0) / vs.length
  const y = hs.reduce((sum, entry) => sum + (entry.axis as number), 0) / hs.length
  const shift = Math.hypot(x - params.point.x, y - params.point.y)
  if (shift > params.maxShiftPx) return false

  replaceEndpoint(params.segments, params.point, { x, y }, endpointSnapPx)
  return true
}
