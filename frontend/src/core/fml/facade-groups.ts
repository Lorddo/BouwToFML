/**
 * Gevelgroepen: `settings.facadeGroups` is bron van waarheid (extras-only).
 * Een muur-GUID mag in meerdere gevelgroepen (voor/na verbouwing).
 * Stempel (`stamp`) is orthogonaal en mag naast N gevels.
 *
 * Native Floorplanner-markers (`groupMarker` / `groupId` / `stampGroupId`) worden
 * niet meer geschreven. Import migreert eenmalig vanuit markers als de catalogus leeg is.
 */
import type {
  Floor,
  FloorDesign,
  FloorPlan,
  FloorPlanSource,
  FmlExtras,
  Point2D,
  Wall,
} from './types'

/**
 * Band rond de hartlijn voor gestapelde gevelmuren (cm).
 * Ruimer dan stempel-apply (exact a/b): junctions knippen de as in andere stukken.
 */
export const STACKED_WALL_EPS_CM = 5

/** Min |dot| van unit-richtingen (~11°) zodat een T-tak niet meekomt. */
const STACKED_WALL_PARALLEL_DOT = 0.98

export const FACADE_GROUPS_SETTINGS_KEY = 'facadeGroups'

/** Vaste preset in workspace-detectie (stap 4 → muurstempel) en editor-stempel. */
export const STAMP_FACADE_GROUP_ID = 'stamp'
export const STAMP_FACADE_GROUP_NAME = 'Stempel'

/** Stabiele default native-id voor Stempel (zelfde orde als FP-probe). */
export const STAMP_NATIVE_GROUP_ID = 708412

export interface FacadeGroup {
  id: string
  code: string
  name: string
  wallGuids: string[]
  /** Floorplanner `groupMarkerConfig.groupId` (stamp: stampGroupId). */
  nativeId?: number
  /** Floorplanner `groupMarker` timestamp. */
  groupMarker?: number
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

export type NativeGroupRef = { key: string; name?: string }

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
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

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (isNonEmptyString(value) && /^\d+$/.test(value.trim())) return Number(value.trim())
  return undefined
}

function normalizeGroup(raw: unknown): FacadeGroup | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (!isNonEmptyString(record.id)) return null
  const id = record.id.trim()
  const name = isNonEmptyString(record.name) ? record.name.trim() : id
  const code = isNonEmptyString(record.code) ? record.code.trim() : id
  const nativeId = parseOptionalNumber(record.nativeId)
  const groupMarker = parseOptionalNumber(record.groupMarker)
  return {
    id,
    code,
    name,
    wallGuids: normalizeWallGuids(record.wallGuids),
    ...(nativeId != null ? { nativeId } : {}),
    ...(groupMarker != null ? { groupMarker } : {}),
  }
}

function isStampGroup(group: FacadeGroup): boolean {
  return group.id === STAMP_FACADE_GROUP_ID
}

function isPlanDesign(design: FloorDesign | null | undefined): boolean {
  if (!design) return false
  const role = design.source?.settings?.btfRole
  if (role === 'ridge') return false
  if (design.name?.trim().toLowerCase() === 'dak') return false
  return true
}

/** Geen dubbele GUID binnen één groep; overlap tussen gevelgroepen mag. */
function dedupeWallGuidsInGroups(groups: FacadeGroup[]): FacadeGroup[] {
  return groups.map((group) => {
    const seen = new Set<string>()
    const wallGuids: string[] = []
    for (const id of group.wallGuids) {
      if (seen.has(id)) continue
      seen.add(id)
      wallGuids.push(id)
    }
    return { ...group, wallGuids }
  })
}

function serializeGroup(group: FacadeGroup): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: group.id,
    code: group.code,
    name: group.name,
    wallGuids: [...group.wallGuids],
  }
  if (group.nativeId != null) out.nativeId = group.nativeId
  if (group.groupMarker != null) out.groupMarker = group.groupMarker
  return out
}

let nativeIdSeq = 0

function allotFreshNativeId(usedNative: Set<number>): number {
  let nativeId: number
  do {
    nativeIdSeq += 1
    nativeId = Date.now() + nativeIdSeq
  } while (usedNative.has(nativeId))
  usedNative.add(nativeId)
  return nativeId
}

