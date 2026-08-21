/**
 * Kopieer Stempel-muren van andere verdiepingen naar `targetFloorIndex`
 * op dezelfde FML-coördinaten (nulpunt-relatief).
 *
 * - Alleen muren (geen openings)
 * - Nieuwe GUIDs; kopieën gaan niet in stamp
 * - Gevelgroep van bron-muur wordt overgenomen
 * - Hoogte (az/bz) volgt doelverdieping
 * - Bestaande segmenten op doel (zelfde a/b binnen eps) worden overgeslagen
 *
 * Workspace-detectie: {@link injectStampWallsIntoPlan} met offset + replaceOverlap.
 */
import {
  assignWallsToGroup,
  createFacadeGroup,
  groupIdForWall,
  isWallInStampGroup,
  listFacadeGroups,
  wallsInStampGroup,
} from './facade-groups'
import { DEFAULT_FML_WALL_HEIGHT_CM } from './extraction-to-plan-types'
import { markStampOwned } from './stamp-owned'
import { translatePointByOffset } from './stamp-nulpunt'
import type { FloorPlan, Point2D, Wall } from './types'

/** Tolerantie voor «zelfde segment al aanwezig» (~1 cm) — editor apply. */
export const STAMP_APPLY_SEGMENT_EPS_CM = 1

/** Ruimer voor detectie↔inject overlap (dubbele muren na classify). */
export const STAMP_INJECT_SEGMENT_EPS_CM = 8

export type ApplyStampToFloorResult = {
  plan: FloorPlan
  addedWallIds: string[]
  skippedCount: number
  sourceCount: number
}

export type InjectStampWallsResult = ApplyStampToFloorResult & {
  /** Nieuwe inject-ids — dikte pinnen in harmonize. */
  pinnedWallIds: string[]
  removedOverlapCount: number
}

function shortGuid(): string {
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')
}

function samePoint(a: Point2D, b: Point2D, epsCm: number): boolean {
  return Math.abs(a.x - b.x) <= epsCm && Math.abs(a.y - b.y) <= epsCm
}

function segmentsMatch(a: Wall, b: { a: Point2D; b: Point2D }, epsCm: number): boolean {
  return (
    (samePoint(a.a, b.a, epsCm) && samePoint(a.b, b.b, epsCm)) ||
    (samePoint(a.a, b.b, epsCm) && samePoint(a.b, b.a, epsCm))
  )
}

function hasMatchingSegment(
  walls: readonly Wall[],
  a: Point2D,
  b: Point2D,
  epsCm: number,
): boolean {
  for (const wall of walls) {
    if (segmentsMatch(wall, { a, b }, epsCm)) return true
  }
  return false
}

function findMatchingSegmentIndices(
  walls: readonly Wall[],
  a: Point2D,
  b: Point2D,
  epsCm: number,
): number[] {
  const out: number[] = []
  for (let i = 0; i < walls.length; i += 1) {
    const wall = walls[i]
    if (wall && segmentsMatch(wall, { a, b }, epsCm)) out.push(i)
  }
  return out
}

function floorHeightCm(plan: FloorPlan, floorIndex: number): number {
  const height = plan.floors[floorIndex]?.height
  return typeof height === 'number' && Number.isFinite(height) && height > 0
    ? Math.round(height)
    : DEFAULT_FML_WALL_HEIGHT_CM
}

function cloneStampWall(source: Wall, heightCm: number, offsetCm?: Point2D): Wall {
  const offset = offsetCm ?? { x: 0, y: 0 }
  const endpoint = { z: 0, h: heightCm }
  const extras: Record<string, unknown> = { az: { ...endpoint }, bz: { ...endpoint } }
  if (typeof source.balance === 'number' && Number.isFinite(source.balance)) {
    // balance blijft op wall.balance; geen extras-copy van bron
  }
  // Bewaar relevante extras behalve az/bz (hoogte doelverdieping).
  if (source.extras) {
    for (const [key, value] of Object.entries(source.extras)) {
      if (key === 'az' || key === 'bz') continue
      extras[key] = value
    }
  }
  return {
    id: `stamp-${shortGuid()}`,
    a: translatePointByOffset(source.a, offset),
    b: translatePointByOffset(source.b, offset),
    thickness: source.thickness,
    ...(typeof source.balance === 'number' ? { balance: source.balance } : {}),
    ...(source.c != null ? { c: translatePointByOffset(source.c, offset) } : {}),
    openings: [],
    extras,
  }
}

