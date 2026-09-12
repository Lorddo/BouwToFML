/**
 * Nok-muren in een sibling Dak-design (niet in de plattegrond-graaf).
 * GUID-lijst in `plan.roof.ridge` (`.plg`). FML-adapter projecteert naar settings.ridgeWalls
 * — Floorplanner stript wall-extras.
 */
import { flushActiveDesign } from './design-sync'
import { detachWallsFromFacade, detachWallsFromStamp, type WallIdRemap } from './facade-groups'
import {
  DEFAULT_NOK_THICKNESS_CM,
  floorWallBaseWorldZ,
  nokWorldRange,
  readFloorStack,
  setFloorRidgeZCm,
  storedRidgeZCm,
} from './floor-stack'
import type {
  Floor,
  FloorDesign,
  FloorPlan,
  FmlExtras,
  Point2D,
  Wall,
} from './types'
import {
  endpointHeightCm,
  makeEndpoint3D,
  promoteWallElevationFromExtras,
  wallEndpoint3D,
  type WallEnd,
} from './wall-endpoint-height'

export const RIDGE_WALLS_SETTINGS_KEY = 'ridgeWalls'
export const RIDGE_DESIGN_NAME = 'Dak'
export const RIDGE_DESIGN_ROLE = 'ridge'
/** FML `design.settings`-key; waarde bewust `'btfRole'`. */
export const PLAN_ROLE_SETTINGS_KEY = 'btfRole'
export const DEFAULT_RIDGE_DISPLAY_WIDTH_CM = 10
export const RIDGE_WALL_EXTRA = 'ridge' as const

export type RidgeWallsSettings = {
  wallGuids: string[]
  displayWidthCm: number
}

function cloneSettings(settings: FmlExtras | undefined): FmlExtras {
  return { ...(settings ?? {}) }
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

function clampDisplayWidthCm(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_RIDGE_DISPLAY_WIDTH_CM
  }
  return Math.max(1, Math.min(80, Math.round(value)))
}

function parseRidgeSettings(raw: unknown): RidgeWallsSettings {
  if (!raw || typeof raw !== 'object') {
    return { wallGuids: [], displayWidthCm: DEFAULT_RIDGE_DISPLAY_WIDTH_CM }
  }
  const record = raw as Record<string, unknown>
  return {
    wallGuids: normalizeWallGuids(record.wallGuids),
    displayWidthCm: clampDisplayWidthCm(record.displayWidthCm),
  }
}

export function isRidgeDesign(design: FloorDesign | null | undefined): boolean {
  if (!design) return false
  if (design.role === RIDGE_DESIGN_ROLE) return true
  const role = design.source?.settings?.[PLAN_ROLE_SETTINGS_KEY]
  if (role === RIDGE_DESIGN_ROLE) return true
  return design.name.trim().toLowerCase() === RIDGE_DESIGN_NAME.toLowerCase()
}

export function readRidgeWallsSettings(plan: FloorPlan | null | undefined): RidgeWallsSettings {
  if (plan?.roof?.ridge) return parseRidgeSettings(plan.roof.ridge)
  return parseRidgeSettings(plan?.source?.settings?.[RIDGE_WALLS_SETTINGS_KEY])
}

function writeRidgeWallsSettings(plan: FloorPlan, next: RidgeWallsSettings): void {
  // Nieuwe roof-object zodat shallow-copied plans hun oude ridge behouden.
  plan.roof = {
    ridge: {
      wallGuids: [...next.wallGuids],
      displayWidthCm: clampDisplayWidthCm(next.displayWidthCm),
    },
    planes: plan.roof?.planes ?? { surfaceGuids: [] },
    stack: plan.roof?.stack ?? { nokThicknessCm: DEFAULT_NOK_THICKNESS_CM, floors: [] },
  }
  const source = plan.source
  if (source?.settings && RIDGE_WALLS_SETTINGS_KEY in source.settings) {
    const settings = cloneSettings(source.settings)
    delete settings[RIDGE_WALLS_SETTINGS_KEY]
    source.settings = settings
  }
}