function ensureNativeIds(groups: FacadeGroup[]): FacadeGroup[] {
  const used = new Set<number>()
  return groups.map((group) => {
    if (isStampGroup(group)) {
      const nativeId = group.nativeId ?? STAMP_NATIVE_GROUP_ID
      used.add(nativeId)
      return {
        ...group,
        nativeId,
        groupMarker: group.groupMarker ?? nativeId,
      }
    }
    if (group.nativeId != null && !used.has(group.nativeId)) {
      used.add(group.nativeId)
      return {
        ...group,
        groupMarker: group.groupMarker ?? group.nativeId,
      }
    }
    const nativeId = allotFreshNativeId(used)
    return {
      ...group,
      nativeId,
      groupMarker: group.groupMarker ?? nativeId,
    }
  })
}

function writeGroupsCatalogOnly(plan: FloorPlan, groups: FacadeGroup[]): FacadeGroup[] {
  const unique = dedupeWallGuidsInGroups(ensureNativeIds(groups))
  const source = ensurePlanSource(plan)
  const settings = cloneSettings(source.settings)
  settings[FACADE_GROUPS_SETTINGS_KEY] = unique.map(serializeGroup)
  source.settings = settings
  return listFacadeGroups(plan)
}

/** Catalogus-only; schrijft geen native markers op muren. */
function writeGroups(plan: FloorPlan, groups: FacadeGroup[]): FacadeGroup[] {
  return writeGroupsCatalogOnly(plan, groups)
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

/** Lees + normaliseer `settings.facadeGroups` (dubbele GUID binnen één groep weg; overlap mag). */
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
  return dedupeWallGuidsInGroups(out)
}

/**
 * Alle gevelgroep-ids voor een muur (slaat `stamp` over).
 * Leeg = geen gevelgroep (kan wél in stamp zitten).
 */
export function groupIdsForWall(plan: FloorPlan | null | undefined, wallGuid: string): string[] {
  const id = wallGuid.trim()
  if (!id) return []
  const out: string[] = []
  for (const group of listFacadeGroups(plan)) {
    if (isStampGroup(group)) continue
    if (group.wallGuids.includes(id)) out.push(group.id)
  }
  return out
}

/**
 * Eerste gevelgroep-id voor een muur (legacy / inspect-expand bij exact één groep).
 * Null = geen gevelgroep (kan wél in stamp zitten).
 */
