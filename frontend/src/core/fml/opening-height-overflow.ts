import {
  BOVENLICHT_GAP_CM,
  BOVENLICHT_HEIGHT_CM,
  resolveBovenlichtGapCm,
  resolveBovenlichtHeightCm,
  resolveDoorBovenlicht,
  resolveWindowBovenlicht,
} from './bovenlicht'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
} from './extraction-to-plan-types'
import type { Floor, Opening } from './types'
import { wallElevationAtT } from './wall-endpoint-height'

/** Float-marge: 255 vs 254.999 telt niet als overflow. */
export const OPENING_HEIGHT_OVERFLOW_EPS_CM = 0.5

export type OpeningHeightOverflowKind = 'door' | 'window' | 'bovenlicht'
export type OpeningHeightOverflowSide = 'above' | 'below'

export interface OpeningHeightOverflow {
  kind: OpeningHeightOverflowKind
  side: OpeningHeightOverflowSide
  topCm: number
  /** Muurtop (`az`/`bz`.h) of muurbodem bij `below` — niet `floor.height`. */
  floorHeightCm: number
  guid?: string
}

export interface OpeningHeightOverflowSummary {
  doors: number
  windows: number
  bovenlichten: number
  below: number
  floorHeightCm: number
  maxTopCm: number
  minSillCm: number
  wallBottomCm: number
}

export interface FindOpeningHeightOverflowOptions {
  doorBovenlichtDefault?: boolean
  windowBovenlichtDefault?: boolean
  bovenlichtHeightCm?: number
  bovenlichtGapCm?: number
}

function openingSillCm(opening: Opening): number {
  return opening.z != null && Number.isFinite(opening.z) ? opening.z : 0
}

function openingTopCm(opening: Opening): number {
  const sill = openingSillCm(opening)
  const height =
    opening.z_height != null && Number.isFinite(opening.z_height)
      ? opening.z_height
      : opening.type === 'window'
        ? DEFAULT_FML_WINDOW_HEIGHT_CM
        : DEFAULT_FML_DOOR_HEIGHT_CM
  return sill + height
}

function exceedsTop(topCm: number, wallTopCm: number): boolean {
  return topCm > wallTopCm + OPENING_HEIGHT_OVERFLOW_EPS_CM
}

function belowBottom(sillCm: number, wallBottomCm: number): boolean {
  return sillCm < wallBottomCm - OPENING_HEIGHT_OVERFLOW_EPS_CM
}

function bovenlichtRequested(opening: Opening, options: FindOpeningHeightOverflowOptions): boolean {
  if (opening.type === 'door') {
    return resolveDoorBovenlicht(opening, options.doorBovenlichtDefault === true)
  }
  if (opening.type === 'window') {
    return resolveWindowBovenlicht(opening, options.windowBovenlichtDefault === true)
  }
  return false
}

function requestedBovenlichtTopCm(
  opening: Opening,
  openingTop: number,
  options: FindOpeningHeightOverflowOptions,
): number {
  const gap = resolveBovenlichtGapCm(opening, options.bovenlichtGapCm ?? BOVENLICHT_GAP_CM)
  const height = resolveBovenlichtHeightCm(
    opening,
    options.bovenlichtHeightCm ?? BOVENLICHT_HEIGHT_CM,
  )
  return openingTop + gap + height
}

/**
 * Openingen (en gevraagd bovenlicht) buiten de muur-elevatie op `t`.
 * Plafond = `az`/`bz`.h (interpolatie); zonder extras fallback `floor.height`.
 */
export function findOpeningHeightOverflows(
  floor: Pick<Floor, 'height' | 'walls'>,
  options: FindOpeningHeightOverflowOptions = {},
): OpeningHeightOverflow[] {
  const floorHeightCm = floor.height
  if (!Number.isFinite(floorHeightCm)) return []

  const hits: OpeningHeightOverflow[] = []
  for (const wall of floor.walls) {
    for (const opening of wall.openings) {
      if (opening.type !== 'door' && opening.type !== 'window') continue
      const elevation = wallElevationAtT(wall, opening.t, floorHeightCm)
      const wallTopCm = elevation.h
      const wallBottomCm = elevation.z
      const sillCm = openingSillCm(opening)
      const topCm = openingTopCm(opening)
      if (belowBottom(sillCm, wallBottomCm)) {
        hits.push({
          kind: opening.type,
          side: 'below',
          topCm: sillCm,
          floorHeightCm: wallBottomCm,
          guid: opening.guid,
        })
      }
      if (exceedsTop(topCm, wallTopCm)) {
        hits.push({
          kind: opening.type,
          side: 'above',
          topCm,
          floorHeightCm: wallTopCm,
          guid: opening.guid,
        })
      }
      if (!bovenlichtRequested(opening, options)) continue
      const bovenlichtTop = requestedBovenlichtTopCm(opening, topCm, options)
      if (exceedsTop(bovenlichtTop, wallTopCm)) {
        hits.push({
          kind: 'bovenlicht',
          side: 'above',
          topCm: bovenlichtTop,
          floorHeightCm: wallTopCm,
          guid: opening.guid,
        })
      }
    }
  }
  return hits
}

export function summarizeOpeningHeightOverflows(
  hits: OpeningHeightOverflow[],
): OpeningHeightOverflowSummary | null {
  if (hits.length === 0) return null
  const above = hits.filter((hit) => hit.side !== 'below')
  const below = hits.filter((hit) => hit.side === 'below')
  const forAbove = above.length > 0 ? above : below
  return {
    doors: above.filter((hit) => hit.kind === 'door').length,
    windows: above.filter((hit) => hit.kind === 'window').length,
    bovenlichten: above.filter((hit) => hit.kind === 'bovenlicht').length,
    below: below.length,
    floorHeightCm: Math.round(forAbove[0].floorHeightCm),
    maxTopCm: Math.round(Math.max(...forAbove.map((hit) => hit.topCm))),
    minSillCm: below.length > 0 ? Math.round(Math.min(...below.map((hit) => hit.topCm))) : 0,
    wallBottomCm:
      below.length > 0 ? Math.round(Math.min(...below.map((hit) => hit.floorHeightCm))) : 0,
  }
}