export function ridgeDisplayWidthCm(plan: FloorPlan | null | undefined): number {
  return readRidgeWallsSettings(plan).displayWidthCm
}

export function setRidgeDisplayWidthCm(plan: FloorPlan, widthCm: number): FloorPlan {
  const current = readRidgeWallsSettings(plan)
  writeRidgeWallsSettings(plan, {
    ...current,
    displayWidthCm: clampDisplayWidthCm(widthCm),
  })
  return plan
}

/** Alleen als het plan nog geen expliciete `displayWidthCm` heeft. */
export function seedRidgeDisplayWidthIfMissing(plan: FloorPlan, widthCm: number): FloorPlan {
  if (plan.roof?.ridge && 'displayWidthCm' in plan.roof.ridge) return plan
  const raw = plan.source?.settings?.[RIDGE_WALLS_SETTINGS_KEY]
  if (raw && typeof raw === 'object' && 'displayWidthCm' in raw) return plan
  return setRidgeDisplayWidthCm(plan, widthCm)
}

export function isRidgeWallId(plan: FloorPlan | null | undefined, wallGuid: string): boolean {
  const id = wallGuid.trim()
  if (!id) return false
  if (readRidgeWallsSettings(plan).wallGuids.includes(id)) return true
  if (!plan) return false
  for (const floor of plan.floors) {
    const design = floor.designs?.find(isRidgeDesign)
    if (design?.walls.some((wall) => wall.id === id)) return true
  }
  return false
}

export function isRidgeWall(wall: Pick<Wall, 'extras' | 'role'> | null | undefined): boolean {
  if (wall?.role === RIDGE_DESIGN_ROLE) return true
  return wall?.extras?.[RIDGE_WALL_EXTRA] === true
}

export function findRidgeDesignIndex(floor: Floor): number {
  const designs = floor.designs
  if (!designs) return -1
  return designs.findIndex(isRidgeDesign)
}

/** Floors met plattegrondmuren — elk heeft (of krijgt) een eigen Dak-design. */
export function listDakDesignFloors(
  plan: FloorPlan | null | undefined,
): Array<{ floorIndex: number; name: string }> {
  if (!plan) return []
  return plan.floors.flatMap((floor, floorIndex) =>
    floor.walls.some((wall) => wall.thickness > 1e-6) ? [{ floorIndex, name: floor.name }] : [],
  )
}

/** Floor met Dak-inhoud (nok/vlakken); anders eerste lege Dak-design. */
export function findRidgeDesignFloorIndex(plan: FloorPlan | null | undefined): number {
  if (!plan) return -1
  const withContent = plan.floors.findIndex((floor) => {
    const index = findRidgeDesignIndex(floor)
    if (index < 0) return false
    const design = floor.designs?.[index]
    return (design?.walls.length ?? 0) > 0 || (design?.surfaces?.length ?? 0) > 0
  })
  if (withContent >= 0) return withContent
  return plan.floors.findIndex((floor) => findRidgeDesignIndex(floor) >= 0)
}

export function listRidgeWallsOnFloor(floor: Floor | null | undefined): Wall[] {
  if (!floor) return []
  const index = findRidgeDesignIndex(floor)
  if (index < 0) return []
  return [...(floor.designs?.[index]?.walls ?? [])]
}

export function listRidgeWallsOnPlan(plan: FloorPlan | null | undefined): Wall[] {
  if (!plan) return []
  return plan.floors.flatMap((floor) => listRidgeWallsOnFloor(floor))
}

