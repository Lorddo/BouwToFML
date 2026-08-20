/**
 * Project-brede gevelgroepen in `plan.source.settings.facadeGroups`.
 * Muur-GUID = haak; geen extras op de muur (Floorplanner stript die bij edit).
 */
import type { FloorPlan, FloorPlanSource, FmlExtras, Wall } from './types'

export const FACADE_GROUPS_SETTINGS_KEY = 'facadeGroups'

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

/**
 * Max één groep per muur-GUID: eerste groep wint.
 * Lege groepen blijven (createFacadeGroup); wissen via removeEmptyGroups.
 */
function enforceUniqueWallMembership(groups: FacadeGroup[]): FacadeGroup[] {
  const claimed = new Set<string>()
  return groups.map((group) => {
    const wallGuids: string[] = []
    for (const id of group.wallGuids) {
      if (claimed.has(id)) continue
      claimed.add(id)
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
  return groups.filter((group) => group.wallGuids.length > 0)
}

/** Lees + normaliseer `settings.facadeGroups` (dubbele muur-GUIDs: eerste groep wint). */
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

export function groupIdForWall(
  plan: FloorPlan | null | undefined,
  wallGuid: string,
): string | null {
  const id = wallGuid.trim()
  if (!id) return null
  for (const group of listFacadeGroups(plan)) {
    if (group.wallGuids.includes(id)) return group.id
  }
  return null
}

export function wallGuidsInGroup(plan: FloorPlan | null | undefined, groupId: string): string[] {
  const group = listFacadeGroups(plan).find((entry) => entry.id === groupId)
  return group ? [...group.wallGuids] : []
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
 * Zet muren in `groupId`. Verplaatst uit andere groepen.
 * Lege groepen verdwijnen.
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
  const emptiedByMove = new Set<string>()
  groups = groups.map((group) => {
    if (group.id === groupId) {
      const merged = [...group.wallGuids]
      for (const id of ids) {
        if (!merged.includes(id)) merged.push(id)
      }
      return { ...group, wallGuids: merged }
    }
    const nextGuids = group.wallGuids.filter((id) => !idSet.has(id))
    if (nextGuids.length === 0 && group.wallGuids.length > 0) {
      emptiedByMove.add(group.id)
    }
    return { ...group, wallGuids: nextGuids }
  })
  // Alleen groepen die door verplaatsen leeg raakten wissen (niet net-aangemaakte lege G2).
  writeGroups(
    plan,
    groups.filter((group) => !emptiedByMove.has(group.id)),
  )
  return listFacadeGroups(plan).find((g) => g.id === groupId) ?? null
}

/** Haal muren uit alle groepen; lege groepen weg. */
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
 * Split-hook: vervang `fromId` door `intoIds` in de groep die `fromId` bevat.
 * Typisch: eerste helft houdt oude id, tweede = nieuwe split-host id.
 * Alleen die ene groep krijgt de nieuwe ids (geen dubbele lidmaatschappen).
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

  const ownerId = groupIdForWall(plan, from)
  if (!ownerId) return

  const replacementSet = new Set(replacements)
  const groups = listFacadeGroups(plan).map((group) => {
    if (group.id === ownerId) {
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
    // Nieuwe split-ids niet in andere groepen laten staan (corrupt import).
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
