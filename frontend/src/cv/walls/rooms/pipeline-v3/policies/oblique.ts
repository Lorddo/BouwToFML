import type { ObliquePolicy } from '../engines/policy-types'
import { resolvePipelineScale } from '../engines/scale'

/**
 * Restscheefheid van een scan (na deskew) blijft binnen deze dodezone en wordt
 * dus als H/V behandeld. Een gevel die werkelijk uit lood staat haalt dit ruim:
 * op `schuine-gevel-bg` is de gevel 5,3 graden uit lood.
 */
const OBLIQUE_DEADZONE_DEG = 2.5

/** Hoekspreiding binnen één as — de gevelstukken op laag 3 spreiden ~3 graden. */
const OBLIQUE_ANGLE_TOLERANCE_DEG = 2.5

const OBLIQUE_MIN_MEMBER_COUNT = 3

/** Een hartlijn hoort volledig in de inkt te liggen. */
const OBLIQUE_MIN_IN_INK_RATIO = 0.98

export function resolveObliquePolicy(referenceWallThicknessPx?: number): ObliquePolicy {
  const scale = resolvePipelineScale(referenceWallThicknessPx)
  return {
    layerId: 10,
    deadzoneDeg: OBLIQUE_DEADZONE_DEG,
    angleToleranceDeg: OBLIQUE_ANGLE_TOLERANCE_DEG,
    minMemberLengthPx: scale.obliqueMinMemberLengthPx,
    minMemberCount: OBLIQUE_MIN_MEMBER_COUNT,
    minEvidencePx: scale.obliqueMinEvidencePx,
    maxMemberOffsetPx: scale.obliqueMaxMemberOffsetPx,
    maxRidgeOffsetMedianPx: scale.obliqueRidgeOffsetMedianPx,
    maxRidgeOffsetP90Px: scale.obliqueRidgeOffsetMedianPx * 2,
    minInInkRatio: OBLIQUE_MIN_IN_INK_RATIO,
    captureBandPx: scale.obliqueCaptureBandPx,
    maxAnchorShiftPx: scale.obliqueMaxAnchorShiftPx,
    ridgeMaxSearchPx: scale.obliqueRidgeMaxSearchPx,
    ridgeSampleStepPx: scale.obliqueRidgeSampleStepPx,
  }
}
