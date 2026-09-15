import { DEFAULT_WALL_HEIGHT_CM } from './extraction-to-plan-types'
import type { Floor, FloorDesign, FloorPlan, PlanExtras, Opening, Wall } from './types'

/** Floorplanner endpoint elevations (bottom z + top h). */
export interface Endpoint3D {
  z: number
  h: number
}

export type WallEnd = 'a' | 'b'

const HEIGHT_EPS_CM = 0.05

function clampHeightCm(heightCm: number): number {
  if (!Number.isFinite(heightCm) || heightCm <= 0) return DEFAULT_WALL_HEIGHT_CM
  return Math.round(heightCm)
}

function clampNonNeg(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return value
}

/** Parse Floorplanner `{z,h}`; missing/invalid → `{ z: 0, h: fallbackHeightCm }`. */
export function parseEndpoint3D(raw: unknown, fallbackHeightCm: number): Endpoint3D {
  const fallback = clampHeightCm(fallbackHeightCm)
  if (raw == null || typeof raw !== 'object') return { z: 0, h: fallback }
  const obj = raw as Record<string, unknown>
  const z = typeof obj.z === 'number' && Number.isFinite(obj.z) ? obj.z : 0
  const h = typeof obj.h === 'number' && Number.isFinite(obj.h) ? obj.h : z + fallback
  return { z, h }
}

export function makeEndpoint3D(bottomZ: number, heightCm: number): Endpoint3D {
  const z = clampNonNeg(bottomZ)
  const height = clampHeightCm(heightCm)
  return { z, h: z + height }
}

export function endpointHeightCm(endpoint: Endpoint3D): number {
  return Math.max(0, endpoint.h - endpoint.z)
}

function rawEndpoint(wall: Wall, end: WallEnd): unknown {
  // Legacy extras wint bij dual-state (split vóór promote); anders typed elevation.
  const key = end === 'a' ? 'az' : 'bz'
  if (wall.extras?.[key] != null) return wall.extras[key]
  return end === 'a' ? wall.elevation?.a : wall.elevation?.b
}

export function wallEndpoint3D(wall: Wall, end: WallEnd, floorHeightCm: number): Endpoint3D {
  return parseEndpoint3D(rawEndpoint(wall, end), floorHeightCm)
}

/** Effectieve muurhoogte op één uiteinde (`h - z`). */
export function wallEndpointHeightCm(wall: Wall, end: WallEnd, floorHeightCm: number): number {
  return endpointHeightCm(wallEndpoint3D(wall, end, floorHeightCm))
}

/**
 * Elevatie van één knoop: alleen de wall-ends op die knoop.
 * Eén waarde (eerste eind), ook als aangesloten muren verderop een andere hoogte hebben.
 */
export function readJunctionElevation(
  walls: ReadonlyArray<Wall>,
  refs: ReadonlyArray<{ wallId: string; end: WallEnd }>,
  floorHeightCm: number,
): { heightCm: number; bottomZCm: number } | null {
  for (const ref of refs) {
    const wall = walls.find((item) => item.id === ref.wallId)
    if (!wall) continue
    return {
      heightCm: Math.round(wallEndpointHeightCm(wall, ref.end, floorHeightCm)),
      bottomZCm: Math.round(wallEndpoint3D(wall, ref.end, floorHeightCm).z),
    }
  }
  return null
}

/** Uniforme hoogte over beide ends; anders null (mixed). */
export function wallUniformHeightCm(wall: Wall, floorHeightCm: number): number | null {
  const a = wallEndpointHeightCm(wall, 'a', floorHeightCm)
  const b = wallEndpointHeightCm(wall, 'b', floorHeightCm)
  if (Math.abs(a - b) > HEIGHT_EPS_CM) return null
  return Math.round((a + b) / 2)
}

/** Uniforme muurbodem `z` over beide ends; anders null (mixed). */
export function wallUniformBottomZCm(wall: Wall, floorHeightCm: number): number | null {
  const a = wallEndpoint3D(wall, 'a', floorHeightCm).z
  const b = wallEndpoint3D(wall, 'b', floorHeightCm).z
  if (Math.abs(a - b) > HEIGHT_EPS_CM) return null
  return Math.round((a + b) / 2)
}

/** Aanzicht-greep: hoogte (z vast), lift (z, h vast), shift (z+h mee). */
export type WallElevationEditMode = 'height' | 'lift' | 'shift'

