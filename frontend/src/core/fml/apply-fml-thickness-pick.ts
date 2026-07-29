import { roundFmlThicknessCm } from './harmonize-fml-wall-thickness'
import type { FmlWallThicknessLimits } from './fml-wall-thickness-limits'
import {
  resolveEffectiveFmlBandBoundaries,
  type FmlThicknessBandBoundaries,
} from './fml-wall-thickness-tiers'

/** Alleen min/max hebben een meetknop; mid is het bereik tussen de grenzen. */
export type FmlThicknessPickTier = 'min' | 'max'

export interface FmlThicknessPickState {
  limits: FmlWallThicknessLimits
  bandBoundaries: FmlThicknessBandBoundaries
}

export interface FmlThicknessPickResult extends FmlThicknessPickState {
  measuredCm: number
}

/**
 * Past alleen bandgrenzen aan na een onderlegger-meting (export min/mid/max blijft ongewijzigd).
 * - min: bovengrens min-band = gemeten × 1.10
 * - max: ondergrens max-band = gemeten × 0.90
 */
export function applyFmlThicknessPick(
  tier: FmlThicknessPickTier,
  measuredCm: number,
  current: FmlThicknessPickState,
): FmlThicknessPickResult {
  const rounded = roundFmlThicknessCm(measuredCm)
  const bandBoundaries = { ...current.bandBoundaries }

  if (tier === 'min') {
    bandBoundaries.midBoundaryCm = roundFmlThicknessCm(rounded * 1.1)
  } else {
    bandBoundaries.maxBoundaryCm = roundFmlThicknessCm(rounded * 0.9)
  }

  return {
    measuredCm: rounded,
    limits: { ...current.limits },
    bandBoundaries: resolveEffectiveFmlBandBoundaries(bandBoundaries),
  }
}
