import {
  THICKNESS_BAND_MAX_RATIO,
  THICKNESS_BAND_MID_RATIO,
  type ThicknessBand,
} from './wall-thickness-tiers'

/** Max bruglengte t.o.v. langste collineaire buur (kozijn). */
export const WALL_CHAIN_BRIDGE_MAX_RATIO = 0.4

/** Max bruglengte in px t.o.v. referentie-muur (zonder schaal). */
const WALL_CHAIN_BRIDGE_MAX_REF_PX_RATIO = 4

export type WallThicknessBandBoundariesPx = {
  midBoundaryPx: number
  maxBoundaryPx: number
}

function resolveBandBoundariesPx(
  referenceWallThicknessPx: number,
  absolute?: WallThicknessBandBoundariesPx | null,
): WallThicknessBandBoundariesPx {
  if (absolute && absolute.midBoundaryPx > 0 && absolute.maxBoundaryPx > 0) {
    const mid = Math.min(absolute.midBoundaryPx, absolute.maxBoundaryPx)
    const max = Math.max(absolute.midBoundaryPx, absolute.maxBoundaryPx)
    return { midBoundaryPx: mid, maxBoundaryPx: max }
  }
  const ref = Math.max(referenceWallThicknessPx, 1)
  return {
    midBoundaryPx: ref * THICKNESS_BAND_MID_RATIO,
    maxBoundaryPx: ref * THICKNESS_BAND_MAX_RATIO,
  }
}

/** Historisch geëxporteerd voor de archive V2 layer-7-import; wordt hier zelf gebruikt. */
export function classifyWallThicknessBandPx(
  thicknessPx: number,
  referenceWallThicknessPx: number,
  absoluteBoundaries?: WallThicknessBandBoundariesPx | null,
): ThicknessBand {
  const { midBoundaryPx, maxBoundaryPx } = resolveBandBoundariesPx(
    referenceWallThicknessPx,
    absoluteBoundaries,
  )
  if (thicknessPx < midBoundaryPx) return 'min'
  if (thicknessPx <= maxBoundaryPx) return 'mid'
  return 'max'
}

/** Zelfde meetband (Thick/Thin) — keten mag doorlopen. */
export function wallThicknessBandsCompatible(
  thicknessA: number,
  thicknessB: number,
  referenceWallThicknessPx: number,
  absoluteBoundaries?: WallThicknessBandBoundariesPx | null,
): boolean {
  if (thicknessA <= 0 || thicknessB <= 0) return true
  return (
    classifyWallThicknessBandPx(thicknessA, referenceWallThicknessPx, absoluteBoundaries) ===
    classifyWallThicknessBandPx(thicknessB, referenceWallThicknessPx, absoluteBoundaries)
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
  absoluteBoundaries?: WallThicknessBandBoundariesPx | null
}): boolean {
  const ref = Math.max(params.referenceWallThicknessPx, 1)
  const bounds = params.absoluteBoundaries
  const bridgeBand = classifyWallThicknessBandPx(params.bridgeThicknessPx, ref, bounds)
  const neighborBand = classifyWallThicknessBandPx(params.neighborThicknessPx, ref, bounds)
  const beyondBand = classifyWallThicknessBandPx(params.beyondThicknessPx, ref, bounds)
  if (neighborBand !== beyondBand) return false
  if (neighborBand === bridgeBand) return false
  if (params.bridgeLengthPx > ref * WALL_CHAIN_BRIDGE_MAX_REF_PX_RATIO) return false
  if (params.bridgeLengthPx > params.neighborLengthPx * WALL_CHAIN_BRIDGE_MAX_RATIO) return false
  return true
}
