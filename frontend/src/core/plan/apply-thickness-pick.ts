import { roundThicknessCm } from './harmonize-wall-thickness'
import type { WallThicknessLimits } from './wall-thickness-limits'
import {
  resolveEffectiveBandBoundaries,
  type ThicknessBandBoundaries,
} from './wall-thickness-tiers'

/** Alleen min/max hebben een meetknop; mid is het bereik tussen de grenzen. */
export type ThicknessPickTier = 'min' | 'max'

export interface ThicknessPickState {
  limits: WallThicknessLimits
  bandBoundaries: ThicknessBandBoundaries
}

export interface ThicknessPickResult extends ThicknessPickState {
  measuredCm: number
}

/**
 * Past alleen bandgrenzen aan na een onderlegger-meting (export min/mid/max blijft ongewijzigd).
 * - min: bovengrens min-band = gemeten × 1.10
 * - max: ondergrens max-band = gemeten × 0.90
 */
export function applyThicknessPick(
  tier: ThicknessPickTier,
  measuredCm: number,
  current: ThicknessPickState,
): ThicknessPickResult {
  const rounded = roundThicknessCm(measuredCm)
  const bandBoundaries = { ...current.bandBoundaries }

  if (tier === 'min') {
    bandBoundaries.midBoundaryCm = roundThicknessCm(rounded * 1.1)
  } else {
    bandBoundaries.maxBoundaryCm = roundThicknessCm(rounded * 0.9)
  }

  return {
    measuredCm: rounded,
    limits: { ...current.limits },
    bandBoundaries: resolveEffectiveBandBoundaries(bandBoundaries),
  }
}