export function collectRidgeWallIdsOnPlan(plan: FloorPlan | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const wall of listRidgeWallsOnPlan(plan)) {
    const id = wall.id?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Schrijf GUID-lijst uit de Dak-designs (import / na mutate). */
export function syncRidgeWallGuidsFromDesigns(plan: FloorPlan): string[] {
  const current = readRidgeWallsSettings(plan)
  const wallGuids = collectRidgeWallIdsOnPlan(plan)
  writeRidgeWallsSettings(plan, { ...current, wallGuids })
  return wallGuids
}

export function assignRidgeWallGuids(plan: FloorPlan, wallGuids: readonly string[]): void {
  const current = readRidgeWallsSettings(plan)
  const merged = [...current.wallGuids]
  for (const id of normalizeWallGuids(wallGuids)) {
    if (!merged.includes(id)) merged.push(id)
  }
  writeRidgeWallsSettings(plan, { ...current, wallGuids: merged })
}

export function detachRidgeWallGuids(plan: FloorPlan, wallGuids: readonly string[]): void {
  const idSet = new Set(normalizeWallGuids(wallGuids))
  if (idSet.size === 0) return
  const current = readRidgeWallsSettings(plan)
  writeRidgeWallsSettings(plan, {
    ...current,
    wallGuids: current.wallGuids.filter((id) => !idSet.has(id)),
  })
}

export function applyRidgeWallRemaps(plan: FloorPlan, remaps: readonly WallIdRemap[]): void {
  if (remaps.length === 0) return
  const current = readRidgeWallsSettings(plan)
  let next = [...current.wallGuids]
  for (const remap of remaps) {
    const from = remap.fromId.trim()
    if (!from) continue
    const replacements = normalizeWallGuids(remap.intoIds)
    const index = next.indexOf(from)
    if (index < 0) continue
    const seen = new Set<string>()
    const rebuilt: string[] = []
    for (const id of next) {
      if (id === from) {
        for (const replacement of replacements) {
          if (seen.has(replacement)) continue
          seen.add(replacement)
          rebuilt.push(replacement)
        }
        continue
      }
      if (seen.has(id)) continue
      seen.add(id)
      rebuilt.push(id)
    }
    next = rebuilt
  }
  writeRidgeWallsSettings(plan, { ...current, wallGuids: next })
}

export function pruneRidgeWalls(plan: FloorPlan): string[] {
  return syncRidgeWallGuidsFromDesigns(plan)
}

function emptyRidgeDesign(): FloorDesign {
  return {
    name: RIDGE_DESIGN_NAME,
    walls: [],
    surfaces: [],
    role: RIDGE_DESIGN_ROLE,
    source: { settings: { engineAutoDims: false } },
  }
}

/**
 * Zorg dat het Dak-design bestaat. Alleen FML-editor / aanzichten
 * (`createBlankFloor`, import, Dak-tab). Niet aanroepen vanuit detectie
 * (`extractionToPlan`) — die flush schreef ooit ruwe L10-muren in designs[0].
 *
 * Schrijft actieve plat-velden eerst terug zodat design 0 niet wordt
 * overschreven.
 */
export function ensureRidgeDesign(floor: Floor): { floor: Floor; designIndex: number } {
  const flushed = flushActiveDesign(floor)
  const existing = findRidgeDesignIndex(flushed)
  if (existing >= 0) return { floor: flushed, designIndex: existing }
  const designs = [...(flushed.designs ?? []), emptyRidgeDesign()]
  return {
    floor: { ...flushed, designs },
    designIndex: designs.length - 1,
  }
}

/** Sibling Dak-design op elke verdieping (platte daken zonder nok). */
export function ensureRidgeDesignsOnPlan(plan: FloorPlan): FloorPlan {
  let changed = false
  const floors = plan.floors.map((floor) => {
    if (findRidgeDesignIndex(floor) >= 0) return floor
    changed = true
    return ensureRidgeDesign(floor).floor
  })
  return changed ? { ...plan, floors } : plan
}

export function setRidgeWallsOnFloor(floor: Floor, walls: Wall[]): Floor {
  const ensured = ensureRidgeDesign(floor)
  const designs = (ensured.floor.designs ?? []).map((design, index) =>
    index === ensured.designIndex ? { ...design, walls } : design,
  )
  return { ...ensured.floor, designs }
}

/** Drop leeg Dak-design (export). */
export function dropEmptyRidgeDesign(floor: Floor): Floor {
  const designs = floor.designs
  if (!designs || designs.length === 0) return floor
  const next = designs.filter(
    (design) =>
      !isRidgeDesign(design) || design.walls.length > 0 || (design.surfaces?.length ?? 0) > 0,
  )
  if (next.length === designs.length) return floor
  const active = floor.activeDesignIndex ?? 0
  return {
    ...floor,
    designs: next.length > 0 ? next : undefined,
    activeDesignIndex: Math.min(active, Math.max(0, next.length - 1)),
  }
}

export function dropEmptyRidgeDesignsFromPlan(plan: FloorPlan): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor) => dropEmptyRidgeDesign(floor)),
  }
}

