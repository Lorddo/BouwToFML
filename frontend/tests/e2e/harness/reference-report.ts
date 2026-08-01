import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import type { FloorPlan, OpeningType, Wall } from '@/core/fml/types'
import {
  collectOpeningSites,
  countMatchedOpenings,
  coveredLengthCm,
  totalWallLengthCm,
  translateWallsToOrigin,
  REFERENCE_MATCH_DIST_CM,
} from './plan-metrics'
import { fixtureDir } from './load-fixture'

export type ReferenceMetrics = {
  /** Dekking: aandeel ref-lengte binnen match-afstand van detectie. */
  wallCoveragePct: number
  /** Precisie: aandeel detectie-lengte binnen match-afstand van ref. */
  wallPrecisionPct: number
  openingRecall: {
    door: number
    window: number
    overall: number
  }
  referenceWallCount: number
  referenceLengthCm: number
  referenceDoorCount: number
  referenceWindowCount: number
  filteredZeroThickness: number
  matchDistCm: number
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function pct(numerator: number, denominator: number): number {
  if (!(denominator > 0)) return 0
  return round1((100 * numerator) / denominator)
}

/** Filter thickness≤0 (klant-FML artefact); dicteer niet als fout. */
export function filterPositiveThicknessWalls(walls: Wall[]): {
  walls: Wall[]
  filteredZeroThickness: number
} {
  const kept: Wall[] = []
  let filteredZeroThickness = 0
  for (const wall of walls) {
    if (!(wall.thickness > 0)) {
      filteredZeroThickness += 1
      continue
    }
    kept.push(wall)
  }
  return { walls: kept, filteredZeroThickness }
}

function countOpeningsByType(walls: Wall[]): Record<OpeningType, number> {
  const counts: Record<OpeningType, number> = { door: 0, window: 0 }
  for (const wall of walls) {
    for (const opening of wall.openings) counts[opening.type] += 1
  }
  return counts
}

/**
 * Referentie-FML: alleen `fixtures/<slug>/reference.fml` (handgemaakt, één verdieping).
 * Detectie-exports horen in `snapshot/detected.fml` en tellen níet mee.
 */
export function resolveReferenceFmlPath(slug: string): string | null {
  const preferred = join(fixtureDir(slug), 'reference.fml')
  return existsSync(preferred) ? preferred : null
}

export function loadReferencePlan(slug: string): {
  plan: FloorPlan
  path: string
} {
  const path = resolveReferenceFmlPath(slug)
  if (!path) {
    throw new Error(
      `Geen referentie-FML voor ${slug}. Plaats reference.fml (één verdieping, handwerk) in fixtures/${slug}/.`,
    )
  }
  const raw = readFileSync(path, 'utf8')
  const { plan } = importFmlV3(raw)
  return { plan, path }
}

export function computeReferenceMetrics(params: {
  detected: FloorPlan
  reference: FloorPlan
  matchDistCm?: number
}): ReferenceMetrics {
  const matchDistCm = params.matchDistCm ?? REFERENCE_MATCH_DIST_CM
  const refFloor = params.reference.floors[0]
  const detFloor = params.detected.floors[0]
  const refRaw = refFloor?.walls ?? []
  const detRaw = detFloor?.walls ?? []

  const { walls: refWalls, filteredZeroThickness } = filterPositiveThicknessWalls(refRaw)
  const detWalls = translateWallsToOrigin(detRaw)
  const alignedRef = translateWallsToOrigin(refWalls)

  const referenceLengthCm = totalWallLengthCm(alignedRef)
  const detectedLengthCm = totalWallLengthCm(detWalls)
  const coveredRef = coveredLengthCm(alignedRef, detWalls, matchDistCm)
  const coveredDet = coveredLengthCm(detWalls, alignedRef, matchDistCm)

  const refSites = collectOpeningSites(alignedRef)
  const detSites = collectOpeningSites(detWalls)
  const matched = countMatchedOpenings(refSites, detSites, matchDistCm)
  const refCounts = countOpeningsByType(alignedRef)

  return {
    wallCoveragePct: pct(coveredRef, referenceLengthCm),
    wallPrecisionPct: pct(coveredDet, detectedLengthCm),
    openingRecall: {
      door: pct(matched.byType.door, refCounts.door),
      window: pct(matched.byType.window, refCounts.window),
      overall: pct(matched.matched, refSites.length),
    },
    referenceWallCount: alignedRef.length,
    referenceLengthCm: round1(referenceLengthCm),
    referenceDoorCount: refCounts.door,
    referenceWindowCount: refCounts.window,
    filteredZeroThickness,
    matchDistCm,
  }
}

/** Grove vloer: lengte binnen ±25% van referentie. */
export function assertLengthWithinQuarter(
  detectedLengthCm: number,
  referenceLengthCm: number,
): { ok: boolean; ratio: number } {
  if (!(referenceLengthCm > 0)) return { ok: false, ratio: 0 }
  const ratio = detectedLengthCm / referenceLengthCm
  return { ok: ratio >= 0.75 && ratio <= 1.25, ratio }
}