function cloneExtras(extras: PlanExtras | undefined): PlanExtras | undefined {
  if (!extras) return undefined
  return { ...extras }
}

function stripEndpointKeys(extras: PlanExtras | undefined): PlanExtras | undefined {
  if (!extras) return undefined
  if (extras.az == null && extras.bz == null) return extras
  const next = { ...extras }
  delete next.az
  delete next.bz
  return Object.keys(next).length > 0 ? next : undefined
}

/**
 * Haal az/bz uit extras naar typed elevation (voor split-/draw-constructors).
 * Ontbrekende ends krijgen `parseEndpoint3D`-fallback.
 */
export function promoteWallElevationFromExtras(
  extras: PlanExtras | undefined,
  fallbackHeightCm: number = DEFAULT_WALL_HEIGHT_CM,
): { extras: PlanExtras | undefined; elevation?: { a: Endpoint3D; b: Endpoint3D } } {
  if (!extras) return { extras: undefined }
  const hasAz = extras.az != null
  const hasBz = extras.bz != null
  if (!hasAz && !hasBz) return { extras }

  const fallback =
    typeof extras.az === 'object' &&
    extras.az != null &&
    typeof (extras.az as Endpoint3D).h === 'number'
      ? endpointHeightCm(extras.az as Endpoint3D)
      : typeof extras.bz === 'object' &&
          extras.bz != null &&
          typeof (extras.bz as Endpoint3D).h === 'number'
        ? endpointHeightCm(extras.bz as Endpoint3D)
        : fallbackHeightCm

  const elevation = {
    a: parseEndpoint3D(extras.az, fallback),
    b: parseEndpoint3D(extras.bz, fallback),
  }
  return { extras: stripEndpointKeys(extras), elevation }
}

function writeBothEndpoints(wall: Wall, az: Endpoint3D, bz: Endpoint3D): Wall {
  return {
    ...wall,
    elevation: { a: az, b: bz },
    extras: stripEndpointKeys(cloneExtras(wall.extras)),
  }
}

/** Zet beide einden op dezelfde bodem; behoudt hoogte per eind (`h − z`). */
export function withWallUniformBottomZ(wall: Wall, bottomZ: number, floorHeightCm: number): Wall {
  const z = clampNonNeg(Math.round(bottomZ))
  const a = wallEndpoint3D(wall, 'a', floorHeightCm)
  const b = wallEndpoint3D(wall, 'b', floorHeightCm)
  return writeBothEndpoints(
    wall,
    makeEndpoint3D(z, endpointHeightCm(a)),
    makeEndpoint3D(z, endpointHeightCm(b)),
  )
}

/** Onderkant wijzigen met vaste bovenkant (`h`); hoogte krimpt/groeit. */
export function withWallBottomKeepTop(wall: Wall, bottomZ: number, floorHeightCm: number): Wall {
  const z = clampNonNeg(Math.round(bottomZ))
  const a = wallEndpoint3D(wall, 'a', floorHeightCm)
  const b = wallEndpoint3D(wall, 'b', floorHeightCm)
  const az = { z, h: Math.max(z + 1, Math.round(a.h)) }
  const bz = { z, h: Math.max(z + 1, Math.round(b.h)) }
  return writeBothEndpoints(wall, az, bz)
}

/** Hele muur omhoog/omlaag: delta op `z` én `h` (hoogte gelijk; scheve top blijft). */
export function withWallElevationShift(wall: Wall, deltaZ: number, floorHeightCm: number): Wall {
  const delta = Math.round(deltaZ)
  if (delta === 0) return wall
  const a = wallEndpoint3D(wall, 'a', floorHeightCm)
  const b = wallEndpoint3D(wall, 'b', floorHeightCm)
  const nextA = makeEndpoint3D(Math.max(0, a.z + delta), endpointHeightCm(a))
  const nextB = makeEndpoint3D(Math.max(0, b.z + delta), endpointHeightCm(b))
  // Als clamp op z=0 de delta inkort, behoud relatieve hoogte (niet onder vloer).
  return writeBothEndpoints(wall, nextA, nextB)
}

