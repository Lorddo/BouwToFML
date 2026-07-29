export interface FmlWallThicknessLimits {
  minCm: number
  midCm: number
  maxCm: number
}

export const DEFAULT_FML_WALL_THICKNESS_LIMITS: FmlWallThicknessLimits = {
  minCm: 10,
  midCm: 20,
  maxCm: 30,
}

const STORAGE_KEY = 'bouwToFml.fmlWallThicknessLimits'

function normalizeLimits(
  raw: Partial<FmlWallThicknessLimits> | null | undefined,
): FmlWallThicknessLimits {
  const minRaw = Number(raw?.minCm)
  const midRaw = Number(raw?.midCm)
  const maxRaw = Number(raw?.maxCm)
  const minCm =
    Number.isFinite(minRaw) && minRaw > 0 ? minRaw : DEFAULT_FML_WALL_THICKNESS_LIMITS.minCm
  const midCm =
    Number.isFinite(midRaw) && midRaw > 0 ? midRaw : DEFAULT_FML_WALL_THICKNESS_LIMITS.midCm
  const maxCm =
    Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : DEFAULT_FML_WALL_THICKNESS_LIMITS.maxCm
  return { minCm, midCm, maxCm }
}

export function loadFmlWallThicknessLimits(): FmlWallThicknessLimits {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_FML_WALL_THICKNESS_LIMITS }
    return normalizeLimits(JSON.parse(raw) as Partial<FmlWallThicknessLimits>)
  } catch {
    return { ...DEFAULT_FML_WALL_THICKNESS_LIMITS }
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
  const normalized = normalizeLimits(limits)
  const sorted = [normalized.minCm, normalized.midCm, normalized.maxCm].sort((a, b) => a - b)
  return {
    minCm: sorted[0]!,
    midCm: sorted[1]!,
    maxCm: sorted[2]!,
  }
}

export function clampWallThicknessCm(thicknessCm: number, limits: FmlWallThicknessLimits): number {
  const { minCm, maxCm } = resolveEffectiveFmlWallThicknessLimits(limits)
  if (!Number.isFinite(thicknessCm)) return minCm
  return Math.min(maxCm, Math.max(minCm, thicknessCm))
}