export function ridgeEndpointExtras(
  floorHeightCm: number,
  dakThicknessCm: number,
  zCm?: number,
): Wall['extras'] {
  const z = Math.max(0, Math.round(zCm ?? floorHeightCm))
  const span = Math.max(
    1,
    Math.round(dakThicknessCm > 0 ? dakThicknessCm : DEFAULT_NOK_THICKNESS_CM),
  )
  const end = makeEndpoint3D(z, span)
  // az/bz tijdelijk in extras; markWallAsRidge / addSegmentPath promoveert naar elevation.
  return { az: end, bz: { ...end }, [RIDGE_WALL_EXTRA]: true }
}

/** Onderkant nok (`elevation.a/b`.z) t.o.v. verdiepingsvloer. */
export function ridgeEndpointZCm(wall: Wall, end: WallEnd, floorHeightCm: number): number {
  return wallEndpoint3D(wall, end, floorHeightCm).z
}

function withRidgeEndpointZ(wall: Wall, end: WallEnd, zCm: number, floorHeightCm: number): Wall {
  const current = wallEndpoint3D(wall, end, floorHeightCm)
  const span = Math.max(1, Math.round(endpointHeightCm(current) || DEFAULT_NOK_THICKNESS_CM))
  const next = makeEndpoint3D(Math.max(0, Math.round(zCm)), span)
  const other = wallEndpoint3D(wall, end === 'a' ? 'b' : 'a', floorHeightCm)
  const extras = { ...(wall.extras ?? {}) }
  delete extras.az
  delete extras.bz
  delete extras[RIDGE_WALL_EXTRA]
  return {
    ...wall,
    role: RIDGE_DESIGN_ROLE,
    elevation: {
      a: end === 'a' ? next : other,
      b: end === 'a' ? other : next,
    },
    extras: Object.keys(extras).length > 0 ? extras : undefined,
  }
}

/** Onderkant nok in world-Z (plaat + verdiepingen eronder + `az.z`). */
export function ridgeWorldBottomZ(
  plan: FloorPlan,
  floorIndex: number,
  wall: Wall,
  end: WallEnd = 'a',
): number {
  const floor = plan.floors[floorIndex]
  if (!floor) return 0
  return floorWallBaseWorldZ(plan, floorIndex) + ridgeEndpointZCm(wall, end, floor.height)
}

/** Default nok-z van een floor: opgeslagen default, anders floor.height. */
export function ridgeDefaultZCm(plan: FloorPlan, floorIndex: number): number {
  const floor = plan.floors[floorIndex]
  if (!floor) return 0
  const stored = storedRidgeZCm(readFloorStack(plan), floor.level)
  if (stored != null) return stored
  return Math.round(floor.height)
}

