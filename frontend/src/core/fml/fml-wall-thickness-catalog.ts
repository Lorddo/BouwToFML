export const FACTORY_THICKNESS_CMS: readonly number[] = [10, 20, 30]

export type ThicknessCatalogLimits = {
  minCm: number
  midCm: number
  maxCm: number
}
export const MIN_THICKNESS_CATALOG = 3
export const MAX_THICKNESS_CATALOG = 8

function isPositiveCm(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function roundCatalogCm(value: number): number {
  return Math.round(value * 10) / 10
}

function uniqueSortedCms(sorted: number[]): number[] {
  const out: number[] = []
  for (const cm of sorted) {
    if (out[out.length - 1] !== cm) out.push(cm)
  }
  return out
}

function padCatalogToMin(cms: number[]): number[] {
  let next = [...cms]
  for (const factory of FACTORY_THICKNESS_CMS) {
    if (next.length >= MIN_THICKNESS_CATALOG) break
    next = uniqueSortedCms([...next, factory].sort((a, b) => a - b))
  }
  let extra = 10
  while (next.length < MIN_THICKNESS_CATALOG && extra <= 200) {
    next = uniqueSortedCms([...next, extra].sort((a, b) => a - b))
    extra += 10
  }
  return next
}

function capCatalogToMax(cms: number[]): number[] {
  if (cms.length <= MAX_THICKNESS_CATALOG) return cms
  const first = cms[0]
  const last = cms[cms.length - 1]
  if (first == null || last == null) return cms.slice(0, MAX_THICKNESS_CATALOG)
  const inner = cms.slice(1, -1)
  const keepInner = MAX_THICKNESS_CATALOG - 2
  if (inner.length <= keepInner) return cms.slice(0, MAX_THICKNESS_CATALOG)
  const picked: number[] = []
  for (let i = 0; i < keepInner; i += 1) {
    const idx = Math.round(((i + 1) * (inner.length + 1)) / (keepInner + 1)) - 1
    const value = inner[Math.min(inner.length - 1, Math.max(0, idx))]
    if (value != null && !picked.includes(value)) picked.push(value)
  }
  return uniqueSortedCms([first, ...picked, last].sort((a, b) => a - b)).slice(
    0,
    MAX_THICKNESS_CATALOG,
  )
}

/**
 * Unieke gesorteerde positieve cm (0,1 afronding), min 3, cap 8.
 * Geen nabij-merge: 8/9/10/11 blijven 4 maten. Leeg/ongeldig → factory.
 */
export function normalizeThicknessCatalog(cms: readonly number[] | null | undefined): number[] {
  const cleaned = uniqueSortedCms(
    (cms ?? [])
      .filter(isPositiveCm)
      .map(roundCatalogCm)
      .sort((a, b) => a - b),
  )
  if (cleaned.length === 0) return [...FACTORY_THICKNESS_CMS]
  return capCatalogToMax(padCatalogToMin(cleaned))
}

export function addThicknessToCatalog(cms: readonly number[], cm: number): number[] {
  if (!isPositiveCm(cm)) return normalizeThicknessCatalog(cms)
  const current = normalizeThicknessCatalog(cms)
  const rounded = roundCatalogCm(cm)
  if (current.includes(rounded)) return current
  if (current.length >= MAX_THICKNESS_CATALOG) return current
  return normalizeThicknessCatalog([...current, rounded])
}

export function removeThicknessFromCatalog(cms: readonly number[], cm: number): number[] {
  const catalog = normalizeThicknessCatalog(cms)
  if (catalog.length <= MIN_THICKNESS_CATALOG) return catalog
  const rounded = roundCatalogCm(cm)
  const next = catalog.filter((value) => value !== rounded)
  if (next.length < MIN_THICKNESS_CATALOG) return catalog
  return normalizeThicknessCatalog(next)
}

/** Vervang één catalogus-slot (dik→dun display houdt dezelfde rij). Unieke-sort na afloop. */
export function replaceThicknessInCatalog(
  cms: readonly number[],
  oldCm: number,
  newCm: number,
): number[] {
  if (!isPositiveCm(newCm)) return normalizeThicknessCatalog(cms)
  const catalog = normalizeThicknessCatalog(cms)
  const roundedOld = roundCatalogCm(oldCm)
  const roundedNew = roundCatalogCm(newCm)
  const idx = catalog.indexOf(roundedOld)
  if (idx < 0) return addThicknessToCatalog(catalog, roundedNew)
  if (roundedOld === roundedNew) return catalog
  const next = [...catalog]
  next[idx] = roundedNew
  return normalizeThicknessCatalog(next)
}

export function classifyThicknessSlot(thicknessCm: number, cms: readonly number[]): number {
  const catalog = normalizeThicknessCatalog(cms)
  if (!isPositiveCm(thicknessCm)) return 0
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < catalog.length; i += 1) {
    const dist = Math.abs(catalog[i] - thicknessCm)
    if (dist < bestDist) {
      best = i
      bestDist = dist
    }
  }
  return best
}