export function groupIdForWall(
  plan: FloorPlan | null | undefined,
  wallGuid: string,
): string | null {
  return groupIdsForWall(plan, wallGuid)[0] ?? null
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

/** Plattegrond-muren (geen Dak/nok-design). */
export function collectPlanWalls(plan: FloorPlan): Wall[] {
  const walls: Wall[] = []
  const seen = new Set<Wall>()
  const add = (wall: Wall) => {
    if (seen.has(wall)) return
    seen.add(wall)
    walls.push(wall)
  }
  for (const floor of plan.floors) {
    for (const wall of floor.walls) add(wall)
    for (const design of floor.designs ?? []) {
      if (!isPlanDesign(design)) continue
      for (const wall of design.walls) add(wall)
    }
  }
  return walls
}

function collectWallIds(plan: FloorPlan): Set<string> {
  const ids = new Set<string>()
  for (const wall of collectPlanWalls(plan)) {
    const id = wall.id?.trim()
    if (id) ids.add(id)
  }
  return ids
}

/**
 * Legacy: schrijf native FP-markers op muren vanuit de catalogus.
 * Product-pad gebruikt dit niet meer (extras-only); behouden voor migratie-tests.
 */
export function syncNativeMarkersOnWalls(plan: FloorPlan): void {
  const groups = ensureNativeIds(listFacadeGroups(plan))
  const source = ensurePlanSource(plan)
  const settings = cloneSettings(source.settings)
  settings[FACADE_GROUPS_SETTINGS_KEY] = groups.map(serializeGroup)
  source.settings = settings

  const facadeByGuid = new Map<string, FacadeGroup>()
  let stampGroup: FacadeGroup | undefined
  for (const group of groups) {
    if (isStampGroup(group)) {
      stampGroup = group
      continue
    }
    for (const guid of group.wallGuids) {
      if (!facadeByGuid.has(guid)) facadeByGuid.set(guid, group)
    }
  }
  const stampGuids = new Set(stampGroup?.wallGuids ?? [])

  for (const wall of collectPlanWalls(plan)) {
    const guid = wall.id?.trim()
    if (!guid) continue
    const facade = facadeByGuid.get(guid)
    const inStamp = stampGuids.has(guid)
    const extras: FmlExtras = { ...(wall.extras ?? {}) }
    const cfg: Record<string, unknown> = {}

    if (facade?.nativeId != null) {
      extras.groupMarker = facade.groupMarker ?? facade.nativeId
      cfg.locked = true
      cfg.groupId = facade.nativeId
      cfg.name = facade.name
    } else {
      delete extras.groupMarker
      cfg.locked = false
    }

    if (inStamp && stampGroup?.nativeId != null) {
      cfg.stampGroupId = stampGroup.nativeId
      cfg.stampName = stampGroup.name
    }

    delete extras.groupMarkers
    delete extras.bouwToFmlProbe
    delete extras.facadeGroupId

    wall.extras = { ...extras, groupMarkerConfig: cfg }
  }
}

function stripNativeMarkersOnWall(wall: Wall, mode: 'all' | 'stamp-only'): void {
  const extras: FmlExtras = { ...(wall.extras ?? {}) }
  const prev = asRecord(extras.groupMarkerConfig) ?? {}
  if (mode === 'all') {
    delete extras.groupMarker
    delete extras.groupMarkers
    delete extras.bouwToFmlProbe
    extras.groupMarkerConfig = { locked: false }
    wall.extras = extras
    return
  }
  const cfg: Record<string, unknown> = { ...prev }
  delete cfg.stampGroupId
  delete cfg.stampName
  delete cfg.groups
  if (!('locked' in cfg)) cfg.locked = prev.locked === true
  extras.groupMarkerConfig = cfg
  wall.extras = extras
}

function cloneWallForExport(wall: Wall): Wall {
  return {
    ...wall,
    a: { ...wall.a },
    b: { ...wall.b },
    c: wall.c ? { ...wall.c } : wall.c,
    openings: wall.openings.map((op) => ({
      ...op,
      extras: op.extras ? { ...op.extras } : undefined,
    })),
    extras: wall.extras ? { ...wall.extras } : undefined,
  }
}

function cloneDesignForExport(design: FloorDesign): FloorDesign {
  return {
    ...design,
    walls: design.walls.map(cloneWallForExport),
    areas: design.areas?.map((a) => ({ ...a, poly: a.poly.map((p) => ({ ...p })) })),
    surfaces: design.surfaces?.map((s) => ({ ...s, poly: s.poly.map((p) => ({ ...p })) })),
    items: design.items?.map((item) => ({ ...item })),
    labels: design.labels?.map((label) => ({ ...label })),
    lines: design.lines?.map((line) => ({ ...line })),
    dimensions: design.dimensions?.map((dim) => ({ ...dim })),
    source: design.source
      ? {
          ...design.source,
          settings: design.source.settings ? { ...design.source.settings } : undefined,
        }
      : undefined,
  }
}

function cloneFloorForExport(floor: Floor): Floor {
  return {
    ...floor,
    walls: floor.walls.map(cloneWallForExport),
    designs: floor.designs?.map(cloneDesignForExport),
    areas: floor.areas?.map((a) => ({ ...a, poly: a.poly.map((p) => ({ ...p })) })),
    surfaces: floor.surfaces?.map((s) => ({ ...s, poly: s.poly.map((p) => ({ ...p })) })),
    items: floor.items?.map((item) => ({ ...item })),
    labels: floor.labels?.map((label) => ({ ...label })),
    lines: floor.lines?.map((line) => ({ ...line })),
    dimensions: floor.dimensions?.map((dim) => ({ ...dim })),
    drawing: floor.drawing ? { ...floor.drawing } : undefined,
    source: floor.source ? { ...floor.source } : undefined,
  }
}

function clonePlanForExport(plan: FloorPlan): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map(cloneFloorForExport),
    source: plan.source
      ? { ...plan.source, settings: cloneSettings(plan.source.settings) }
      : undefined,
  }
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
  return listFacadeGroups(plan).find((g) => g.id === id)!
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
      nativeId: STAMP_NATIVE_GROUP_ID,
      groupMarker: STAMP_NATIVE_GROUP_ID,
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

/**
 * Workspace-download: verwijder catalogus én native gevel/stamp-markers op muren
 * (klant-FML zonder EPA/stempel).
 */