/** Zet default + alle nokken van één floor (niet world-Z van andere floors). */
export function setFloorRidgeHeights(plan: FloorPlan, floorIndex: number, zCm: number): FloorPlan {
  const floor = plan.floors[floorIndex]
  if (!floor) return plan
  const z = Math.max(0, Math.round(zCm))
  const withDefault = setFloorRidgeZCm(plan, floor.level, z)
  const target = withDefault.floors[floorIndex]
  if (!target) return withDefault
  const ridges = listRidgeWallsOnFloor(target)
  if (ridges.length === 0) return withDefault
  const next = setRidgeWallsZ(
    ridges,
    ridges.map((wall) => wall.id),
    z,
    target.height,
  )
  return {
    ...withDefault,
    floors: withDefault.floors.map((entry, index) =>
      index === floorIndex ? setRidgeWallsOnFloor(entry, next) : entry,
    ),
  }
}

/** Relatieve nok-z t.o.v. `targetFloor` vanuit een draft op `sourceFloor`. */
export function ridgeZForTargetFloor(
  plan: FloorPlan,
  sourceFloorIndex: number,
  zRelSourceCm: number | undefined,
  targetFloorIndex: number,
): number {
  const target = plan.floors[targetFloorIndex]
  const source = plan.floors[sourceFloorIndex]
  if (!target) return 0
  if (
    zRelSourceCm == null ||
    !Number.isFinite(zRelSourceCm) ||
    sourceFloorIndex === targetFloorIndex
  ) {
    return Math.max(0, Math.round(zRelSourceCm ?? target.height))
  }
  if (!source) return Math.round(target.height)
  const world = floorWallBaseWorldZ(plan, sourceFloorIndex) + zRelSourceCm
  const rel = Math.round(world - floorWallBaseWorldZ(plan, targetFloorIndex))
  if (rel < 0) return Math.round(target.height)
  return rel
}

/** Zelfde world-Z onderkant voor de gegeven nokken; opslag blijft floor-relatief. */
export function overwriteRidgeWorldBottomZ(
  plan: FloorPlan,
  worldZCm: number,
  wallIds?: Iterable<string>,
): FloorPlan {
  const world = Math.max(0, Math.round(worldZCm))
  const idSet = wallIds ? new Set([...wallIds].map((id) => id.trim()).filter(Boolean)) : null
  let changed = false
  const floors = plan.floors.map((floor, floorIndex) => {
    const ridges = listRidgeWallsOnFloor(floor)
    const targets = idSet ? ridges.filter((wall) => idSet.has(wall.id)) : ridges
    if (targets.length === 0) return floor
    const zRel = Math.max(0, world - floorWallBaseWorldZ(plan, floorIndex))
    const next = setRidgeWallsZ(
      ridges,
      targets.map((wall) => wall.id),
      zRel,
      floor.height,
    )
    changed = true
    return setRidgeWallsOnFloor(floor, next)
  })
  return changed ? { ...plan, floors } : plan
}

export function setRidgeWallsZ(
  walls: Wall[],
  wallIds: Iterable<string>,
  zCm: number,
  floorHeightCm: number,
): Wall[] {
  const idSet = new Set(wallIds)
  if (idSet.size === 0) return walls
  let changed = false
  const next = walls.map((wall) => {
    if (!idSet.has(wall.id)) return wall
    changed = true
    let updated = withRidgeEndpointZ(wall, 'a', zCm, floorHeightCm)
    updated = withRidgeEndpointZ(updated, 'b', zCm, floorHeightCm)
    return updated
  })
  return changed ? next : walls
}

function withRidgeDakSpan(wall: Wall, spanCm: number, floorHeightCm: number): Wall {
  const span = Math.max(1, Math.round(spanCm > 0 ? spanCm : DEFAULT_NOK_THICKNESS_CM))
  const az = wallEndpoint3D(wall, 'a', floorHeightCm)
  const bz = wallEndpoint3D(wall, 'b', floorHeightCm)
  const extras = { ...(wall.extras ?? {}) }
  delete extras.az
  delete extras.bz
  delete extras[RIDGE_WALL_EXTRA]
  return {
    ...wall,
    role: RIDGE_DESIGN_ROLE,
    elevation: {
      a: makeEndpoint3D(az.z, span),
      b: makeEndpoint3D(bz.z, span),
    },
    extras: Object.keys(extras).length > 0 ? extras : undefined,
  }
}

