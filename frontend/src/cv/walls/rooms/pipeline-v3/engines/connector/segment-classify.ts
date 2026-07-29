import type { Segment } from '@/cv/port/wallGraph'
import { segmentAngleDeg, segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { classifyHvOrientation } from '../hv/qualify'
import { LAYER6_HV_ANGLE_TOL_DEG, LAYER6_HV_BAND_FALLBACK_PX } from './constants'

export type Layer6SegmentKind = 'H' | 'V' | 'D'

export interface Layer6SegmentClassified {
  index: number
  kind: Layer6SegmentKind
  angleDeg: number
  lengthPx: number
  targetAxis: number | null
}

function isNearHorizontalAngle(
  angleDeg: number,
  tolDeg: number = LAYER6_HV_ANGLE_TOL_DEG,
): boolean {
  const abs = Math.abs(((angleDeg % 180) + 180) % 180)
  return abs <= tolDeg || abs >= 180 - tolDeg
}

function isNearVerticalAngle(angleDeg: number, tolDeg: number = LAYER6_HV_ANGLE_TOL_DEG): boolean {
  const abs = Math.abs(((angleDeg % 180) + 180) % 180)
  return Math.abs(abs - 90) <= tolDeg
}

export function classifyLayer6Segment(
  seg: Segment,
  index: number,
  hvBandPx: number = LAYER6_HV_BAND_FALLBACK_PX,
): Layer6SegmentClassified {
  const angleDeg = segmentAngleDeg(seg)
  const len = segmentLength(seg)
  const hv = classifyHvOrientation(seg, hvBandPx)
  const strictH = isNearHorizontalAngle(angleDeg)
  const strictV = isNearVerticalAngle(angleDeg)
  if (hv === 'H' && strictH) {
    return {
      index,
      kind: 'H',
      angleDeg,
      lengthPx: len,
      targetAxis: (seg.a.y + seg.b.y) / 2,
    }
  }
  if (hv === 'V' && strictV) {
    return {
      index,
      kind: 'V',
      angleDeg,
      lengthPx: len,
      targetAxis: (seg.a.x + seg.b.x) / 2,
    }
  }
  // Fallback: hoek bijna H/V maar buiten strikte L4-band.
  if (strictH) {
    return {
      index,
      kind: 'H',
      angleDeg,
      lengthPx: len,
      targetAxis: (seg.a.y + seg.b.y) / 2,
    }
  }
  if (strictV) {
    return {
      index,
      kind: 'V',
      angleDeg,
      lengthPx: len,
      targetAxis: (seg.a.x + seg.b.x) / 2,
    }
  }
  return {
    index,
    kind: 'D',
    angleDeg,
    lengthPx: len,
    targetAxis: null,
  }
}

export function classifyLayer6Segments(
  segments: Segment[],
  hvBandPx: number = LAYER6_HV_BAND_FALLBACK_PX,
): Layer6SegmentClassified[] {
  return segments.map((segment, index) => classifyLayer6Segment(segment, index, hvBandPx))
}
