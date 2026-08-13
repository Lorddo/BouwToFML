import type { FloorPlan, Wall } from '@/core/fml/types'
import {
  coveredLengthCm,
  maxDistToWallsCm,
  totalWallLengthCm,
  translateWallsToOrigin,
  wallLengthCm,
} from './plan-metrics'

/** Onder deze afwijking is een muur gewoon H/V met afrondingsruis. */
export const OBLIQUE_MIN_OFF_AXIS_DEG = 1

/**
 * Strakke match-afstand. `REFERENCE_MATCH_DIST_CM` (20) is te ruim: een H/V-trap
 * langs een schuine gevel blijft daar volledig binnen en scoort 100% dekking.
 */
export const OBLIQUE_TIGHT_MATCH_DIST_CM = 5

/** Hoek t.o.v. de dichtstbijzijnde as (0 of 90), in graden. */
export function wallOffAxisDeg(wall: Wall): number {
  const raw = (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI
  const deg = ((raw % 180) + 180) % 180
  return Math.min(deg, Math.abs(deg - 90), 180 - deg)
}

export function selectObliqueWalls(walls: Wall[], minOffAxisDeg: number): Wall[] {
  return walls.filter((wall) => wallOffAxisDeg(wall) > minOffAxisDeg)
}

export type ObliqueSideReport = {
  wallCount: number
  lengthCm: number
  offAxisDeg: number[]
}

export type ObliqueReport = {
  minOffAxisDeg: number
  tightMatchDistCm: number
  reference: ObliqueSideReport
  detected: ObliqueSideReport
  /** Schuine detectielengte gedeeld door schuine referentielengte. */
  lengthRatio: number
  /** Dekking van de schuine referentiemuren binnen `tightMatchDistCm`. */
  referenceObliqueCoveragePct: number
  /** Idem voor álle referentiemuren — context bij de schuine score. */
  referenceAllCoveragePct: number
  /** Grootste afstand van een detectiepunt tot de referentie. */
  maxDeviationCm: number
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function pct(numerator: number, denominator: number): number {
  if (!(denominator > 0)) return 0
  return round1((100 * numerator) / denominator)
}

function sideReport(walls: Wall[], minOffAxisDeg: number): ObliqueSideReport {
  const oblique = selectObliqueWalls(walls, minOffAxisDeg)
  return {
    wallCount: oblique.length,
    lengthCm: round1(oblique.reduce((sum, wall) => sum + wallLengthCm(wall), 0)),
    offAxisDeg: oblique.map((wall) => round1(wallOffAxisDeg(wall))).sort((a, b) => a - b),
  }
}

/**
 * Meet of schuine muren als schuine muren uit de pipeline komen, of als H/V-trap.
 * Los van `computeReferenceMetrics`: dat rekent op 20 cm en is blind voor trapjes.
 */
export function computeObliqueReport(params: {
  detected: FloorPlan
  reference: FloorPlan
  minOffAxisDeg?: number
  tightMatchDistCm?: number
}): ObliqueReport {
  const minOffAxisDeg = params.minOffAxisDeg ?? OBLIQUE_MIN_OFF_AXIS_DEG
  const tightMatchDistCm = params.tightMatchDistCm ?? OBLIQUE_TIGHT_MATCH_DIST_CM

  const referenceWalls = translateWallsToOrigin(
    (params.reference.floors[0]?.walls ?? []).filter((wall) => wall.thickness > 0),
  )
  const detectedWalls = translateWallsToOrigin(params.detected.floors[0]?.walls ?? [])
  const referenceOblique = selectObliqueWalls(referenceWalls, minOffAxisDeg)

  const reference = sideReport(referenceWalls, minOffAxisDeg)
  const detected = sideReport(detectedWalls, minOffAxisDeg)

  return {
    minOffAxisDeg,
    tightMatchDistCm,
    reference,
    detected,
    lengthRatio: reference.lengthCm > 0 ? round1(detected.lengthCm / reference.lengthCm) : 0,
    referenceObliqueCoveragePct: pct(
      coveredLengthCm(referenceOblique, detectedWalls, tightMatchDistCm),
      totalWallLengthCm(referenceOblique),
    ),
    referenceAllCoveragePct: pct(
      coveredLengthCm(referenceWalls, detectedWalls, tightMatchDistCm),
      totalWallLengthCm(referenceWalls),
    ),
    maxDeviationCm: round1(maxDistToWallsCm(detectedWalls, referenceWalls)),
  }
}
