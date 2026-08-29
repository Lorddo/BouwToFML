import {
  catalogFromLegacyLimits,
  FACTORY_THICKNESS_CMS,
  limitsFromCatalog,
  normalizeThicknessCatalog,
} from './fml-wall-thickness-catalog'

export interface FmlWallThicknessLimits {
  minCm: number
  midCm: number
  maxCm: number
  /** Broncatalogus (min 3, tot 8). Ontbreekt → [min, mid, max]. */
  thicknessCms?: number[]
}

export const DEFAULT_FML_WALL_THICKNESS_LIMITS: FmlWallThicknessLimits = {
  minCm: FACTORY_THICKNESS_CMS[0],
  midCm: FACTORY_THICKNESS_CMS[1],
  maxCm: FACTORY_THICKNESS_CMS[2],
  thicknessCms: [...FACTORY_THICKNESS_CMS],
}

const STORAGE_KEY = 'bouwToFml.fmlWallThicknessLimits'

function catalogOf(raw: Partial<FmlWallThicknessLimits> | null | undefined): number[] {
  if (Array.isArray(raw?.thicknessCms) && raw.thicknessCms.length > 0) {
    return normalizeThicknessCatalog(raw.thicknessCms)
  }
  return catalogFromLegacyLimits(raw)
}

function normalizeLimits(
  raw: Partial<FmlWallThicknessLimits> | null | undefined,
): FmlWallThicknessLimits {
  const thicknessCms = catalogOf(raw)
  const limits = limitsFromCatalog(thicknessCms)
  return { ...limits, thicknessCms }
}

export function loadFmlWallThicknessLimits(): FmlWallThicknessLimits {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return { ...DEFAULT_FML_WALL_THICKNESS_LIMITS, thicknessCms: [...FACTORY_THICKNESS_CMS] }
    return normalizeLimits(JSON.parse(raw) as Partial<FmlWallThicknessLimits>)
  } catch {
    return { ...DEFAULT_FML_WALL_THICKNESS_LIMITS, thicknessCms: [...FACTORY_THICKNESS_CMS] }
  }
}

export function saveFmlWallThicknessLimits(limits: FmlWallThicknessLimits): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeLimits(limits)))
  } catch {
    /* localStorage unavailable */
  }
}

export function resolveEffectiveFmlWallThicknessLimits(
  limits: FmlWallThicknessLimits,
): FmlWallThicknessLimits {
  return normalizeLimits(limits)
}

export function clampWallThicknessCm(thicknessCm: number, limits: FmlWallThicknessLimits): number {
  const { minCm, maxCm } = resolveEffectiveFmlWallThicknessLimits(limits)
  if (!Number.isFinite(thicknessCm)) return minCm
  return Math.min(maxCm, Math.max(minCm, thicknessCm))
}
