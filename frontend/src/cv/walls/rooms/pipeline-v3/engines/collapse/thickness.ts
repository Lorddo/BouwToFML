/**
 * Thickness sampling + band-compat for chain collapse (CURRENT L7).
 */
import { tally } from '@/core/diagnostics'
import type { RoomWallMaskRle } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { Segment } from '@/cv/port/wallGraph'
import { wallThicknessBandsCompatible } from '@/core/fml/wall-thickness-chain'
import { FML_BAND_MAX_RATIO } from '@/core/fml/fml-wall-thickness-tiers'
import { buildWallDistanceMap } from '@/cv/walls/rooms/room-wall-segment-thickness'
import {
  resolveThicknessSampleEnds,
  type ThicknessAxisHint,
} from '@/cv/walls/rooms/thickness-axis-sample'
import { resolveObliquePolicy } from '../../policies/oblique'
import type { CollapsePolicy } from '../policy-types'

export { isWallThicknessBridgeCandidatePx } from '@/core/fml/wall-thickness-chain'

function sampleSegmentThicknessPx(params: {
  segment: Segment
  distanceMap: Float32Array | null
  maskWidth: number
  maskHeight: number
  policy: CollapsePolicy
  referenceWallThicknessPx?: number
  thicknessAxes?: readonly ThicknessAxisHint[] | null
}): number {
  const captureBandPx = resolveObliquePolicy(params.referenceWallThicknessPx).captureBandPx
  const sampleEnds = resolveThicknessSampleEnds({
    a: params.segment.a,
    b: params.segment.b,
    axes: params.thicknessAxes,
    captureBandPx,
  })
  const len = Math.hypot(sampleEnds.b.x - sampleEnds.a.x, sampleEnds.b.y - sampleEnds.a.y)
  const inset =
    len > params.policy.thicknessSampleInsetPx * 2 + 1
      ? params.policy.thicknessSampleInsetPx / len
      : 0.5
  const sx = sampleEnds.a.x + (sampleEnds.b.x - sampleEnds.a.x) * inset
  const sy = sampleEnds.a.y + (sampleEnds.b.y - sampleEnds.a.y) * inset
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
    return wallThicknessBandsCompatible(
      thicknessA,
      thicknessB,
      referenceWallThicknessPx,
      policy.bandBoundariesPx,
    )
  }
  if (thicknessA <= 0 || thicknessB <= 0) return true
  const min = Math.min(thicknessA, thicknessB)
  const max = Math.max(thicknessA, thicknessB)
  if (max <= 0) return true
  return min / max >= policy.thicknessMatchMinRatio
}

/** True when all indexed segments share a compatible thickness band (or thickness unknown). */
export function segmentsThicknessCompatible(
  indices: Iterable<number>,
  thicknessBySegment: number[] | undefined,
  policy: CollapsePolicy,
  referenceWallThicknessPx?: number,
): boolean {
  if (!thicknessBySegment || thicknessBySegment.length === 0) return true
  const list = [...indices]
  for (let i = 0; i < list.length; i += 1) {
    const thicknessA = thicknessBySegment[list[i]]
    if (thicknessA == null) continue
    for (let j = i + 1; j < list.length; j += 1) {
      const thicknessB = thicknessBySegment[list[j]]
      if (thicknessB == null) continue
      if (!thicknessCompatible(thicknessA, thicknessB, policy, referenceWallThicknessPx)) {
        return false
      }
    }
  }
  return true
}

/**
 * Cap parallel-offset tolerances on mid-band scale so max-ref does not inflate
 * stub tier enough to swallow façade jogs (~20px) between thinner bands.
 */
export function capOffsetTolerancePx(
  scaledPx: number,
  bandBoundariesPx?: { midBoundaryPx: number; maxBoundaryPx: number },
): number {
  const mid = bandBoundariesPx?.midBoundaryPx
  if (mid == null || !(mid > 0) || !Number.isFinite(scaledPx)) return scaledPx
  const midCap = Math.max(1, Math.round(mid * (8 / 30)))
  return Math.min(scaledPx, midCap)
}

export function buildThicknessBySegment(params: {
  segments: Segment[]
  cv: OpenCV
  maskRle: RoomWallMaskRle
  policy: CollapsePolicy
  referenceWallThicknessPx?: number
  /** Reuse a prebuilt mask distance map (same maskRle). Built once if omitted. */
  distanceMap?: Float32Array | null
  /** L3-assen — sample dikte op axis.line voor as-leden. */
  thicknessAxes?: readonly ThicknessAxisHint[] | null
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
      thicknessAxes: params.thicknessAxes,
    }),
  )
}