/** Eén endpoint-schrijver voor aanzicht-grepen (uniforme z op beide einden). */
export function withWallElevationEdit(
  wall: Wall,
  mode: WallElevationEditMode,
  targetCm: number,
  floorHeightCm: number,
): Wall {
  if (mode === 'height') {
    return withWallUniformHeight(wall, targetCm, floorHeightCm)
  }
  if (mode === 'lift') {
    return withWallBottomKeepTop(wall, targetCm, floorHeightCm)
  }
  const current = wallUniformBottomZCm(wall, floorHeightCm)
  const fromZ =
    current ??
    Math.round(
      (wallEndpoint3D(wall, 'a', floorHeightCm).z + wallEndpoint3D(wall, 'b', floorHeightCm).z) / 2,
    )
  return withWallElevationShift(wall, Math.round(targetCm) - fromZ, floorHeightCm)
}

export function interpolateEndpoint3D(az: Endpoint3D, bz: Endpoint3D, t: number): Endpoint3D {
  const u = Math.min(1, Math.max(0, t))
  return {
    z: az.z + (bz.z - az.z) * u,
    h: az.h + (bz.h - az.h) * u,
  }
}

/** Muurbodem `z` en muurtop `h` op opening-parameter `t` (Floorplanner-elevatie). */
export function wallElevationAtT(wall: Wall, t: number, floorHeightCm: number): Endpoint3D {
  return interpolateEndpoint3D(
    wallEndpoint3D(wall, 'a', floorHeightCm),
    wallEndpoint3D(wall, 'b', floorHeightCm),
    t,
  )
}

/** Schrijf één endpoint-hoogte; behoudt bestaande `z`, zet `h = z + heightCm`. */
export function withWallEndpointHeight(
  wall: Wall,
  end: WallEnd,
  heightCm: number,
  floorHeightCm: number,
): Wall {
  const current = wallEndpoint3D(wall, end, floorHeightCm)
  const next = makeEndpoint3D(current.z, heightCm)
  const other = wallEndpoint3D(wall, end === 'a' ? 'b' : 'a', floorHeightCm)
  return writeBothEndpoints(
    wall,
    end === 'a' ? next : other,
    end === 'a' ? other : next,
  )
}

function writeWallEndpoint(
  wall: Wall,
  end: WallEnd,
  next: Endpoint3D,
  floorHeightCm: number,
): Wall {
  const other = wallEndpoint3D(wall, end === 'a' ? 'b' : 'a', floorHeightCm)
  return writeBothEndpoints(
    wall,
    end === 'a' ? next : other,
    end === 'a' ? other : next,
  )
}

/** Schrijf één endpoint-bodem; behoudt hoogte (`h − z`). */
export function withWallEndpointBottomZ(
  wall: Wall,
  end: WallEnd,
  bottomZ: number,
  floorHeightCm: number,
): Wall {
  const current = wallEndpoint3D(wall, end, floorHeightCm)
  return writeWallEndpoint(
    wall,
    end,
    makeEndpoint3D(bottomZ, endpointHeightCm(current)),
    floorHeightCm,
  )
}

/** Eén eind: onderkant wijzigen, bovenkant (`h`) vast. */
export function withWallEndpointBottomKeepTop(
  wall: Wall,
  end: WallEnd,
  bottomZ: number,
  floorHeightCm: number,
): Wall {
  const current = wallEndpoint3D(wall, end, floorHeightCm)
  const z = clampNonNeg(Math.round(bottomZ))
  return writeWallEndpoint(
    wall,
    end,
    { z, h: Math.max(z + 1, Math.round(current.h)) },
    floorHeightCm,
  )
}

/** Eén eind: shift op `z` én `h` (hoogte gelijk). */
export function withWallEndpointElevationShift(
  wall: Wall,
  end: WallEnd,
  deltaZ: number,
  floorHeightCm: number,
): Wall {
  const delta = Math.round(deltaZ)
  if (delta === 0) return wall
  const current = wallEndpoint3D(wall, end, floorHeightCm)
  return writeWallEndpoint(
    wall,
    end,
    makeEndpoint3D(Math.max(0, current.z + delta), endpointHeightCm(current)),
    floorHeightCm,
  )
}

export function withWallUniformHeight(wall: Wall, heightCm: number, floorHeightCm: number): Wall {
  let next = withWallEndpointHeight(wall, 'a', heightCm, floorHeightCm)
  next = withWallEndpointHeight(next, 'b', heightCm, floorHeightCm)
  return next
}

