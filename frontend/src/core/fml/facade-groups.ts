/**
 * Project-brede gevelgroepen in `plan.source.settings.facadeGroups`.
 * Muur-GUID = haak; geen extras op de muur (Floorplanner stript die bij edit).
 *
 * Stempel (`stamp`) is orthogonaal: een muur mag in stamp + max. 1 gevelgroep.
 */
import type { FloorPlan, FloorPlanSource, FmlExtras, Point2D, Wall } from './types'

/** Zelfde segment op een andere floor (~1 cm), zelfde drempel als stempel-apply. */
export const STACKED_WALL_EPS_CM = 1

export const FACADE_GROUPS_SETTINGS_KEY = 'facadeGroups'

/** Vaste preset in workspace-detectie (stap 4 → muurstempel) en editor-stempel. */
export const STAMP_FACADE_GROUP_ID = 'stamp'
export const STAMP_FACADE_GROUP_NAME = 'Stempel'

export interface FacadeGroup {
  id: string
  code: string
  name: string
  wallGuids: string[]
}

export type FacadeGroupCreateInput = {
  name?: string
  code?: string
}

/** Host-knip: oude id blijft op eerste helft; `intoIds` bevat beide (zelfde as). */
export type WallIdRemap = {
  fromId: string
  intoIds: readonly string[]
}

function cloneSettings(settings: FmlExtras | undefined): FmlExtras {
  return { ...(settings ?? {}) }
}

