import {
  catalogFromLegacyLimits,
  FACTORY_THICKNESS_CMS,
  limitsFromCatalog,
  normalizeThicknessCatalog,
} from './wall-thickness-catalog'

export interface WallThicknessLimits {
  minCm: number
  midCm: number
  maxCm: number
  /** Broncatalogus (min 3, tot 8). Ontbreekt → [min, mid, max]. */
  thicknessCms?: number[]
}

export const DEFAULT_WALL_THICKNESS_LIMITS: WallThicknessLimits = {
  minCm: FACTORY_THICKNESS_CMS[0],
  midCm: FACTORY_THICKNESS_CMS[1],
  maxCm: FACTORY_THICKNESS_CMS[2],
  thicknessCms: [...FACTORY_THICKNESS_CMS],
}

const STORAGE_KEY = 'bouwToFml.wallThicknessLimits'

function catalogOf(raw: Partial<WallThicknessLimits> | null | undefined): number[] {
  if (Array.isArray(raw?.thicknessCms) && raw.thicknessCms.length > 0) {
    return normalizeThicknessCatalog(raw.thicknessCms)
  }
  return catalogFromLegacyLimits(raw)
}

function normalizeLimits(
  raw: Partial<WallThicknessLimits> | null | undefined,
): WallThicknessLimits {
  const thicknessCms = catalogOf(raw)
  const limits = limitsFromCatalog(thicknessCms)
  return { ...limits, thicknessCms }
}

export function loadWallThicknessLimits(): WallThicknessLimits {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return { ...DEFAULT_WALL_THICKNESS_LIMITS, thicknessCms: [...FACTORY_THICKNESS_CMS] }
    return normalizeLimits(JSON.parse(raw) as Partial<WallThicknessLimits>)
  } catch {
    return { ...DEFAULT_WALL_THICKNESS_LIMITS, thicknessCms: [...FACTORY_THICKNESS_CMS] }
  }
}

export function saveWallThicknessLimits(limits: WallThicknessLimits): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeLimits(limits)))
  } catch {
    /* localStorage unavailable */
  }
}

export function resolveEffectiveWallThicknessLimits(
  limits: WallThicknessLimits,
): WallThicknessLimits {
  return normalizeLimits(limits)
}

export function clampWallThicknessCm(thicknessCm: number, limits: WallThicknessLimits): number {
  const { minCm, maxCm } = resolveEffectiveWallThicknessLimits(limits)
  if (!Number.isFinite(thicknessCm)) return minCm
  return Math.min(maxCm, Math.max(minCm, thicknessCm))
}