/** Alle stempelmuren op andere floors (bron voor apply). */
export function collectStampSourceWalls(plan: FloorPlan, targetFloorIndex: number): Wall[] {
  const out: Wall[] = []
  const seen = new Set<string>()
  for (let i = 0; i < plan.floors.length; i++) {
    if (i === targetFloorIndex) continue
    for (const wall of wallsInStampGroup(plan, i)) {
      if (seen.has(wall.id)) continue
      seen.add(wall.id)
      out.push(wall)
    }
  }
  return out
}

function assignFacadesForAdded(
  plan: FloorPlan,
  facadeAssigns: Map<string, string>,
  facadeLookupPlan?: FloorPlan | null,
): void {
  if (facadeAssigns.size === 0) return
  // Zorg dat gevelgroepen van de donor op het doelplan bestaan (zelfde id/naam).
  if (facadeLookupPlan) {
    const existing = new Set(listFacadeGroups(plan).map((g) => g.id))
    for (const groupId of new Set(facadeAssigns.values())) {
      if (existing.has(groupId)) continue
      const donorGroup = listFacadeGroups(facadeLookupPlan).find((g) => g.id === groupId)
      if (!donorGroup) continue
      const created = createFacadeGroup(plan, {
        name: donorGroup.name,
        code: donorGroup.code,
      })
      // createFacadeGroup maakt G1/G2… — remap assigns naar die id als id verschilt.
      if (created.id !== groupId) {
        for (const [wallId, gid] of [...facadeAssigns.entries()]) {
          if (gid === groupId) facadeAssigns.set(wallId, created.id)
        }
      }
      existing.add(created.id)
    }
  }
  const byGroup = new Map<string, string[]>()
  for (const [wallId, groupId] of facadeAssigns) {
    const list = byGroup.get(groupId) ?? []
    list.push(wallId)
    byGroup.set(groupId, list)
  }
  for (const [groupId, wallIds] of byGroup) {
    assignWallsToGroup(plan, groupId, wallIds)
  }
}

/**
 * Plaats stempelmuren op `targetFloorIndex`.
 * Mutates een shallow-cloned plan (floors + source); caller synct naar state.
 */
export function applyStampToFloor(
  plan: FloorPlan,
  targetFloorIndex: number,
  options?: { epsCm?: number },
): ApplyStampToFloorResult {
  const epsCm = options?.epsCm ?? STAMP_APPLY_SEGMENT_EPS_CM
  const floor = plan.floors[targetFloorIndex]
  if (!floor) {
    return { plan, addedWallIds: [], skippedCount: 0, sourceCount: 0 }
  }

  const sources = collectStampSourceWalls(plan, targetFloorIndex)
  if (sources.length === 0) {
    return { plan, addedWallIds: [], skippedCount: 0, sourceCount: 0 }
  }

  const heightCm = floorHeightCm(plan, targetFloorIndex)
  const nextWalls = [...floor.walls]
  const addedWallIds: string[] = []
  /** Nieuwe id → gevelgroep van bron (niet stamp). */
  const facadeAssigns = new Map<string, string>()
  let skippedCount = 0

  for (const source of sources) {
    if (hasMatchingSegment(nextWalls, source.a, source.b, epsCm)) {
      skippedCount += 1
      continue
    }
    const cloned = cloneStampWall(source, heightCm)
    nextWalls.push(cloned)
    addedWallIds.push(cloned.id)
    const facadeId = groupIdForWall(plan, source.id)
    if (facadeId) facadeAssigns.set(cloned.id, facadeId)
  }

  if (addedWallIds.length === 0) {
    return { plan, addedWallIds: [], skippedCount, sourceCount: sources.length }
  }

  const nextPlan: FloorPlan = {
    ...plan,
    floors: plan.floors.map((f, i) => (i === targetFloorIndex ? { ...f, walls: nextWalls } : f)),
    source: plan.source
      ? { ...plan.source, settings: { ...(plan.source.settings ?? {}) } }
      : plan.source,
  }

  assignFacadesForAdded(nextPlan, facadeAssigns)

  // Sanity: kopieën mogen niet in stamp zitten.
  for (const id of addedWallIds) {
    if (isWallInStampGroup(nextPlan, id)) {
      // Should not happen; defensive.
    }
  }

  return {
    plan: nextPlan,
    addedWallIds,
    skippedCount,
    sourceCount: sources.length,
  }
}

