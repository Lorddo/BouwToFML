import {
  catalogMaxCm,
  nextUnusedCatalogCm,
  normalizeThicknessCatalog,
} from '@/core/plan/wall-thickness-catalog'
import type { ThicknessBand } from '@/core/plan/wall-thickness-tiers'
import type { SelectionRect } from './types'

export const MAX_WALL_REFS = 8

export type WallThicknessBand = ThicknessBand

export type WallRefThicknessMeasure = {
  /** Legacy sessie-tag; nieuwe metingen schrijven thicknessCm. */
  band?: WallThicknessBand
  thicknessPx: number
  /** Catalogus-cm van deze ref (export + max-equivalent). */
  thicknessCm?: number
  rectId?: string
}

export type ReferenceWallThicknessResolution = {
  referenceWallThicknessPx: number
  /** Catalogus-cm van de winnende meting. */
  sourceCm: number
  /** true als de winnende ref dunner is dan catalogus-max (scale-up). */
  usedScaledFallback: boolean
}

export function isWallThicknessBand(value: unknown): value is WallThicknessBand {
  return value === 'min' || value === 'mid' || value === 'max'
}

export function resolveWallThicknessCm(
  rect: Pick<SelectionRect, 'wallThicknessCm'>,
): number | null {
  const cm = Number(rect.wallThicknessCm)
  return Number.isFinite(cm) && cm > 0 ? cm : null
}

/**
 * Reken gemeten px door naar max-equivalent voor pipeline-schaal.
 * refCm === maxCm → identity.
 */
export function scaleMeasuredPxToMax(measuredPx: number, refCm: number, maxCm: number): number {
  if (!(measuredPx > 0)) {
    throw new Error('scaleMeasuredPxToMax vereist een positieve meting in px.')
  }
  if (!(refCm > 0) || !(maxCm > 0)) {
    throw new Error('scaleMeasuredPxToMax vereist positieve catalogus-cm (refCm, maxCm).')
  }
  return measuredPx * (maxCm / refCm)
}

function measureRefCm(measure: WallRefThicknessMeasure, fallbackCm: number): number {
  const cm = Number(measure.thicknessCm)
  return Number.isFinite(cm) && cm > 0 ? cm : fallbackCm
}

/** Max-equivalent px-schatting per meting (max-cm = raw; overige = scale-up). */
export function measureToMaxEquivalentPx(
  measure: WallRefThicknessMeasure,
  catalogCms: readonly number[],
): number {
  const maxCm = catalogMaxCm(catalogCms)
  const refCm = measureRefCm(measure, maxCm)
  if (refCm === maxCm) return measure.thicknessPx
  return scaleMeasuredPxToMax(measure.thicknessPx, refCm, maxCm)
}

/**
 * Pipeline-scalar = hoogste max-equivalent onder alle metingen.
 * Een nette dunnere ref kan een rotte max-crop overtroeven.
 */
export function resolveReferenceWallThicknessPx(params: {
  measures: WallRefThicknessMeasure[]
  catalogCms: readonly number[]
}): number | null {
  return resolveReferenceWallThicknessDetail(params)?.referenceWallThicknessPx ?? null
}

export function resolveReferenceWallThicknessDetail(params: {
  measures: WallRefThicknessMeasure[]
  catalogCms: readonly number[]
}): ReferenceWallThicknessResolution | null {
  const valid = params.measures.filter((m) => m.thicknessPx > 0)
  if (valid.length === 0) return null
  const maxCm = catalogMaxCm(params.catalogCms)

  let best: ReferenceWallThicknessResolution | null = null
  for (const m of valid) {
    const sourceCm = measureRefCm(m, maxCm)
    const scaled = measureToMaxEquivalentPx(m, params.catalogCms)
    if (best == null || scaled > best.referenceWallThicknessPx) {
      best = {
        referenceWallThicknessPx: scaled,
        sourceCm,
        usedScaledFallback: sourceCm !== maxCm,
      }
    }
  }
  return best
}

/** Style-bron: dikste catalogus-cm, anders laatste wall-rect. */
export function resolveStyleWallRect(rects: readonly SelectionRect[]): SelectionRect | null {
  let best: SelectionRect | null = null
  let bestCm = -1
  let last: SelectionRect | null = null
  for (const rect of rects) {
    if (rect.type !== 'wall') continue
    last = rect
    const cm = resolveWallThicknessCm(rect)
    if (cm != null && cm >= bestCm) {
      best = rect
      bestCm = cm
    }
  }
  return best ?? last
}

export function findWallRectForCm(
  rects: readonly SelectionRect[],
  cm: number,
): SelectionRect | null {
  const target = Number(cm)
  if (!(target > 0) || !Number.isFinite(target)) return null
  for (const rect of rects) {
    if (rect.type !== 'wall') continue
    if (resolveWallThicknessCm(rect) === target) return rect
  }
  return null
}

export function bindNextWallRefCm(
  rects: readonly SelectionRect[],
  catalogCms: readonly number[],
): number {
  const used = rects
    .filter((r) => r.type === 'wall')
    .map((r) => resolveWallThicknessCm(r))
    .filter((cm): cm is number => cm != null)
  return nextUnusedCatalogCm(used, catalogCms)
}

/**
 * Enforce ≤8 wall-rects. Nieuwste (laatste in array) blijft; oudste valt weg bij overflow.
 */
export function enforceWallRefLimit(rects: SelectionRect[]): {
  rects: SelectionRect[]
  removedIds: string[]
} {
  const walls = rects.filter((r) => r.type === 'wall')
  if (walls.length === 0) return { rects: [...rects], removedIds: [] }

  const removedIds: string[] = []
  const keptWalls = [...walls]
  while (keptWalls.length > MAX_WALL_REFS) {
    const drop = keptWalls.shift()
    if (drop) removedIds.push(drop.id)
  }

  const keptIds = new Set(keptWalls.map((w) => w.id))
  const next: SelectionRect[] = []
  for (const rect of rects) {
    if (rect.type !== 'wall') {
      next.push(rect)
      continue
    }
    if (!keptIds.has(rect.id)) continue
    next.push(rect)
  }
  return { rects: next, removedIds }
}

export function catalogCmsFromLimits(limits: {
  thicknessCms?: readonly number[]
  minCm: number
  midCm: number
  maxCm: number
}): number[] {
  if (Array.isArray(limits.thicknessCms) && limits.thicknessCms.length > 0) {
    return normalizeThicknessCatalog(limits.thicknessCms)
  }
  return normalizeThicknessCatalog([limits.minCm, limits.midCm, limits.maxCm])
}