function ensurePlanSource(plan: FloorPlan): FloorPlanSource {
  if (plan.source) return plan.source
  const source: FloorPlanSource = { settings: {} }
  plan.source = source
  return source
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeWallGuids(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of raw) {
    if (!isNonEmptyString(entry)) continue
    const id = entry.trim()
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function normalizeGroup(raw: unknown): FacadeGroup | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (!isNonEmptyString(record.id)) return null
  const id = record.id.trim()
  const name = isNonEmptyString(record.name) ? record.name.trim() : id
  const code = isNonEmptyString(record.code) ? record.code.trim() : id
  return {
    id,
    code,
    name,
    wallGuids: normalizeWallGuids(record.wallGuids),
  }
}

function isStampGroup(group: FacadeGroup): boolean {
  return group.id === STAMP_FACADE_GROUP_ID
}

/**
 * Max één gevelgroep per muur-GUID (stamp telt niet mee).
 * Binnen stamp: geen dubbele GUIDs. Lege groepen blijven (createFacadeGroup);
 * wissen via removeEmptyGroups.
 */
function enforceUniqueWallMembership(groups: FacadeGroup[]): FacadeGroup[] {
  const claimedFacade = new Set<string>()
  return groups.map((group) => {
    if (isStampGroup(group)) {
      const seen = new Set<string>()
      const wallGuids: string[] = []
      for (const id of group.wallGuids) {
        if (seen.has(id)) continue
        seen.add(id)
        wallGuids.push(id)
      }
      return { ...group, wallGuids }
    }
    const wallGuids: string[] = []
    for (const id of group.wallGuids) {
      if (claimedFacade.has(id)) continue
      claimedFacade.add(id)
      wallGuids.push(id)
    }
    return { ...group, wallGuids }
  })
}

function writeGroups(plan: FloorPlan, groups: FacadeGroup[]): FacadeGroup[] {
  const unique = enforceUniqueWallMembership(groups)
  const source = ensurePlanSource(plan)
  const settings = cloneSettings(source.settings)
  settings[FACADE_GROUPS_SETTINGS_KEY] = unique.map((group) => ({
    id: group.id,
    code: group.code,
    name: group.name,
    wallGuids: [...group.wallGuids],
  }))
  source.settings = settings
  return listFacadeGroups(plan)
}

function nextGroupId(existing: FacadeGroup[]): string {
  let max = 0
  for (const group of existing) {
    const match = /^G(\d+)$/i.exec(group.id)
    if (!match) continue
    max = Math.max(max, Number(match[1]))
  }
  return `G${max + 1}`
}

function removeEmptyGroups(groups: FacadeGroup[]): FacadeGroup[] {
  // Preset «Stempel» blijft altijd (lege set = stempel valt terug op diktebanden).
  return groups.filter((group) => group.wallGuids.length > 0 || group.id === STAMP_FACADE_GROUP_ID)
}

/** Lees + normaliseer `settings.facadeGroups` (dubbele gevel-GUIDs: eerste groep wint). */
export function listFacadeGroups(plan: FloorPlan | null | undefined): FacadeGroup[] {
  const raw = plan?.source?.settings?.[FACADE_GROUPS_SETTINGS_KEY]
  if (!Array.isArray(raw)) return []
  const out: FacadeGroup[] = []
  const seenIds = new Set<string>()
  for (const entry of raw) {
    const group = normalizeGroup(entry)
    if (!group || seenIds.has(group.id)) continue
    seenIds.add(group.id)
    out.push(group)
  }
  return enforceUniqueWallMembership(out)
}

/**
 * Gevelgroep-id voor een muur (slaat `stamp` over).
 * Null = geen gevelgroep (kan wél in stamp zitten).
 */
export function groupIdForWall(
  plan: FloorPlan | null | undefined,
  wallGuid: string,
): string | null {
  const id = wallGuid.trim()
  if (!id) return null
  for (const group of listFacadeGroups(plan)) {
    if (isStampGroup(group)) continue
    if (group.wallGuids.includes(id)) return group.id
  }
  return null
}

export function isWallInStampGroup(plan: FloorPlan | null | undefined, wallGuid: string): boolean {
  const id = wallGuid.trim()
  if (!id) return false
  return wallGuidsInGroup(plan, STAMP_FACADE_GROUP_ID).includes(id)
}

export function wallGuidsInGroup(plan: FloorPlan | null | undefined, groupId: string): string[] {
  const group = listFacadeGroups(plan).find((entry) => entry.id === groupId)
  return group ? [...group.wallGuids] : []
}

/** Gevelgroepen die een aanzicht mogen krijgen (geen stamp, minstens één muur). */
export function listElevationFacadeGroups(plan: FloorPlan | null | undefined): FacadeGroup[] {
  return listFacadeGroups(plan).filter(
    (group) => !isStampGroup(group) && group.wallGuids.length > 0,
  )
}

export function hasElevationFacadeGroups(plan: FloorPlan | null | undefined): boolean {
  return listElevationFacadeGroups(plan).length > 0
}

/** Nieuwe lege groep (`G{n}`); name default = `Gevel G{n}`. */
export function createFacadeGroup(
  plan: FloorPlan,
  input: FacadeGroupCreateInput = {},
): FacadeGroup {
  const existing = listFacadeGroups(plan)
  const id = nextGroupId(existing)
  const name = isNonEmptyString(input.name) ? input.name.trim() : `Gevel ${id}`
  const code = isNonEmptyString(input.code) ? input.code.trim() : id
  const next = [...existing, { id, code, name, wallGuids: [] as string[] }]
  writeGroups(plan, next)
  return next[next.length - 1]
}

/**
 * Zorg dat workspace-preset «Stempel» bestaat (vaste id `stamp`).
 * @returns true als de groep net is aangemaakt (caller kan parent syncen).
 */
export function ensureStampFacadeGroup(plan: FloorPlan): boolean {
  const existing = listFacadeGroups(plan)
  if (existing.some((group) => group.id === STAMP_FACADE_GROUP_ID)) return false
  writeGroups(plan, [
    ...existing,
    {
      id: STAMP_FACADE_GROUP_ID,
      code: STAMP_FACADE_GROUP_ID,
      name: STAMP_FACADE_GROUP_NAME,
      wallGuids: [],
    },
  ])
  return true
}

/** Muren op `floorIndex` die in de Stempel-groep zitten. */
export function wallsInStampGroup(plan: FloorPlan | null | undefined, floorIndex = 0): Wall[] {
  if (!plan) return []
  const floor = plan.floors[floorIndex]
  if (!floor?.walls?.length) return []
  const ids = new Set(facadeMemberIdsOnFloor(plan, STAMP_FACADE_GROUP_ID, floorIndex))
  if (ids.size === 0) return []
  return floor.walls.filter((wall) => ids.has(wall.id))
}

/** Verwijder `facadeGroups` uit settings (workspace-download). */
export function stripFacadeGroupsFromPlan(plan: FloorPlan): FloorPlan {
  const settings = plan.source?.settings
  if (!settings || !(FACADE_GROUPS_SETTINGS_KEY in settings)) return plan
  const nextSettings = { ...settings }
  delete nextSettings[FACADE_GROUPS_SETTINGS_KEY]
  return {
    ...plan,
    source: plan.source ? { ...plan.source, settings: nextSettings } : { settings: nextSettings },
  }
}

/** Verwijder alleen `stamp` uit facadeGroups (editor-download; gevelgroepen blijven). */
export function stripStampGroupFromPlan(plan: FloorPlan): FloorPlan {
  const groups = listFacadeGroups(plan)
  if (!groups.some((group) => group.id === STAMP_FACADE_GROUP_ID)) return plan
  const next = groups.filter((group) => group.id !== STAMP_FACADE_GROUP_ID)
  const cloned: FloorPlan = {
    ...plan,
    source: plan.source
      ? { ...plan.source, settings: { ...plan.source.settings } }
      : { settings: {} },
  }
  if (next.length === 0) {
    const settings = { ...(cloned.source?.settings ?? {}) }
    delete settings[FACADE_GROUPS_SETTINGS_KEY]
    return {
      ...cloned,
      source: { ...cloned.source!, settings },
    }
  }
  writeGroups(cloned, next)
  return cloned
}

export function renameFacadeGroup(
  plan: FloorPlan,
  groupId: string,
  patch: { name?: string; code?: string },
): FacadeGroup | null {
  const groups = listFacadeGroups(plan)
  const index = groups.findIndex((group) => group.id === groupId)
  if (index < 0) return null
  const current = groups[index]
  const next: FacadeGroup = {
    ...current,
    name: isNonEmptyString(patch.name) ? patch.name.trim() : current.name,
    code: isNonEmptyString(patch.code) ? patch.code.trim() : current.code,
  }
  groups[index] = next
  writeGroups(plan, groups)
  return next
}

/**
 * Zet muren in `groupId`.
 * - Gevelgroep: verplaatst uit andere gevelgroepen; stamp-lidmaatschap blijft.
 * - Stamp: voegt toe zonder gevel-lidmaatschap te wissen.
 * Lege gevelgroepen verdwijnen (stamp blijft).
 */
export function assignWallsToGroup(
  plan: FloorPlan,
  groupId: string,
  wallGuids: readonly string[],
): FacadeGroup | null {
  const ids = normalizeWallGuids(wallGuids)
  if (ids.length === 0) return listFacadeGroups(plan).find((g) => g.id === groupId) ?? null

  let groups = listFacadeGroups(plan)
  if (!groups.some((group) => group.id === groupId)) return null

  const idSet = new Set(ids)
  const targetIsStamp = groupId === STAMP_FACADE_GROUP_ID
  const emptiedByMove = new Set<string>()

  groups = groups.map((group) => {
    if (group.id === groupId) {
      const merged = [...group.wallGuids]
      for (const id of ids) {
        if (!merged.includes(id)) merged.push(id)
      }
      return { ...group, wallGuids: merged }
    }
    // Stamp-assign raakt andere groepen niet; gevel-assign raakt stamp niet.
    if (targetIsStamp || isStampGroup(group)) {
      return group
    }
    const nextGuids = group.wallGuids.filter((id) => !idSet.has(id))
    if (nextGuids.length === 0 && group.wallGuids.length > 0) {
      emptiedByMove.add(group.id)
    }
    return { ...group, wallGuids: nextGuids }
  })
  writeGroups(
    plan,
    groups.filter((group) => !emptiedByMove.has(group.id)),
  )
  return listFacadeGroups(plan).find((g) => g.id === groupId) ?? null
}

/** Zet muren in Stempel (zorgt dat stamp-groep bestaat). */
export function assignWallsToStamp(plan: FloorPlan, wallGuids: readonly string[]): void {
  ensureStampFacadeGroup(plan)
  assignWallsToGroup(plan, STAMP_FACADE_GROUP_ID, wallGuids)
}

/** Haal muren alleen uit Stempel; gevel-lidmaatschap blijft. */
export function detachWallsFromStamp(plan: FloorPlan, wallGuids: readonly string[]): void {
  const idSet = new Set(normalizeWallGuids(wallGuids))
  if (idSet.size === 0) return
  const groups = listFacadeGroups(plan).map((group) => {
    if (!isStampGroup(group)) return group
    return {
      ...group,
      wallGuids: group.wallGuids.filter((id) => !idSet.has(id)),
    }
  })
  writeGroups(plan, removeEmptyGroups(groups))
}

/** Haal muren alleen uit gevelgroepen; stamp-lidmaatschap blijft. */
export function detachWallsFromFacade(plan: FloorPlan, wallGuids: readonly string[]): void {
  const idSet = new Set(normalizeWallGuids(wallGuids))
  if (idSet.size === 0) return
  const groups = listFacadeGroups(plan).map((group) => {
    if (isStampGroup(group)) return group
    return {
      ...group,
      wallGuids: group.wallGuids.filter((id) => !idSet.has(id)),
    }
  })
  writeGroups(plan, removeEmptyGroups(groups))
}

/** Haal muren uit alle groepen (gevel + stamp); lege groepen weg. */
export function detachWalls(plan: FloorPlan, wallGuids: readonly string[]): void {
  const idSet = new Set(normalizeWallGuids(wallGuids))
  if (idSet.size === 0) return
  const groups = listFacadeGroups(plan).map((group) => ({
    ...group,
    wallGuids: group.wallGuids.filter((id) => !idSet.has(id)),
  }))
  writeGroups(plan, removeEmptyGroups(groups))
}

/**
 * Wis een lege groep. Weigert als er nog leden zijn (return false).
 */
export function deleteFacadeGroup(plan: FloorPlan, groupId: string): boolean {
  const groups = listFacadeGroups(plan)
  const group = groups.find((entry) => entry.id === groupId)
  if (!group) return true
  if (group.wallGuids.length > 0) return false
  writeGroups(
    plan,
    groups.filter((entry) => entry.id !== groupId),
  )
  return true
}

function collectWallIds(plan: FloorPlan): Set<string> {
  const ids = new Set<string>()
  const addWall = (wall: Wall) => {
    const id = wall.id?.trim()
    if (id) ids.add(id)
  }
  for (const floor of plan.floors) {
    for (const wall of floor.walls) addWall(wall)
    for (const design of floor.designs ?? []) {
      for (const wall of design.walls) addWall(wall)
    }
  }
  return ids
}

/** Verwijder wees-GUIDs; daarna lege groepen. */
export function pruneFacadeGroups(plan: FloorPlan): FacadeGroup[] {
  const alive = collectWallIds(plan)
  const groups = listFacadeGroups(plan).map((group) => ({
    ...group,
    wallGuids: group.wallGuids.filter((id) => alive.has(id)),
  }))
  return writeGroups(plan, removeEmptyGroups(groups))
}

/**
 * Split-hook: vervang `fromId` door `intoIds` in elke groep die `fromId` bevat
 * (gevel én stamp). Typisch: eerste helft houdt oude id, tweede = nieuwe split-host id.
 */
export function remapFacadeGroupWallIds(
  plan: FloorPlan,
  fromId: string,
  intoIds: readonly string[],
): void {
  const from = fromId.trim()
  if (!from) return
  const replacements = normalizeWallGuids(intoIds)
  if (replacements.length === 0) return

  const ownerIds = new Set<string>()
  for (const group of listFacadeGroups(plan)) {
    if (group.wallGuids.includes(from)) ownerIds.add(group.id)
  }
  if (ownerIds.size === 0) return

  const replacementSet = new Set(replacements)
  const groups = listFacadeGroups(plan).map((group) => {
    if (ownerIds.has(group.id)) {
      const next: string[] = []
      const seen = new Set<string>()
      for (const id of group.wallGuids) {
        if (id === from) {
          for (const replacement of replacements) {
            if (seen.has(replacement)) continue
            seen.add(replacement)
            next.push(replacement)
          }
          continue
        }
        if (seen.has(id)) continue
        seen.add(id)
        next.push(id)
      }
      return { ...group, wallGuids: next }
    }
    // Nieuwe split-ids niet in niet-eigenaar-groepen laten staan (corrupt import).
    return {
      ...group,
      wallGuids: group.wallGuids.filter((id) => id !== from && !replacementSet.has(id)),
    }
  })
  writeGroups(plan, removeEmptyGroups(groups))
}

/** Batch-remap na T/X of sanitize-cover splits. */
export function applyFacadeGroupRemaps(plan: FloorPlan, remaps: readonly WallIdRemap[]): void {
  for (const remap of remaps) {
    remapFacadeGroupWallIds(plan, remap.fromId, remap.intoIds)
  }
}

function samePoint(a: Point2D, b: Point2D, epsCm: number): boolean {
  return Math.abs(a.x - b.x) <= epsCm && Math.abs(a.y - b.y) <= epsCm
}

function segmentsMatch(a: Wall, b: Pick<Wall, 'a' | 'b'>, epsCm: number): boolean {
  return (
    (samePoint(a.a, b.a, epsCm) && samePoint(a.b, b.b, epsCm)) ||
    (samePoint(a.a, b.b, epsCm) && samePoint(a.b, b.a, epsCm))
  )
}

/**
 * Muren op andere verdiepingen met dezelfde `a`/`b` (of omgekeerd).
 * Alleen `floor.walls` (geen nok-design). Seed-ids zelf zitten niet in het resultaat.
 */
export function findStackedWallIds(
  plan: FloorPlan | null | undefined,
  wallGuids: readonly string[],
  options?: { epsCm?: number },
): string[] {
  if (!plan) return []
  const seedIds = new Set(normalizeWallGuids(wallGuids))
  if (seedIds.size === 0) return []

  const epsCm = options?.epsCm ?? STACKED_WALL_EPS_CM
  const seeds: Array<{ wall: Wall; floorIndex: number }> = []
  for (let floorIndex = 0; floorIndex < plan.floors.length; floorIndex += 1) {
    const floor = plan.floors[floorIndex]
    if (!floor) continue
    for (const wall of floor.walls) {
      if (!seedIds.has(wall.id)) continue
      seeds.push({ wall, floorIndex })
    }
  }
  if (seeds.length === 0) return []

  const out: string[] = []
  const seen = new Set(seedIds)
  for (let floorIndex = 0; floorIndex < plan.floors.length; floorIndex += 1) {
    const floor = plan.floors[floorIndex]
    if (!floor) continue
    for (const wall of floor.walls) {
      if (seen.has(wall.id)) continue
      const hit = seeds.some(
        (seed) => seed.floorIndex !== floorIndex && segmentsMatch(wall, seed.wall, epsCm),
      )
      if (!hit) continue
      seen.add(wall.id)
      out.push(wall.id)
    }
  }
  return out
}

/** Leden van de groep die op `floorIndex` bestaan. */
export function facadeMemberIdsOnFloor(
  plan: FloorPlan | null | undefined,
  groupId: string,
  floorIndex: number,
): string[] {
  if (!plan) return []
  const floor = plan.floors[floorIndex]
  if (!floor) return []
  const onFloor = new Set(floor.walls.map((wall) => wall.id))
  return wallGuidsInGroup(plan, groupId).filter((id) => onFloor.has(id))
}