/** Stamp default elevation op muren zonder ends (nieuwe teken-muren). */
export function withDefaultWallEndpoints(wall: Wall, floorHeightCm: number): Wall {
  const height = clampHeightCm(floorHeightCm)
  if (wall.elevation?.a != null && wall.elevation?.b != null) return wall
  if (wall.extras?.az != null && wall.extras?.bz != null) {
    return {
      ...wall,
      ...promoteWallElevationFromExtras(wall.extras, height),
    }
  }
  const az = parseEndpoint3D(rawEndpoint(wall, 'a'), height)
  const bz = parseEndpoint3D(rawEndpoint(wall, 'b'), height)
  return writeBothEndpoints(wall, az, bz)
}

export function setWallEndpointHeight(
  walls: Wall[],
  wallId: string,
  end: WallEnd,
  heightCm: number,
  floorHeightCm: number,
): Wall[] {
  let changed = false
  const next = walls.map((wall) => {
    if (wall.id !== wallId) return wall
    changed = true
    return withWallEndpointHeight(wall, end, heightCm, floorHeightCm)
  })
  return changed ? next : walls
}

export function setWallsUniformHeight(
  walls: Wall[],
  wallIds: Iterable<string>,
  heightCm: number,
  floorHeightCm: number,
): Wall[] {
  const idSet = new Set(wallIds)
  if (idSet.size === 0) return walls
  let changed = false
  const next = walls.map((wall) => {
    if (!idSet.has(wall.id)) return wall
    changed = true
    return withWallUniformHeight(wall, heightCm, floorHeightCm)
  })
  return changed ? next : walls
}

export function setWallsUniformBottomZ(
  walls: Wall[],
  wallIds: Iterable<string>,
  bottomZ: number,
  floorHeightCm: number,
): Wall[] {
  const idSet = new Set(wallIds)
  if (idSet.size === 0) return walls
  let changed = false
  const next = walls.map((wall) => {
    if (!idSet.has(wall.id)) return wall
    changed = true
    return withWallUniformBottomZ(wall, bottomZ, floorHeightCm)
  })
  return changed ? next : walls
}

export function setWallsElevationEdit(
  walls: Wall[],
  wallIds: Iterable<string>,
  mode: WallElevationEditMode,
  targetCm: number,
  floorHeightCm: number,
): Wall[] {
  const idSet = new Set(wallIds)
  if (idSet.size === 0) return walls
  let changed = false
  const next = walls.map((wall) => {
    if (!idSet.has(wall.id)) return wall
    changed = true
    return withWallElevationEdit(wall, mode, targetCm, floorHeightCm)
  })
  return changed ? next : walls
}

export function setJunctionHeight(
  walls: Wall[],
  refs: ReadonlyArray<{ wallId: string; end: WallEnd }>,
  heightCm: number,
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
      updated = withWallEndpointHeight(updated, end, heightCm, floorHeightCm)
    }
    return updated
  })
  return changed ? next : walls
}

function mapJunctionEnds(
  walls: Wall[],
  refs: ReadonlyArray<{ wallId: string; end: WallEnd }>,
  mapEnd: (wall: Wall, end: WallEnd) => Wall,
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
      updated = mapEnd(updated, end)
    }
    return updated
  })
  return changed ? next : walls
}

/** Alle wall-ends op één knoop op dezelfde bodem; hoogte per eind behouden. */
export function setJunctionBottomZ(
  walls: Wall[],
  refs: ReadonlyArray<{ wallId: string; end: WallEnd }>,
  bottomZCm: number,
  floorHeightCm: number,
): Wall[] {
  return mapJunctionEnds(walls, refs, (wall, end) =>
    withWallEndpointBottomZ(wall, end, bottomZCm, floorHeightCm),
  )
}

/** Aanzicht-grepen op knoop-ends: height | lift (top vast) | shift. */
export function setJunctionElevationEdit(
  walls: Wall[],
  refs: ReadonlyArray<{ wallId: string; end: WallEnd }>,
  mode: WallElevationEditMode,
  targetCm: number,
  floorHeightCm: number,
): Wall[] {
  if (mode === 'height') {
    return setJunctionHeight(walls, refs, targetCm, floorHeightCm)
  }
  if (refs.length === 0) return walls
  if (mode === 'lift') {
    return mapJunctionEnds(walls, refs, (wall, end) =>
      withWallEndpointBottomKeepTop(wall, end, targetCm, floorHeightCm),
    )
  }
  let sumZ = 0
  let n = 0
  for (const ref of refs) {
    const wall = walls.find((item) => item.id === ref.wallId)
    if (!wall) continue
    sumZ += wallEndpoint3D(wall, ref.end, floorHeightCm).z
    n += 1
  }
  const fromZ = n > 0 ? Math.round(sumZ / n) : 0
  const delta = Math.round(targetCm) - fromZ
  if (delta === 0) return walls
  return mapJunctionEnds(walls, refs, (wall, end) =>
    withWallEndpointElevationShift(wall, end, delta, floorHeightCm),
  )
}

