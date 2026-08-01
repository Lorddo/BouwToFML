/**
 * L6 chamfer-group apply — arm endpoint snap helper.
 */
import { tally } from '@/core/diagnostics'
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { replaceSegmentEndpoint } from '../segment-ops'
import { nearestEndpoint } from './chamfer-group-geometry'
import { LAYER6_ENDPOINT_SNAP_PX } from './constants'

export function snapArmToHit(params: {
  segments: Segment[]
  segIndex: number
  touchPoint: { x: number; y: number }
  hit: { x: number; y: number }
  maxArmShift: number
  longSegmentShiftGuardPx?: number
  /** Lange muren mogen wel als de shift klein is (landing H). */
  allowLongSegment?: boolean
  endpointSnapPx?: number
}): void {
  const endpointSnapPx = params.endpointSnapPx ?? LAYER6_ENDPOINT_SNAP_PX
  const seg = params.segments[params.segIndex]
  if (!seg) return
  const end = nearestEndpoint(seg, params.touchPoint)
  const shift = Math.hypot(end.x - params.hit.x, end.y - params.hit.y)
  if (shift > params.maxArmShift) return
  const isLongShift =
    segmentLength(seg) > params.maxArmShift * 3 && shift > (params.longSegmentShiftGuardPx ?? 8)
  // ESC:W-38 (B)
  if (!params.allowLongSegment && isLongShift) {
    tally('W-38', 'skip_long_shift')
    return
  }
  if (params.allowLongSegment && isLongShift) {
    tally('W-38', 'allow_long_ok')
  }
  tally('W-38', 'snapped')
  replaceSegmentEndpoint(params.segments, params.segIndex, end, params.hit, endpointSnapPx)
}
