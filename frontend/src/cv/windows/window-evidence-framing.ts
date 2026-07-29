import { assertSpacePolicy } from '@/cv/walls/rooms/space-policy-assert'
import type { RootFace } from './window-axel-strip-geometry'
import { denormalizeSizeRange, fitsFramingSizeRange } from './window-size-range'
import {
  axisCenter,
  axisEnd,
  axisSpan,
  axisStart,
  isFullyInsideFramingBand,
  normalizeSizeForOrientation,
  resolveFramingBand,
  resolveLocalAxisBandPx,
  unionRootsBBox,
} from './window-evidence-geom'
import { WINDOW_EVIDENCE_TUNING } from './window-evidence-tuning'
import { WINDOW_SPACE_POLICY } from './window-space-policy'
import type {
  WindowAxelHypothesis,
  WindowAxelOrientation,
  WindowAxelRefBand,
  WindowSizeRange2d,
} from './types'

export type FramingAttempt =
  | { ok: true; faceIds: number[] }
  | { ok: false; reason: 'framing_band' | 'framing_size' | 'framing_sides' }

/**
 * Framing size: ondergrens = min over alle refs, bovengrens = max over alle refs
 * (niet asymmetisch op één ref-B/W).
 */
function poolFramingSizeRange(params: {
  refBands: WindowAxelRefBand[]
  localAxisBandPx: number
}): WindowSizeRange2d | null {
  const denormed: WindowSizeRange2d[] = []
  for (const ref of params.refBands) {
    if (!ref.framingSizeRange) continue
    denormed.push(denormalizeSizeRange(ref.framingSizeRange, params.localAxisBandPx))
  }
  if (denormed.length <= 0) return null
  return {
    minWidth: Math.min(...denormed.map((r) => r.minWidth)),
    minHeight: Math.min(...denormed.map((r) => r.minHeight)),
    maxWidth: Math.max(...denormed.map((r) => r.maxWidth)),
    maxHeight: Math.max(...denormed.map((r) => r.maxHeight)),
  }
}

/**
 * Eén framing-pad in één space: band + size + L/R (of T/B) uit dezelfde face-set.
 * Geen appels/peren (wit-band × inkt-kozijn).
 */
function tryFramingPath(params: {
  orientation: WindowAxelOrientation
  hypBbox: WindowAxelHypothesis['unionBBox']
  /** Faces in dezelfde space als hypBbox (wit of inkt). */
  spaceFaces: RootFace[]
  framingRange: WindowSizeRange2d
  localAxisBandPx: number
}): FramingAttempt {
  const { orientation, hypBbox, spaceFaces, framingRange, localAxisBandPx } = params
  const span = Math.max(1, axisSpan(hypBbox, orientation))
  const framingBand = resolveFramingBand({ hypothesis: hypBbox, orientation })
  const sideCenterRange = Math.max(
    WINDOW_EVIDENCE_TUNING.minSideCenterRangePx,
    span * WINDOW_EVIDENCE_TUNING.axisSideCenterRatio,
  )
  const startThreshold = axisStart(hypBbox, orientation) + sideCenterRange
  const endThreshold = axisEnd(hypBbox, orientation) - sideCenterRange
  const sideDistancePx = Math.max(
    WINDOW_EVIDENCE_TUNING.minSideDistancePx,
    localAxisBandPx * WINDOW_EVIDENCE_TUNING.framingSideDistanceBandScale,
  )

  let bestStart: { faceId: number; distance: number } | null = null
  let bestEnd: { faceId: number; distance: number } | null = null
  let sawBandFail = false
  let sawSizeFail = false
  let sawSideCandidate = false

  for (const face of spaceFaces) {
    if (
      !isFullyInsideFramingBand({
        face: face.bbox,
        band: framingBand,
        orientation,
      })
    ) {
      const center = axisCenter(face.bbox, orientation)
      if (center <= startThreshold || center >= endThreshold) sawBandFail = true
      continue
    }
    const normalizedSize = normalizeSizeForOrientation({
      widthPx: face.bbox.width,
      heightPx: face.bbox.height,
      orientation,
    })
    if (
      !fitsFramingSizeRange({
        widthPx: normalizedSize.widthPx,
        heightPx: normalizedSize.heightPx,
        range: framingRange,
        minWidthRatio: WINDOW_EVIDENCE_TUNING.framingMinWidthRatio,
        bandValidated: true,
      })
    ) {
      sawSizeFail = true
      continue
    }
    const center = axisCenter(face.bbox, orientation)
    const distanceToStart = Math.abs(axisEnd(face.bbox, orientation) - axisStart(hypBbox, orientation))
    if (center <= startThreshold && distanceToStart <= sideDistancePx) {
      sawSideCandidate = true
      if (!bestStart || distanceToStart < bestStart.distance) {
        bestStart = { faceId: face.root, distance: distanceToStart }
      }
    }
    const distanceToEnd = Math.abs(axisStart(face.bbox, orientation) - axisEnd(hypBbox, orientation))
    if (center >= endThreshold && distanceToEnd <= sideDistancePx) {
      sawSideCandidate = true
      if (!bestEnd || distanceToEnd < bestEnd.distance) {
        bestEnd = { faceId: face.root, distance: distanceToEnd }
      }
    }
  }

  if (bestStart && bestEnd) {
    return { ok: true, faceIds: [...new Set([bestStart.faceId, bestEnd.faceId])] }
  }
  if (sawBandFail && !sawSideCandidate) return { ok: false, reason: 'framing_band' }
  if (sawSizeFail) return { ok: false, reason: 'framing_size' }
  return { ok: false, reason: 'framing_sides' }
}

