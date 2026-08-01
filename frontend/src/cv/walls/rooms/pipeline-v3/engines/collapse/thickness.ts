/**
 * Thickness sampling + band-compat for chain collapse (CURRENT L7).
 */
import { tally } from '@/core/diagnostics'
import type { RoomWallMaskRle } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import { wallThicknessBandsCompatible } from '@/core/fml/wall-thickness-chain'
import { FML_BAND_MAX_RATIO } from '@/core/fml/fml-wall-thickness-tiers'
import { buildWallDistanceMap } from '@/cv/walls/rooms/room-wall-segment-thickness'
import type { CollapsePolicy } from '../policy-types'

export { isWallThicknessBridgeCandidatePx } from '@/core/fml/wall-thickness-chain'

function sampleSegmentThicknessPx(params: {
  segment: Segment
  distanceMap: Float32Array | null
  maskWidth: number
  maskHeight: number
  policy: CollapsePolicy
  referenceWallThicknessPx?: number
}): number {
  const len = segmentLength(params.segment)
  const inset =
    len > params.policy.thicknessSampleInsetPx * 2 + 1
      ? params.policy.thicknessSampleInsetPx / len
      : 0.5
  const sx = params.segment.a.x + (params.segment.b.x - params.segment.a.x) * inset
  const sy = params.segment.a.y + (params.segment.b.y - params.segment.a.y) * inset
  if (params.distanceMap) {
    const x = Math.round(sx)
    const y = Math.round(sy)
    if (x >= 0 && y >= 0 && x < params.maskWidth && y < params.maskHeight) {
      const dt = params.distanceMap[y * params.maskWidth + x] ?? 0
      if (Number.isFinite(dt) && dt > 0) return dt * 2
    }
  }
  // ESC:W-46 (E) — DT-miss / geen map (zero-length-tak weg 2026-08-01; L5/L6 droppen die al)
  tally('W-46', params.distanceMap ? 'sample_miss' : 'no_map')
  return params.referenceWallThicknessPx ?? params.policy.thicknessFallbackPx
}

/** Max |Δdikte| dat als meetruis telt bij collineaire fake-L (zelfde band-schaal als FML max). */
function resolveCollinearThicknessNoiseMaxPx(referenceWallThicknessPx: number): number {
  return Math.max(referenceWallThicknessPx, 1) * FML_BAND_MAX_RATIO
}

export function collinearThicknessWithinMaxBandNoise(
  thicknessA: number,
  thicknessB: number,
  referenceWallThicknessPx: number,
): boolean {
  return (
    Math.abs(thicknessA - thicknessB) <=
    resolveCollinearThicknessNoiseMaxPx(referenceWallThicknessPx)
  )
}

export function thicknessCompatible(
  thicknessA: number,
  thicknessB: number,
  policy: CollapsePolicy,
  referenceWallThicknessPx?: number,
): boolean {
  if (referenceWallThicknessPx != null && referenceWallThicknessPx > 0) {
    return wallThicknessBandsCompatible(thicknessA, thicknessB, referenceWallThicknessPx)
  }
  if (thicknessA <= 0 || thicknessB <= 0) return true
  const min = Math.min(thicknessA, thicknessB)
  const max = Math.max(thicknessA, thicknessB)
  if (max <= 0) return true
  return min / max >= policy.thicknessMatchMinRatio
}

export function buildThicknessBySegment(params: {
  segments: Segment[]
  cv: OpenCV
  maskRle: RoomWallMaskRle
  policy: CollapsePolicy
  referenceWallThicknessPx?: number
  /** Reuse a prebuilt mask distance map (same maskRle). Built once if omitted. */
  distanceMap?: Float32Array | null
}): number[] {
  const distanceMap =
    params.distanceMap !== undefined
      ? params.distanceMap
      : (buildWallDistanceMap({ cv: params.cv, maskRle: params.maskRle })?.distanceMap ?? null)
  const { width, height } = params.maskRle
  return params.segments.map((segment) =>
    sampleSegmentThicknessPx({
      segment,
      distanceMap,
      maskWidth: width,
      maskHeight: height,
      policy: params.policy,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
    }),
  )
}
