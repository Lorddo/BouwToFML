import {
  FML_BAND_MAX_RATIO,
  FML_BAND_MID_RATIO,
  type FmlThicknessBand,
} from './fml-wall-thickness-tiers'

/** Max bruglengte t.o.v. langste collineaire buur (kozijn). */
export const WALL_CHAIN_BRIDGE_MAX_RATIO = 0.4

/** Max bruglengte in px t.o.v. referentie-muur (zonder schaal). */
const WALL_CHAIN_BRIDGE_MAX_REF_PX_RATIO = 4

/** @lintignore — archive V2 layer-7 thickness import */
export function classifyWallThicknessBandPx(
  thicknessPx: number,
  referenceWallThicknessPx: number,
): FmlThicknessBand {
  const ref = Math.max(referenceWallThicknessPx, 1)
  const midBoundary = ref * FML_BAND_MID_RATIO
  const maxBoundary = ref * FML_BAND_MAX_RATIO
  if (thicknessPx < midBoundary) return 'min'
  if (thicknessPx <= maxBoundary) return 'mid'
  return 'max'
}

/** Zelfde meetband (Thick/Thin) — keten mag doorlopen. */
export function wallThicknessBandsCompatible(
  thicknessA: number,
  thicknessB: number,
  referenceWallThicknessPx: number,
): boolean {
  if (thicknessA <= 0 || thicknessB <= 0) return true
  return (
    classifyWallThicknessBandPx(thicknessA, referenceWallThicknessPx)
    === classifyWallThicknessBandPx(thicknessB, referenceWallThicknessPx)
  )
}

/**
 * Dun tussensegment tussen twee gelijke buitenbanden (muur met kozijn).
 * Thick–Thin–Thick collineair → één keten; Thick–Thin zonder tweede Thick → twee ketens.
 */
export function isWallThicknessBridgeCandidatePx(params: {
  bridgeThicknessPx: number
  neighborThicknessPx: number
  beyondThicknessPx: number
  bridgeLengthPx: number
  neighborLengthPx: number
  referenceWallThicknessPx: number
}): boolean {
  const ref = Math.max(params.referenceWallThicknessPx, 1)
  const bridgeBand = classifyWallThicknessBandPx(params.bridgeThicknessPx, ref)
  const neighborBand = classifyWallThicknessBandPx(params.neighborThicknessPx, ref)
  const beyondBand = classifyWallThicknessBandPx(params.beyondThicknessPx, ref)
  if (neighborBand !== beyondBand) return false
  if (neighborBand === bridgeBand) return false
  if (params.bridgeLengthPx > ref * WALL_CHAIN_BRIDGE_MAX_REF_PX_RATIO) return false
  if (params.bridgeLengthPx > params.neighborLengthPx * WALL_CHAIN_BRIDGE_MAX_RATIO) return false
  return true
}