export function stripFacadeGroupsFromPlan(plan: FloorPlan): FloorPlan {
  const cloned = clonePlanForExport(plan)
  const settings = cloned.source?.settings
  if (settings && FACADE_GROUPS_SETTINGS_KEY in settings) {
    const nextSettings = { ...settings }
    delete nextSettings[FACADE_GROUPS_SETTINGS_KEY]
    cloned.source = { ...cloned.source!, settings: nextSettings }
  }
  for (const wall of collectPlanWalls(cloned)) {
    stripNativeMarkersOnWall(wall, 'all')
  }
  return cloned
}

/**
 * Editor-download: gevel-catalogus houden; stamp-catalogus weg; alle native
 * markers van muren strippen (extras-only product).
 */
export function stripStampGroupFromPlan(plan: FloorPlan): FloorPlan {
  const cloned = clonePlanForExport(plan)
  const groups = listFacadeGroups(cloned)
  const next = groups.filter((group) => group.id !== STAMP_FACADE_GROUP_ID)
  if (next.length === 0) {
    const settings = { ...(cloned.source?.settings ?? {}) }
    delete settings[FACADE_GROUPS_SETTINGS_KEY]
    cloned.source = cloned.source ? { ...cloned.source, settings } : { settings }
  } else {
    writeGroupsCatalogOnly(cloned, next)
  }
  for (const wall of collectPlanWalls(cloned)) {
    stripNativeMarkersOnWall(wall, 'all')
  }
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
  return listFacadeGroups(plan).find((g) => g.id === groupId) ?? null
}

/**
 * Voeg muren toe aan `groupId` (add, geen verplaatsen).
 * Andere gevelgroepen blijven; stamp ↔ gevel raken elkaar niet.
 */