/** Overschrijf dakspan (`h − z`) van bestaande nokken; onderkant blijft. */
export function overwriteRidgeDakThickness(plan: FloorPlan, thicknessCm: number): FloorPlan {
  const span = Math.max(1, Math.round(thicknessCm > 0 ? thicknessCm : DEFAULT_NOK_THICKNESS_CM))
  let changed = false
  const floors = plan.floors.map((floor) => {
    const ridges = listRidgeWallsOnFloor(floor)
    if (ridges.length === 0) return floor
    const next = ridges.map((wall) => withRidgeDakSpan(wall, span, floor.height))
    changed = true
    return setRidgeWallsOnFloor(floor, next)
  })
  return changed ? { ...plan, floors } : plan
}

/** Verwijder nok-muren uit het Dak-design + GUID-lijst. Plattegrondmuren blijven. */
export function removeRidgeWallsFromPlan(plan: FloorPlan, wallIds: readonly string[]): FloorPlan {
  const idSet = new Set(wallIds.map((id) => id.trim()).filter(Boolean))
  if (idSet.size === 0) return plan
  let changed = false
  const floors = plan.floors.map((floor) => {
    const current = listRidgeWallsOnFloor(floor)
    const next = current.filter((wall) => !idSet.has(wall.id))
    if (next.length === current.length) return floor
    changed = true
    return setRidgeWallsOnFloor(floor, next)
  })
  if (!changed) return plan
  const next: FloorPlan = {
    ...plan,
    floors,
    source: plan.source
      ? { ...plan.source, settings: { ...(plan.source.settings ?? {}) } }
      : plan.source,
  }
  pruneRidgeWalls(next)
  return next
}

/** Zet nok-uiteinden op één floor (sibling Dak-design). */
export function setPlanRidgeJunctionZ(
  plan: FloorPlan,
  floorIndex: number,
  refs: ReadonlyArray<{ wallId: string; end: WallEnd }>,
  zCm: number,
): FloorPlan {
  const floor = plan.floors[floorIndex]
  if (!floor) return plan
  const ridges = listRidgeWallsOnFloor(floor)
  const next = setRidgeJunctionZ(ridges, refs, zCm, floor.height)
  if (next === ridges) return plan
  return {
    ...plan,
    floors: plan.floors.map((entry, index) =>
      index === floorIndex ? setRidgeWallsOnFloor(entry, next) : entry,
    ),
  }
}

/** Vervang XY + z/span van één nok in het Dak-design. */
export function setRidgeWallPlanPose(
  plan: FloorPlan,
  floorIndex: number,
  wallId: string,
  pose: { a: Point2D; b: Point2D; zA: number; zB: number; spanCm: number },
): FloorPlan {
  const floor = plan.floors[floorIndex]
  if (!floor) return plan
  const ridges = listRidgeWallsOnFloor(floor)
  const index = ridges.findIndex((item) => item.id === wallId)
  const current = ridges[index]
  if (!current) return plan
  const span = Math.max(1, Math.round(pose.spanCm))
  const extras = { ...(current.extras ?? {}) }
  delete extras.az
  delete extras.bz
  delete extras[RIDGE_WALL_EXTRA]
  const nextWall: Wall = {
    ...current,
    a: { x: pose.a.x, y: pose.a.y },
    b: { x: pose.b.x, y: pose.b.y },
    role: RIDGE_DESIGN_ROLE,
    elevation: {
      a: makeEndpoint3D(Math.max(0, Math.round(pose.zA)), span),
      b: makeEndpoint3D(Math.max(0, Math.round(pose.zB)), span),
    },
    extras: Object.keys(extras).length > 0 ? extras : undefined,
  }
  const next = ridges.slice()
  next[index] = nextWall
  return {
    ...plan,
    floors: plan.floors.map((entry, i) =>
      i === floorIndex ? setRidgeWallsOnFloor(entry, next) : entry,
    ),
  }
}