/**
 * Injecteer donor-stempelmuren in een generated plan (workspace stap 4).
 * - offsetCm: bakeNulpunt − currentNulpunt
 * - replaceOverlap: verwijder gedetecteerde segmenten die overlappen, voeg inject toe
 * - facadeLookupPlan: optioneel donor-plan voor gevel-GUID remap (anders geen gevel)
 */
export function injectStampWallsIntoPlan(
  plan: FloorPlan,
  targetFloorIndex: number,
  sources: readonly Wall[],
  options?: {
    offsetCm?: Point2D
    epsCm?: number
    replaceOverlap?: boolean
    facadeLookupPlan?: FloorPlan | null
  },
): InjectStampWallsResult {
  const epsCm = options?.epsCm ?? STAMP_INJECT_SEGMENT_EPS_CM
  const offsetCm = options?.offsetCm ?? { x: 0, y: 0 }
  const replaceOverlap = options?.replaceOverlap !== false
  const floor = plan.floors[targetFloorIndex]
  if (!floor || sources.length === 0) {
    return {
      plan,
      addedWallIds: [],
      skippedCount: 0,
      sourceCount: sources.length,
      pinnedWallIds: [],
      removedOverlapCount: 0,
    }
  }

  const heightCm = floorHeightCm(plan, targetFloorIndex)
  let nextWalls = [...floor.walls]
  const addedWallIds: string[] = []
  const facadeAssigns = new Map<string, string>()
  let skippedCount = 0
  let removedOverlapCount = 0
  const facadePlan = options?.facadeLookupPlan ?? plan

  for (const source of sources) {
    const placedA = translatePointByOffset(source.a, offsetCm)
    const placedB = translatePointByOffset(source.b, offsetCm)
    const matches = findMatchingSegmentIndices(nextWalls, placedA, placedB, epsCm)
    if (matches.length > 0) {
      if (!replaceOverlap) {
        skippedCount += 1
        continue
      }
      const remove = new Set(matches)
      nextWalls = nextWalls.filter((_, i) => !remove.has(i))
      removedOverlapCount += matches.length
    }
    const cloned = markStampOwned(cloneStampWall(source, heightCm, offsetCm))
    nextWalls.push(cloned)
    addedWallIds.push(cloned.id)
    const facadeId = groupIdForWall(facadePlan, source.id)
    if (facadeId) facadeAssigns.set(cloned.id, facadeId)
  }

  if (addedWallIds.length === 0) {
    return {
      plan,
      addedWallIds: [],
      skippedCount,
      sourceCount: sources.length,
      pinnedWallIds: [],
      removedOverlapCount,
    }
  }

  const nextPlan: FloorPlan = {
    ...plan,
    floors: plan.floors.map((f, i) => (i === targetFloorIndex ? { ...f, walls: nextWalls } : f)),
    source: plan.source
      ? { ...plan.source, settings: { ...(plan.source.settings ?? {}) } }
      : facadeAssigns.size > 0
        ? { settings: {} }
        : plan.source,
  }

  assignFacadesForAdded(nextPlan, facadeAssigns, facadePlan)

  return {
    plan: nextPlan,
    addedWallIds,
    skippedCount,
    sourceCount: sources.length,
    pinnedWallIds: [...addedWallIds],
    removedOverlapCount,
  }
}

/** True als er bron-stempelmuren zijn die (mogelijk) nog niet op target liggen. */
export function canApplyStampToFloor(
  plan: FloorPlan | null | undefined,
  targetFloorIndex: number,
  options?: { epsCm?: number },
): boolean {
  if (!plan) return false
  const floor = plan.floors[targetFloorIndex]
  if (!floor) return false
  const sources = collectStampSourceWalls(plan, targetFloorIndex)
  if (sources.length === 0) return false
  const epsCm = options?.epsCm ?? STAMP_APPLY_SEGMENT_EPS_CM
  return sources.some((source) => !hasMatchingSegment(floor.walls, source.a, source.b, epsCm))
}