export function assignWallsToGroup(
  plan: FloorPlan,
  groupId: string,
  wallGuids: readonly string[],
): FacadeGroup | null {
  const ids = normalizeWallGuids(wallGuids)
  if (ids.length === 0) return listFacadeGroups(plan).find((g) => g.id === groupId) ?? null

  const groups = listFacadeGroups(plan)
  if (!groups.some((group) => group.id === groupId)) return null

  const next = groups.map((group) => {
    if (group.id !== groupId) return group
    const merged = [...group.wallGuids]
    for (const id of ids) {
      if (!merged.includes(id)) merged.push(id)
    }
    return { ...group, wallGuids: merged }
  })
  writeGroups(plan, next)
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

/** Haal muren uit alle gevelgroepen; stamp-lidmaatschap blijft. */
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

/** Haal muren alleen uit één groep (gevel of stamp); overige lidmaatschappen blijven. */
export function detachWallsFromGroup(
  plan: FloorPlan,
  groupId: string,
  wallGuids: readonly string[],
): void {
  const idSet = new Set(normalizeWallGuids(wallGuids))
  if (idSet.size === 0) return
  const groups = listFacadeGroups(plan).map((group) => {
    if (group.id !== groupId) return group
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

function pushNativeRef(out: NativeGroupRef[], key: unknown, name?: unknown): void {
  const label = isNonEmptyString(name) ? name.trim() : undefined
  if (typeof key === 'number' && Number.isFinite(key)) {
    out.push({ key: String(Math.trunc(key)), name: label })
    return
  }
  if (isNonEmptyString(key)) out.push({ key: key.trim(), name: label })
}

function refsFromConfig(
  cfg: Record<string, unknown> | null,
  extraName?: unknown,
): NativeGroupRef[] {
  if (!cfg) return []
  const out: NativeGroupRef[] = []
  const name = cfg.name ?? extraName
  const gid = cfg.groupId
  if (Array.isArray(gid)) {
    for (const entry of gid) pushNativeRef(out, entry, name)
  } else {
    pushNativeRef(out, gid, name)
  }
  if (Array.isArray(cfg.groups)) {
    for (const raw of cfg.groups) {
      const rec = asRecord(raw)
      if (!rec) continue
      pushNativeRef(out, rec.groupId ?? rec.id, rec.name)
    }
  }
  return out
}

/** Lees Floorplanner-gevel-refs uit muur-extras (single + dual-probe-vormen). */
export function nativeGroupRefsFromWallExtras(extras: FmlExtras | undefined): NativeGroupRef[] {
  if (!extras) return []
  const out: NativeGroupRef[] = []
  const seen = new Set<string>()
  const add = (refs: NativeGroupRef[]) => {
    for (const ref of refs) {
      if (seen.has(ref.key)) continue
      seen.add(ref.key)
      out.push(ref)
    }
  }
  add(refsFromConfig(asRecord(extras.groupMarkerConfig)))
  if (Array.isArray(extras.groupMarkers)) {
    for (const raw of extras.groupMarkers) {
      const rec = asRecord(raw)
      if (!rec) continue
      add(refsFromConfig(asRecord(rec.groupMarkerConfig), rec.name))
    }
  }
  if (isNonEmptyString(extras.groupMarker) && !/^\d+$/.test(extras.groupMarker.trim())) {
    const marker = extras.groupMarker.trim()
    add([{ key: marker, name: marker }])
  }
  return out
}

function stampRefsFromWallExtras(extras: FmlExtras | undefined): NativeGroupRef[] {
  if (!extras) return []
  const cfg = asRecord(extras.groupMarkerConfig)
  if (!cfg) return []
  const out: NativeGroupRef[] = []
  pushNativeRef(out, cfg.stampGroupId, cfg.stampName)
  // Dual probe: groups[] entry named gevels / Stempel
  if (Array.isArray(cfg.groups)) {
    for (const raw of cfg.groups) {
      const rec = asRecord(raw)
      if (!rec) continue
      const name = isNonEmptyString(rec.name) ? rec.name.trim().toLowerCase() : ''
      if (name === 'gevels' || name === 'stempel' || name === STAMP_FACADE_GROUP_ID) {
        pushNativeRef(out, rec.groupId ?? rec.id, rec.name)
      }
    }
  }
  if (Array.isArray(extras.groupMarkers)) {
    for (const raw of extras.groupMarkers) {
      const rec = asRecord(raw)
      if (!rec) continue
      const inner = asRecord(rec.groupMarkerConfig)
      const name = isNonEmptyString(inner?.name)
        ? String(inner.name).trim().toLowerCase()
        : isNonEmptyString(rec.name)
          ? rec.name.trim().toLowerCase()
          : ''
      if (name === 'gevels' || name === 'stempel' || name === STAMP_FACADE_GROUP_ID) {
        pushNativeRef(out, inner?.groupId ?? rec.groupId, inner?.name ?? rec.name)
      }
    }
  }
  return out
}

function isStampName(name: string | undefined): boolean {
  if (!name) return false
  const n = name.trim().toLowerCase()
  return n === 'gevels' || n === 'stempel' || n === STAMP_FACADE_GROUP_ID
}

type WallFacadeHit = {
  guid: string
  nativeId?: number
  name?: string
  groupMarker?: number
}

/**
 * Eenmalige import-migratie: bouw catalogus vanuit muur-markers als extras leeg zijn.
 * Als `settings.facadeGroups` al bestaat → no-op (extras winnen).
 * Schrijft geen native markers terug op muren.
 */
export function hydrateFacadeGroupsFromNativeMarkers(plan: FloorPlan): FacadeGroup[] {
  const existing = listFacadeGroups(plan)
  if (existing.length > 0) return existing

  const alive = collectWallIds(plan)
  const walls = collectPlanWalls(plan)

  const facadeHits: WallFacadeHit[] = []
  const stampGuids: string[] = []
  let stampNativeId: number | undefined
  let stampName: string | undefined

  for (const wall of walls) {
    const guid = wall.id?.trim()
    if (!guid) continue
    const extras = wall.extras
    const cfg = asRecord(extras?.groupMarkerConfig)

    for (const ref of stampRefsFromWallExtras(extras)) {
      if (!stampGuids.includes(guid)) stampGuids.push(guid)
      const nid = parseOptionalNumber(ref.key)
      if (nid != null) stampNativeId = stampNativeId ?? nid
      if (ref.name) stampName = stampName ?? ref.name
    }

    const facadeRefs = nativeGroupRefsFromWallExtras(extras).filter((ref) => {
      if (isStampName(ref.name)) return false
      const nid = parseOptionalNumber(ref.key)
      if (nid != null && stampNativeId != null && nid === stampNativeId) return false
      // Skip stamp native id known constant when no name
      if (nid === STAMP_NATIVE_GROUP_ID && !ref.name) return false
      return true
    })

    // Primary: single groupId on config (not stamp-only wall)
    if (cfg) {
      const gid = parseOptionalNumber(Array.isArray(cfg.groupId) ? cfg.groupId[0] : cfg.groupId)
      const name = isNonEmptyString(cfg.name) ? cfg.name.trim() : undefined
      const marker = parseOptionalNumber(extras?.groupMarker)
      if (gid != null && !isStampName(name) && gid !== stampNativeId) {
        facadeHits.push({
          guid,
          nativeId: gid,
          name,
          groupMarker: marker,
        })
        continue
      }
      // groupId as name-string (T4 probe)
      if (isNonEmptyString(cfg.groupId) && !/^\d+$/.test(cfg.groupId.trim())) {
        const label = cfg.groupId.trim()
        if (!isStampName(label)) {
          facadeHits.push({
            guid,
            name: isNonEmptyString(cfg.name) ? cfg.name.trim() : label,
            groupMarker: marker,
          })
          continue
        }
      }
    }

    // Fallback dual refs: first non-stamp
    for (const ref of facadeRefs) {
      if (isStampName(ref.name)) continue
      facadeHits.push({
        guid,
        nativeId: parseOptionalNumber(ref.key),
        name: ref.name,
        groupMarker: parseOptionalNumber(extras?.groupMarker),
      })
      break
    }
  }

  // Cluster facade hits into groups by nativeId or name
  type Cluster = {
    nativeId?: number
    name?: string
    groupMarker?: number
    wallGuids: string[]
  }
  const clusters: Cluster[] = []

  const findCluster = (hit: WallFacadeHit): Cluster | undefined => {
    if (hit.nativeId != null) {
      const byId = clusters.find((c) => c.nativeId === hit.nativeId)
      if (byId) return byId
    }
    if (hit.name) {
      const lower = hit.name.toLowerCase()
      return clusters.find((c) => c.name?.toLowerCase() === lower)
    }
    return undefined
  }

  for (const hit of facadeHits) {
    let cluster = findCluster(hit)
    if (!cluster) {
      cluster = {
        nativeId: hit.nativeId,
        name: hit.name,
        groupMarker: hit.groupMarker,
        wallGuids: [],
      }
      clusters.push(cluster)
    } else {
      if (cluster.nativeId == null && hit.nativeId != null) cluster.nativeId = hit.nativeId
      if (!cluster.name && hit.name) cluster.name = hit.name
      if (cluster.groupMarker == null && hit.groupMarker != null) {
        cluster.groupMarker = hit.groupMarker
      }
    }
    if (!cluster.wallGuids.includes(hit.guid)) cluster.wallGuids.push(hit.guid)
  }

  const usedIds = new Set<string>()
  const nextGroups: FacadeGroup[] = []

  const matchExisting = (cluster: Cluster): FacadeGroup | undefined => {
    if (cluster.nativeId != null) {
      const byNative = existing.find(
        (g) => !isStampGroup(g) && g.nativeId === cluster.nativeId && !usedIds.has(g.id),
      )
      if (byNative) return byNative
    }
    if (cluster.name) {
      const lower = cluster.name.toLowerCase()
      const byName = existing.find(
        (g) => !isStampGroup(g) && g.name.toLowerCase() === lower && !usedIds.has(g.id),
      )
      if (byName) return byName
    }
    // Zelfde muur-GUID in oude catalogus → behoud G1-id (sync vult native).
    for (const guid of cluster.wallGuids) {
      const byMember = existing.find(
        (g) => !isStampGroup(g) && !usedIds.has(g.id) && g.wallGuids.includes(guid),
      )
      if (byMember) return byMember
    }
    return undefined
  }

  for (const cluster of clusters) {
    const prev = matchExisting(cluster)
    let finalId = prev?.id
    if (!finalId) {
      const taken = new Set([...usedIds, ...nextGroups.map((g) => g.id)])
      let n = 1
      while (taken.has(`G${n}`)) n += 1
      finalId = `G${n}`
    }
    usedIds.add(finalId)
    nextGroups.push({
      id: finalId,
      code: prev?.code ?? finalId,
      name: cluster.name ?? prev?.name ?? finalId,
      wallGuids: [...cluster.wallGuids],
      nativeId: cluster.nativeId ?? prev?.nativeId,
      groupMarker: cluster.groupMarker ?? prev?.groupMarker,
    })
  }

  // Fallback: catalogus-leden zonder native markers (oude FML)
  const claimed = new Set<string>()
  for (const g of nextGroups) {
    for (const id of g.wallGuids) claimed.add(id)
  }
  for (const prev of existing) {
    if (isStampGroup(prev)) continue
    if (usedIds.has(prev.id)) {
      // Merge leftover catalog guids that are alive and unclaimed
      const target = nextGroups.find((g) => g.id === prev.id)
      if (!target) continue
      for (const guid of prev.wallGuids) {
        if (!alive.has(guid) || claimed.has(guid)) continue
        target.wallGuids.push(guid)
        claimed.add(guid)
      }
      continue
    }
    const leftover = prev.wallGuids.filter((guid) => alive.has(guid) && !claimed.has(guid))
    if (leftover.length === 0) continue
    usedIds.add(prev.id)
    for (const guid of leftover) claimed.add(guid)
    nextGroups.push({
      ...prev,
      wallGuids: leftover,
    })
  }

  // Stamp
  const prevStamp = existing.find((g) => isStampGroup(g))
  const stampFromCatalog = (prevStamp?.wallGuids ?? []).filter(
    (guid) => alive.has(guid) && !stampGuids.includes(guid),
  )
  // Only keep catalog stamp fallback for walls that have no facade-native conflict handling
  for (const guid of stampFromCatalog) {
    // Wall without stamp marker but listed in old stamp catalog
    const wall = walls.find((w) => w.id === guid)
    const hasStampExtra = stampRefsFromWallExtras(wall?.extras).length > 0
    if (!hasStampExtra && !stampGuids.includes(guid)) stampGuids.push(guid)
  }

  if (stampGuids.length > 0 || prevStamp) {
    nextGroups.push({
      id: STAMP_FACADE_GROUP_ID,
      code: STAMP_FACADE_GROUP_ID,
      name: stampName ?? prevStamp?.name ?? STAMP_FACADE_GROUP_NAME,
      wallGuids: [...new Set(stampGuids)],
      nativeId: stampNativeId ?? prevStamp?.nativeId ?? STAMP_NATIVE_GROUP_ID,
      groupMarker: prevStamp?.groupMarker ?? stampNativeId ?? STAMP_NATIVE_GROUP_ID,
    })
  }

  if (nextGroups.length === 0) {
    // Niets op muren en geen catalogus
    return []
  }

  writeGroups(plan, removeEmptyGroups(nextGroups))
  return listFacadeGroups(plan)
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

function wallAxisDir(wall: Pick<Wall, 'a' | 'b'>): { ux: number; uy: number; len: number } | null {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len = Math.hypot(dx, dy)
  if (len <= 1e-6) return null
  return { ux: dx / len, uy: dy / len, len }
}

function pointLineDistCm(point: Point2D, origin: Point2D, ux: number, uy: number): number {
  return Math.abs((point.x - origin.x) * uy - (point.y - origin.y) * ux)
}

function projectAlongAxis(point: Point2D, origin: Point2D, ux: number, uy: number): number {
  return (point.x - origin.x) * ux + (point.y - origin.y) * uy
}

/**
 * Zelfde oneindige as (band) + overlap langs die as.
 * Junctions mogen de muur in andere stukken knippen; T-takken vallen af.
 */
function wallsShareFacadeAxis(
  seed: Pick<Wall, 'a' | 'b'>,
  cand: Pick<Wall, 'a' | 'b'>,
  epsCm: number,
): boolean {
  const seedAxis = wallAxisDir(seed)
  const candAxis = wallAxisDir(cand)
  if (!seedAxis || !candAxis) return false
  if (Math.abs(seedAxis.ux * candAxis.ux + seedAxis.uy * candAxis.uy) < STACKED_WALL_PARALLEL_DOT) {
    return false
  }
  if (pointLineDistCm(cand.a, seed.a, seedAxis.ux, seedAxis.uy) > epsCm) return false
  if (pointLineDistCm(cand.b, seed.a, seedAxis.ux, seedAxis.uy) > epsCm) return false
  const c0 = projectAlongAxis(cand.a, seed.a, seedAxis.ux, seedAxis.uy)
  const c1 = projectAlongAxis(cand.b, seed.a, seedAxis.ux, seedAxis.uy)
  const cMin = Math.min(c0, c1)
  const cMax = Math.max(c0, c1)
  return Math.max(0, cMin) <= Math.min(seedAxis.len, cMax) + epsCm
}

/**
 * Muren op andere verdiepingen op dezelfde as-band (niet per se dezelfde a/b).
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
        (seed) => seed.floorIndex !== floorIndex && wallsShareFacadeAxis(seed.wall, wall, epsCm),
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
