import type { ObliquePolicy } from '../engines/policy-types'
import { resolvePipelineScale } from '../engines/scale'

/**
 * Restscheefheid van een scan (na deskew) blijft binnen deze dodezone en wordt
 * dus als H/V behandeld. Echte schuine gevels moeten erboven zitten: fixture
 * `schuine-gevel-bg` ~5,3°; milde gevels (sloped ~2,4°) ook. Late FML
 * near-ortho (`NEAR_ORTHO_MAX_DEG` 1,5°) blijft strak ≤ deze dodezone.
 */
const OBLIQUE_DEADZONE_DEG = 1.5

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

/** Exporteer voor L10 straighten / underlay — zelfde dodezone. */
export function obliqueDeadzoneDeg(): number {
  return OBLIQUE_DEADZONE_DEG
}