export function nearestCatalogCm(thicknessCm: number, cms: readonly number[]): number {
  const catalog = normalizeThicknessCatalog(cms)
  return (
    catalog[classifyThicknessSlot(thicknessCm, catalog)] ?? catalog[0] ?? FACTORY_THICKNESS_CMS[0]
  )
}

export function catalogFromLegacyLimits(
  limits: Partial<ThicknessCatalogLimits> | null | undefined,
): number[] {
  return normalizeThicknessCatalog([
    Number(limits?.minCm),
    Number(limits?.midCm),
    Number(limits?.maxCm),
  ])
}

export function limitsFromCatalog(cms: readonly number[]): ThicknessCatalogLimits {
  const catalog = normalizeThicknessCatalog(cms)
  const midIndex = Math.floor((catalog.length - 1) / 2)
  return {
    minCm: catalog[0] ?? FACTORY_THICKNESS_CMS[0],
    midCm: catalog[midIndex] ?? FACTORY_THICKNESS_CMS[1],
    maxCm: catalog[catalog.length - 1] ?? FACTORY_THICKNESS_CMS[2],
  }
}

export function catalogMaxCm(cms: readonly number[] | null | undefined): number {
  const catalog = normalizeThicknessCatalog(cms)
  return catalog[catalog.length - 1] ?? FACTORY_THICKNESS_CMS[FACTORY_THICKNESS_CMS.length - 1]
}

export function catalogMinCm(cms: readonly number[] | null | undefined): number {
  const catalog = normalizeThicknessCatalog(cms)
  return catalog[0] ?? FACTORY_THICKNESS_CMS[0]
}

/** Zelfde px→cm als extractionToPlan: px / pxPerMm / 10. */
export function thicknessPxToCm(
  thicknessPx: number,
  pxPerMmX: number,
  pxPerMmY: number,
): number | null {
  if (!(thicknessPx > 0)) return null
  const pxPerMm =
    pxPerMmX > 0 && pxPerMmY > 0 ? (pxPerMmX + pxPerMmY) / 2 : pxPerMmX > 0 ? pxPerMmX : pxPerMmY
  if (!(pxPerMm > 0)) return null
  const cm = thicknessPx / pxPerMm / 10
  return cm > 0 ? roundCatalogCm(cm) : null
}

export function nextUnusedCatalogCm(
  usedCms: readonly number[],
  catalog: readonly number[],
): number {
  const normalized = normalizeThicknessCatalog(catalog)
  const used = new Set(usedCms.filter(isPositiveCm).map(roundCatalogCm))
  for (let i = normalized.length - 1; i >= 0; i -= 1) {
    const candidate = normalized[i]
    if (!used.has(candidate)) return candidate
  }
  return (
    normalized[normalized.length - 1] ?? FACTORY_THICKNESS_CMS[FACTORY_THICKNESS_CMS.length - 1]
  )
}
