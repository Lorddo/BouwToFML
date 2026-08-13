import type { FmlThicknessBand } from '@/core/fml/fml-wall-thickness-tiers'
import {
  resolveEffectiveFmlWallThicknessLimits,
  type FmlWallThicknessLimits,
} from '@/core/fml/fml-wall-thickness-limits'
import type { SelectionRect } from './types'

export const MAX_WALL_REFS = 3

export type WallThicknessBand = FmlThicknessBand

export type WallRefThicknessMeasure = {
  band: WallThicknessBand
  thicknessPx: number
  rectId?: string
}

export type ReferenceWallThicknessResolution = {
  referenceWallThicknessPx: number
  /** Band waarvan de winnende schatting kwam. */
  sourceBand: WallThicknessBand
  /** true als max-tag onder de doorgerekende mid/min lag (gearceerde gevel e.d.). */
  usedScaledFallback: boolean
}

export function isWallThicknessBand(value: unknown): value is WallThicknessBand {
  return value === 'min' || value === 'mid' || value === 'max'
}

/** Default eerste muur → max (handig; niet verplicht). */
export function resolveWallThicknessBand(
  rect: Pick<SelectionRect, 'wallThicknessBand'>,
  fallback: WallThicknessBand = 'max',
): WallThicknessBand {
  return isWallThicknessBand(rect.wallThicknessBand) ? rect.wallThicknessBand : fallback
}

export function bandCmFor(band: WallThicknessBand, limits: FmlWallThicknessLimits): number {
  const effective = resolveEffectiveFmlWallThicknessLimits(limits)
  if (band === 'min') return effective.minCm
  if (band === 'mid') return effective.midCm
  return effective.maxCm
}

/**
 * Reken gemeten band-px door naar max-equivalent px voor pipeline-schaal.
 * bandCm === maxCm → identity.
 */
export function scaleMeasuredPxToMax(measuredPx: number, bandCm: number, maxCm: number): number {
  if (!(measuredPx > 0)) {
    throw new Error('scaleMeasuredPxToMax vereist een positieve meting in px.')
  }
  if (!(bandCm > 0) || !(maxCm > 0)) {
    throw new Error('scaleMeasuredPxToMax vereist positieve project-diktes (bandCm, maxCm).')
  }
  return measuredPx * (maxCm / bandCm)
}

/** Max-equivalent px-schatting per meting (max-band = raw; overige = scale-up). */
export function measureToMaxEquivalentPx(
  measure: WallRefThicknessMeasure,
  limits: FmlWallThicknessLimits,
): number {
  const effective = resolveEffectiveFmlWallThicknessLimits(limits)
  if (measure.band === 'max') return measure.thicknessPx
  return scaleMeasuredPxToMax(
    measure.thicknessPx,
    bandCmFor(measure.band, effective),
    effective.maxCm,
  )
}

/**
 * Pipeline-scalar = hoogste max-equivalent onder alle metingen.
 * Zo wint een solide mid-ref boven een te lage max-meting (gearceerde spouw/gevel).
 */
export function resolveReferenceWallThicknessPx(params: {
  measures: WallRefThicknessMeasure[]
  limits: FmlWallThicknessLimits
}): number | null {
  return resolveReferenceWallThicknessDetail(params)?.referenceWallThicknessPx ?? null
}

export function resolveReferenceWallThicknessDetail(params: {
  measures: WallRefThicknessMeasure[]
  limits: FmlWallThicknessLimits
}): ReferenceWallThicknessResolution | null {
  const valid = params.measures.filter((m) => m.thicknessPx > 0)
  if (valid.length === 0) return null

  let best: ReferenceWallThicknessResolution | null = null
  for (const m of valid) {
    const scaled = measureToMaxEquivalentPx(m, params.limits)
    if (best == null || scaled > best.referenceWallThicknessPx) {
      best = {
        referenceWallThicknessPx: scaled,
        sourceBand: m.band,
        usedScaledFallback: m.band !== 'max',
      }
    }
  }
  return best
}