export function setRidgeJunctionZ(
  walls: Wall[],
  refs: ReadonlyArray<{ wallId: string; end: WallEnd }>,
  zCm: number,
  floorHeightCm: number,
): Wall[] {
  if (refs.length === 0) return walls
  const byWall = new Map<string, WallEnd[]>()
  for (const ref of refs) {
    const list = byWall.get(ref.wallId) ?? []
    list.push(ref.end)
    byWall.set(ref.wallId, list)
  }
  let changed = false
  const next = walls.map((wall) => {
    const ends = byWall.get(wall.id)
    if (!ends || ends.length === 0) return wall
    changed = true
    let updated = wall
    for (const end of ends) {
      updated = withRidgeEndpointZ(updated, end, zCm, floorHeightCm)
    }
    return updated
  })
  return changed ? next : walls
}

/** Nok-band: volgt getekende nokken; anders stack-placeholder. */
export function ridgeAwareNokWorldRange(plan: FloorPlan): { z0: number; z1: number } {
  let ridgeBottom: number | null = null
  let ridgeTop: number | null = null
  plan.floors.forEach((floor, floorIndex) => {
    const base = floorWallBaseWorldZ(plan, floorIndex)
    for (const wall of listRidgeWallsOnFloor(floor)) {
      const az = wallEndpoint3D(wall, 'a', floor.height)
      const bz = wallEndpoint3D(wall, 'b', floor.height)
      const lo = base + Math.min(az.z, bz.z)
      const hi = base + Math.max(az.h, bz.h)
      ridgeBottom = ridgeBottom == null ? lo : Math.min(ridgeBottom, lo)
      ridgeTop = ridgeTop == null ? hi : Math.max(ridgeTop, hi)
    }
  })
  if (ridgeBottom != null && ridgeTop != null) return { z0: ridgeBottom, z1: ridgeTop }
  return nokWorldRange(plan)
}

export function dakThicknessCmForPlan(plan: FloorPlan | null | undefined): number {
  const stack = plan ? readFloorStack(plan) : null
  return stack?.nokThicknessCm ?? DEFAULT_NOK_THICKNESS_CM
}

export function markWallAsRidge(wall: Wall, extras?: Wall['extras']): Wall {
  const merged = { ...(wall.extras ?? {}), ...(extras ?? {}) }
  delete merged[RIDGE_WALL_EXTRA]
  const fallbackH =
    wall.elevation?.a != null ? endpointHeightCm(wall.elevation.a) || 280 : 280
  const fromExtras = promoteWallElevationFromExtras(merged, fallbackH)
  return {
    ...wall,
    thickness: 0,
    openings: [],
    role: RIDGE_DESIGN_ROLE,
    elevation: fromExtras.elevation ?? wall.elevation,
    extras: fromExtras.extras,
  }
}

export function unmarkWallAsRidge(wall: Wall, thicknessCm: number, floorHeightCm: number): Wall {
  const extras = { ...(wall.extras ?? {}) }
  delete extras[RIDGE_WALL_EXTRA]
  delete extras.az
  delete extras.bz
  const end = makeEndpoint3D(0, floorHeightCm)
  const { role: _role, ...rest } = wall
  void _role
  return {
    ...rest,
    thickness: Math.max(1, Math.round(thicknessCm)),
    elevation: { a: end, b: { ...end } },
    extras: Object.keys(extras).length > 0 ? extras : undefined,
  }
}

/** Filter ridge-GUIDs uit een assign-lijst (gevel/stamp). */
export function rejectRidgeGuids(
  plan: FloorPlan | null | undefined,
  wallGuids: readonly string[],
): string[] {
  return wallGuids.filter((id) => !isRidgeWallId(plan, id))
}

export function detachRidgeFromPlanGroups(plan: FloorPlan, wallGuids: readonly string[]): void {
  detachWallsFromFacade(plan, wallGuids)
  detachWallsFromStamp(plan, wallGuids)
}