/**
 * Split elevation op parameter `t` (a→b). Overige extras worden gedeeld.
 * Return bevat nog az/bz in extras voor callers; gebruik `promoteWallElevationFromExtras`
 * bij wall-constructie. Zonder bron-elevatie blijven beide helften zonder ends
 * (export valt terug op floor.height).
 */
export function splitWallEndpointExtras(
  wall: Wall,
  t: number,
): { firstExtras: PlanExtras | undefined; secondExtras: PlanExtras | undefined } {
  const extras = wall.extras
  const elev = wall.elevation
  const hasAz = elev?.a != null || extras?.az != null
  const hasBz = elev?.b != null || extras?.bz != null

  const restBase = extras ? { ...extras } : {}
  delete restBase.az
  delete restBase.bz
  const sharedRest = Object.keys(restBase).length > 0 ? restBase : undefined

  if (!hasAz && !hasBz) {
    return {
      firstExtras: sharedRest,
      secondExtras: sharedRest ? { ...sharedRest } : undefined,
    }
  }

  const fallback =
    elev?.a != null && typeof elev.a.h === 'number'
      ? endpointHeightCm(elev.a)
      : elev?.b != null && typeof elev.b.h === 'number'
        ? endpointHeightCm(elev.b)
        : typeof extras?.az === 'object' &&
            extras.az != null &&
            typeof (extras.az as Endpoint3D).h === 'number'
          ? endpointHeightCm(extras.az as Endpoint3D)
          : typeof extras?.bz === 'object' &&
              extras.bz != null &&
              typeof (extras.bz as Endpoint3D).h === 'number'
            ? endpointHeightCm(extras.bz as Endpoint3D)
            : DEFAULT_WALL_HEIGHT_CM

  const az = parseEndpoint3D(rawEndpoint(wall, 'a'), fallback)
  const bz = parseEndpoint3D(rawEndpoint(wall, 'b'), fallback)
  const mid = interpolateEndpoint3D(az, bz, t)

  return {
    firstExtras: { ...(sharedRest ?? {}), az, bz: mid },
    secondExtras: { ...(sharedRest ?? {}), az: mid, bz },
  }
}

function floorsInScope(plan: FloorPlan, floorIndex?: number): Floor[] {
  if (floorIndex == null) return plan.floors
  const floor = plan.floors[floorIndex]
  return floor ? [floor] : []
}

function mapPlanWalls(
  plan: FloorPlan,
  mapWall: (wall: Wall, floor: Floor) => Wall,
  floorIndex?: number,
): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor, i) => {
      if (floorIndex != null && i !== floorIndex) return floor
      return {
        ...floor,
        walls: floor.walls.map((wall) => mapWall(wall, floor)),
        designs: floor.designs?.map((design) => ({
          ...design,
          walls: design.walls.map((wall) => mapWall(wall, floor)),
        })),
      }
    }),
  }
}

function mapPlanOpenings(
  plan: FloorPlan,
  mapOpening: (opening: Opening, floor: Floor) => Opening,
  floorIndex?: number,
): FloorPlan {
  return mapPlanWalls(
    plan,
    (wall, floor) => ({
      ...wall,
      openings: wall.openings.map((opening) => mapOpening(opening, floor)),
    }),
    floorIndex,
  )
}

/** Zelfde markering als `isRidgeWall` / `isRidgeDesign` — geen import (cyclus). */
function isRidgeFloorHeightWall(wall: Wall): boolean {
  if (wall.role === 'ridge') return true
  return wall.extras?.ridge === true
}

function isRidgeFloorHeightDesign(design: FloorDesign): boolean {
  if (design.role === 'ridge') return true
  if (design.source?.settings?.btfRole === 'ridge') return true
  return design.name.trim().toLowerCase() === 'dak'
}

function mapFloorHeightWall(wall: Wall, heightCm: number): Wall {
  // Nok: span (`h − z`) is dakdikte, niet verdiepingshoogte.
  if (isRidgeFloorHeightWall(wall)) return wall
  return withWallUniformHeight(wall, heightCm, heightCm)
}

