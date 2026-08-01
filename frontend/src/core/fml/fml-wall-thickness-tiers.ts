import { tally } from '@/core/diagnostics'

const FML_BAND_MID_BOUNDARY_CM = 12
const FML_BAND_MAX_BOUNDARY_CM = 23

/** Ondergrens mid-band t.o.v. referentie-muur (dikste): min &lt; 40%. */
export const FML_BAND_MID_RATIO = 0.4
/** Bovengrens mid-band t.o.v. referentie-muur: mid t/m 80%, max &gt; 80%. */
export const FML_BAND_MAX_RATIO = 0.8

export type FmlThicknessBand = 'min' | 'mid' | 'max'

export interface FmlThicknessBandBoundaries {
  midBoundaryCm: number
  maxBoundaryCm: number
}

export const DEFAULT_FML_BAND_BOUNDARIES: FmlThicknessBandBoundaries = {
  midBoundaryCm: FML_BAND_MID_BOUNDARY_CM,
  maxBoundaryCm: FML_BAND_MAX_BOUNDARY_CM,
}

const STORAGE_KEY = 'bouwToFml.fmlThicknessBandBoundaries'

function normalizeBoundaries(
  raw: Partial<FmlThicknessBandBoundaries> | null | undefined,
): FmlThicknessBandBoundaries {
  const midRaw = Number(raw?.midBoundaryCm)
  const maxRaw = Number(raw?.maxBoundaryCm)
  return resolveEffectiveFmlBandBoundaries({
    midBoundaryCm:
      Number.isFinite(midRaw) && midRaw > 0 ? midRaw : DEFAULT_FML_BAND_BOUNDARIES.midBoundaryCm,
    maxBoundaryCm:
      Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : DEFAULT_FML_BAND_BOUNDARIES.maxBoundaryCm,
  })
}

export function resolveEffectiveFmlBandBoundaries(
  boundaries: FmlThicknessBandBoundaries,
): FmlThicknessBandBoundaries {
  const midBoundaryCm = boundaries.midBoundaryCm
  const maxBoundaryCm = boundaries.maxBoundaryCm
  const mid = Math.min(midBoundaryCm, maxBoundaryCm)
  const max = Math.max(midBoundaryCm, maxBoundaryCm)
  return { midBoundaryCm: mid, maxBoundaryCm: max }
}

export function loadFmlThicknessBandBoundaries(): FmlThicknessBandBoundaries {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_FML_BAND_BOUNDARIES }
    return normalizeBoundaries(JSON.parse(raw) as Partial<FmlThicknessBandBoundaries>)
  } catch {
    return { ...DEFAULT_FML_BAND_BOUNDARIES }
  }
}

export function saveFmlThicknessBandBoundaries(boundaries: FmlThicknessBandBoundaries): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resolveEffectiveFmlBandBoundaries(boundaries)))
  } catch {
    /* localStorage unavailable */
  }
}

export function classifyFmlThicknessBand(
  thicknessCm: number,
  boundaries: FmlThicknessBandBoundaries = DEFAULT_FML_BAND_BOUNDARIES,
): FmlThicknessBand {
  const effective = resolveEffectiveFmlBandBoundaries(boundaries)
  if (!Number.isFinite(thicknessCm)) return 'min'
  if (thicknessCm < effective.midBoundaryCm) return 'min'
  if (thicknessCm <= effective.maxBoundaryCm) return 'mid'
  return 'max'
}

function averagePxPerMm(pxPerMmX: number, pxPerMmY: number): number {
  if (pxPerMmX > 0 && pxPerMmY > 0) return (pxPerMmX + pxPerMmY) / 2
  return pxPerMmX > 0 ? pxPerMmX : pxPerMmY
}

function roundBoundaryCm(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FML_BAND_BOUNDARIES.midBoundaryCm
  return Math.round(value * 10) / 10
}

/**
 * Leidt meetbandgrenzen (cm) af uit referentie-muur in px + schaal.
 * min &lt; 40% ref · mid 40–80% · max &gt; 80%.
 * Ongeldige ref/schaal → hard fail (geen stille 12/23 default; ESC:REF-14).
 */
export function deriveFmlBandBoundariesCmFromRefPx(
  referenceWallThicknessPx: number,
  pxPerMmX: number,
  pxPerMmY: number,
  ratios: { midRatio?: number; maxRatio?: number } = {},
): FmlThicknessBandBoundaries {
  // ESC:REF-14 (E) — stille default weg 2026-08-01; zonder meting geen banden.
  const pxPerMm = averagePxPerMm(pxPerMmX, pxPerMmY)
  if (referenceWallThicknessPx <= 0 || pxPerMm <= 0) {
    tally('REF-14', 'rejected')
    throw new Error(
      'Diktebanden vereisen een geldige muur-referentie en schaal (pixels per millimeter).',
    )
  }
  tally('REF-14', 'from_ref_px')
  const refCm = referenceWallThicknessPx / pxPerMm / 10
  const midRatio = ratios.midRatio ?? FML_BAND_MID_RATIO
  const maxRatio = ratios.maxRatio ?? FML_BAND_MAX_RATIO
  return resolveEffectiveFmlBandBoundaries({
    midBoundaryCm: roundBoundaryCm(refCm * midRatio),
    maxBoundaryCm: roundBoundaryCm(refCm * maxRatio),
  })
}