export function findWallRectForBand(
  rects: readonly SelectionRect[],
  band: WallThicknessBand,
): SelectionRect | null {
  for (let i = rects.length - 1; i >= 0; i--) {
    const rect = rects[i]
    if (rect.type !== 'wall') continue
    if (resolveWallThicknessBand(rect) === band) return rect
  }
  return null
}

/**
 * Zet band op een bestaande muur-ref.
 * Als de doelband al bezet is: **swap** met die ref (geen delete).
 */
export function assignWallThicknessBand(
  rects: SelectionRect[],
  id: string,
  band: WallThicknessBand,
): SelectionRect[] {
  const idx = rects.findIndex((r) => r.id === id)
  if (idx < 0) return rects
  const current = rects[idx]
  if (current.type !== 'wall') return rects
  const oldBand = resolveWallThicknessBand(current)
  if (oldBand === band) {
    const next = [...rects]
    next[idx] = { ...current, wallThicknessBand: band }
    return next
  }

  const otherIdx = rects.findIndex(
    (r, i) => i !== idx && r.type === 'wall' && resolveWallThicknessBand(r) === band,
  )
  const next = [...rects]
  if (otherIdx >= 0) {
    // Swap: voorkomt dat enforceWallRefLimit de andere ref wist.
    next[otherIdx] = { ...next[otherIdx], wallThicknessBand: oldBand }
  }
  next[idx] = { ...current, wallThicknessBand: band }
  return next
}

/** Style-bron: max-rect indien aanwezig, anders laatste wall-rect. */
export function resolveStyleWallRect(rects: readonly SelectionRect[]): SelectionRect | null {
  const maxRect = findWallRectForBand(rects, 'max')
  if (maxRect) return maxRect
  for (let i = rects.length - 1; i >= 0; i--) {
    if (rects[i].type === 'wall') return rects[i]
  }
  return null
}

export function wallThicknessBandOptions(
  limits: FmlWallThicknessLimits,
): Array<{ band: WallThicknessBand; cm: number; label: string }> {
  const effective = resolveEffectiveFmlWallThicknessLimits(limits)
  return (
    [
      { band: 'min' as const, cm: effective.minCm },
      { band: 'mid' as const, cm: effective.midCm },
      { band: 'max' as const, cm: effective.maxCm },
    ] as const
  ).map((row) => ({
    ...row,
    label: `${row.cm} cm`,
  }))
}

/**
 * Enforce ≤3 wall-rects + unieke band.
 * Nieuwste rect (laatste in array) wint bij band-conflict; oudste wall zonder plek valt weg bij overflow.
 */
export function enforceWallRefLimit(rects: SelectionRect[]): {
  rects: SelectionRect[]
  removedIds: string[]
} {
  const walls = rects.filter((r) => r.type === 'wall')
  if (walls.length === 0) return { rects: [...rects], removedIds: [] }

  const removedIds: string[] = []
  const keptByBand = new Map<WallThicknessBand, SelectionRect>()

  // Newest last wins band uniqueness.
  for (const wall of walls) {
    const band = resolveWallThicknessBand(wall)
    const prev = keptByBand.get(band)
    if (prev) removedIds.push(prev.id)
    keptByBand.set(band, { ...wall, wallThicknessBand: band })
  }

  const keptWalls = Array.from(keptByBand.values())
  const orderIndex = new Map(walls.map((w, i) => [w.id, i]))
  keptWalls.sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0))

  while (keptWalls.length > MAX_WALL_REFS) {
    const drop = keptWalls.shift()
    if (drop) removedIds.push(drop.id)
  }

  const keptIds = new Set(keptWalls.map((w) => w.id))
  const wallById = new Map(keptWalls.map((w) => [w.id, w]))
  const next: SelectionRect[] = []
  for (const rect of rects) {
    if (rect.type !== 'wall') {
      next.push(rect)
      continue
    }
    if (!keptIds.has(rect.id)) continue
    next.push(wallById.get(rect.id) ?? rect)
  }
  return { rects: next, removedIds }
}