/**
 * Dual-space framing — WINDOW_SPACE_POLICY.stage3Framing === 'either' (OR):
 * 1) opening-wit hyp-band + wit framing faces
 * 2) wall-ink hyp-band (union strip faces) + inkt framing faces
 */
export function selectFramingEvidence(params: {
  hypothesis: WindowAxelHypothesis
  refBands: WindowAxelRefBand[]
  whiteFaces: RootFace[]
  inkFacesByRoot: Map<number, RootFace>
  inkFaces: RootFace[]
}): FramingAttempt {
  assertSpacePolicy('window Stage 3 framing', WINDOW_SPACE_POLICY.stage3Framing, 'either')
  const orientation = params.hypothesis.orientation
  const whiteHyp = params.hypothesis.unionBBox
  const whiteLocal = resolveLocalAxisBandPx({
    hypothesis: params.hypothesis,
    orientation,
  })
  const whiteRange = poolFramingSizeRange({
    refBands: params.refBands,
    localAxisBandPx: whiteLocal,
  })
  if (!whiteRange) return { ok: false, reason: 'framing_sides' }

  const whiteAttempt = tryFramingPath({
    orientation,
    hypBbox: whiteHyp,
    spaceFaces: params.whiteFaces,
    framingRange: whiteRange,
    localAxisBandPx: whiteLocal,
  })
  if (whiteAttempt.ok) return whiteAttempt

  const inkHyp = unionRootsBBox(params.hypothesis.faceIds, params.inkFacesByRoot)
  if (!inkHyp) return whiteAttempt

  const inkLocal = Math.max(1, orientation === 'horizontal' ? inkHyp.height : inkHyp.width)
  const inkRange = poolFramingSizeRange({
    refBands: params.refBands,
    localAxisBandPx: inkLocal,
  })
  if (!inkRange) return whiteAttempt

  const inkAttempt = tryFramingPath({
    orientation,
    hypBbox: inkHyp,
    spaceFaces: params.inkFaces,
    framingRange: inkRange,
    localAxisBandPx: inkLocal,
  })
  if (inkAttempt.ok) return inkAttempt

  // Specifieker van de twee fails bewaren (band > size > sides).
  const rank = (r: FramingAttempt): number => {
    if (r.ok) return 0
    if (r.reason === 'framing_band') return 3
    if (r.reason === 'framing_size') return 2
    return 1
  }
  return rank(inkAttempt) >= rank(whiteAttempt) ? inkAttempt : whiteAttempt
}
