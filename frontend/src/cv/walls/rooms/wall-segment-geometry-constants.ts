/** Shared segment-geometry constants (V2 pipeline + thickness). Fallback-waarden = ref 30. */

const ORTHO_REF_FALLBACK_PX = 30

/** Ortho-band: 0.3 × ref (was vaste 8). */
function resolveOrthoBandPx(referenceWallThicknessPx?: number): number {
  const ref =
    referenceWallThicknessPx && referenceWallThicknessPx > 0
      ? referenceWallThicknessPx
      : ORTHO_REF_FALLBACK_PX
  return Math.max(1, Math.round(ref * 0.3))
}

/** Collinear offset: 0.1 × ref (was vaste 2). */
function resolveOrthoCollinearMaxOffsetPx(referenceWallThicknessPx?: number): number {
  const ref =
    referenceWallThicknessPx && referenceWallThicknessPx > 0
      ? referenceWallThicknessPx
      : ORTHO_REF_FALLBACK_PX
  return Math.max(0.5, ref * 0.1)
}

/** @deprecated Prefer resolveOrthoBandPx(ref). Default = ref 30. */
const ORTHO_BAND_PX = resolveOrthoBandPx()
export const ORTHO_TOLERANCE_DEG = 8
/** @deprecated Prefer resolveOrthoCollinearMaxOffsetPx(ref). Default = ref 30. */
const ORTHO_COLLINEAR_MAX_OFFSET_PX = resolveOrthoCollinearMaxOffsetPx()
export const MIN_INK_SUPPORT_KEEP_PX = 0.5
export const JUNCTION_DIRECTION_BIN_DEG = 15