function mapFloorHeightDesign(design: FloorDesign, heightCm: number): FloorDesign {
  if (isRidgeFloorHeightDesign(design)) return design
  return {
    ...design,
    walls: design.walls.map((wall) => mapFloorHeightWall(wall, heightCm)),
  }
}

/** Overschrijf `floor.height` + plattegrond-elevation (z behouden). Nokbalken en deuren/ramen blijven. */
export function overwritePlanWallHeights(
  plan: FloorPlan,
  heightCm: number,
  floorIndex?: number,
): FloorPlan {
  const height = clampHeightCm(heightCm)
  return {
    ...plan,
    floors: plan.floors.map((floor, i) => {
      if (floorIndex != null && i !== floorIndex) return floor
      const nextFloor: Floor = { ...floor, height }
      return {
        ...nextFloor,
        walls: nextFloor.walls.map((wall) => mapFloorHeightWall(wall, height)),
        designs: nextFloor.designs?.map((design) => mapFloorHeightDesign(design, height)),
      }
    }),
  }
}

export function overwritePlanDoorHeights(
  plan: FloorPlan,
  heightCm: number,
  floorIndex?: number,
): FloorPlan {
  const height = clampHeightCm(heightCm)
  return mapPlanOpenings(
    plan,
    (opening) => (opening.type === 'door' ? { ...opening, z_height: height } : opening),
    floorIndex,
  )
}

export function overwritePlanWindowHeights(
  plan: FloorPlan,
  heightCm: number,
  floorIndex?: number,
): FloorPlan {
  const height = clampHeightCm(heightCm)
  return mapPlanOpenings(
    plan,
    (opening) => (opening.type === 'window' ? { ...opening, z_height: height } : opening),
    floorIndex,
  )
}

export function overwritePlanWindowSills(
  plan: FloorPlan,
  sillZCm: number,
  floorIndex?: number,
): FloorPlan {
  const sill = Math.max(0, Math.round(sillZCm))
  return mapPlanOpenings(
    plan,
    (opening) => (opening.type === 'window' ? { ...opening, z: sill } : opening),
    floorIndex,
  )
}

export function overwritePlanDoorBovenlicht(
  plan: FloorPlan,
  enabled: boolean,
  floorIndex?: number,
): FloorPlan {
  return mapPlanOpenings(
    plan,
    (opening) => (opening.type === 'door' ? { ...opening, bovenlicht: enabled } : opening),
    floorIndex,
  )
}

export function overwritePlanWindowBovenlicht(
  plan: FloorPlan,
  enabled: boolean,
  floorIndex?: number,
): FloorPlan {
  return mapPlanOpenings(
    plan,
    (opening) => (opening.type === 'window' ? { ...opening, bovenlicht: enabled } : opening),
    floorIndex,
  )
}

export function overwritePlanBovenlichtHeight(
  plan: FloorPlan,
  heightCm: number,
  floorIndex?: number,
): FloorPlan {
  const height = clampHeightCm(heightCm)
  return mapPlanOpenings(
    plan,
    (opening) =>
      opening.bovenlicht === true ? { ...opening, bovenlichtHeightCm: height } : opening,
    floorIndex,
  )
}

export function overwritePlanBovenlichtGap(
  plan: FloorPlan,
  gapCm: number,
  floorIndex?: number,
): FloorPlan {
  const gap = Math.max(0, Math.round(gapCm))
  return mapPlanOpenings(
    plan,
    (opening) => (opening.bovenlicht === true ? { ...opening, bovenlichtGapCm: gap } : opening),
    floorIndex,
  )
}

export function countPlanWalls(plan: FloorPlan, floorIndex?: number): number {
  return floorsInScope(plan, floorIndex).reduce((sum, floor) => sum + floor.walls.length, 0)
}

export function countPlanOpenings(
  plan: FloorPlan,
  type: 'door' | 'window',
  floorIndex?: number,
): number {
  return floorsInScope(plan, floorIndex).reduce(
    (sum, floor) =>
      sum +
      floor.walls.reduce(
        (wallSum, wall) => wallSum + wall.openings.filter((op) => op.type === type).length,
        0,
      ),
    0,
  )
}

export function countPlanBovenlichtOpenings(plan: FloorPlan, floorIndex?: number): number {
  return floorsInScope(plan, floorIndex).reduce(
    (sum, floor) =>
      sum +
      floor.walls.reduce(
        (wallSum, wall) => wallSum + wall.openings.filter((op) => op.bovenlicht === true).length,
        0,
      ),
    0,
  )
}
