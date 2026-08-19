import { DEFAULT_FML_WALL_HEIGHT_CM } from './extraction-to-plan-types'
import type { Floor, FloorPlan, FmlExtras, Opening, Wall } from './types'

/** Floorplanner endpoint elevations (bottom z + top h). */
export interface Endpoint3D {
  z: number
  h: number
}

export type WallEnd = 'a' | 'b'

const HEIGHT_EPS_CM = 0.05

function clampHeightCm(heightCm: number): number {
  if (!Number.isFinite(heightCm) || heightCm <= 0) return DEFAULT_FML_WALL_HEIGHT_CM
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

export function wallEndpoint3D(wall: Wall, end: WallEnd, floorHeightCm: number): Endpoint3D {
  const key = end === 'a' ? 'az' : 'bz'
  return parseEndpoint3D(wall.extras?.[key], floorHeightCm)
}

/** Effectieve muurhoogte op één uiteinde (`h - z`). */
export function wallEndpointHeightCm(wall: Wall, end: WallEnd, floorHeightCm: number): number {
  return endpointHeightCm(wallEndpoint3D(wall, end, floorHeightCm))
}

/** Uniforme hoogte over beide ends; anders null (mixed). */
export function wallUniformHeightCm(wall: Wall, floorHeightCm: number): number | null {
  const a = wallEndpointHeightCm(wall, 'a', floorHeightCm)
  const b = wallEndpointHeightCm(wall, 'b', floorHeightCm)
  if (Math.abs(a - b) > HEIGHT_EPS_CM) return null
  return Math.round((a + b) / 2)
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

function cloneExtras(extras: FmlExtras | undefined): FmlExtras | undefined {
  if (!extras) return undefined
  return { ...extras }
}

/** Schrijf één endpoint-hoogte; behoudt bestaande `z`, zet `h = z + heightCm`. */
export function withWallEndpointHeight(
  wall: Wall,
  end: WallEnd,
  heightCm: number,
  floorHeightCm: number,
): Wall {
  const key = end === 'a' ? 'az' : 'bz'
  const current = wallEndpoint3D(wall, end, floorHeightCm)
  const next = makeEndpoint3D(current.z, heightCm)
  const extras = cloneExtras(wall.extras) ?? {}
  extras[key] = next
  // Zorg dat het andere einde ook expliciet staat (anders export-fallback floor.height).
  const otherKey = end === 'a' ? 'bz' : 'az'
  if (extras[otherKey] == null) {
    extras[otherKey] = wallEndpoint3D(wall, end === 'a' ? 'b' : 'a', floorHeightCm)
  }
  return { ...wall, extras }
}

export function withWallUniformHeight(wall: Wall, heightCm: number, floorHeightCm: number): Wall {
  let next = withWallEndpointHeight(wall, 'a', heightCm, floorHeightCm)
  next = withWallEndpointHeight(next, 'b', heightCm, floorHeightCm)
  return next
}

/** Stamp default `az`/`bz` op muren zonder extras (nieuwe teken-muren). */
export function withDefaultWallEndpoints(wall: Wall, floorHeightCm: number): Wall {
  const height = clampHeightCm(floorHeightCm)
  if (wall.extras?.az != null && wall.extras?.bz != null) return wall
  const az = parseEndpoint3D(wall.extras?.az, height)
  const bz = parseEndpoint3D(wall.extras?.bz, height)
  return {
    ...wall,
    extras: { ...(wall.extras ?? {}), az, bz },
  }
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

/**
 * Split `az`/`bz` op parameter `t` (a→b). Overige extras worden gedeeld.
 * Zonder bron-extras blijven beide helften zonder az/bz (export valt terug op floor.height).
 */
export function splitWallEndpointExtras(
  wall: Wall,
  t: number,
): { firstExtras: FmlExtras | undefined; secondExtras: FmlExtras | undefined } {
  const extras = wall.extras
  if (!extras) return { firstExtras: undefined, secondExtras: undefined }

  const hasAz = extras.az != null
  const hasBz = extras.bz != null
  if (!hasAz && !hasBz) {
    const rest = { ...extras }
    delete rest.az
    delete rest.bz
    const shared = Object.keys(rest).length > 0 ? rest : undefined
    return { firstExtras: shared, secondExtras: shared ? { ...shared } : undefined }
  }

  const fallback =
    typeof extras.az === 'object' &&
    extras.az != null &&
    typeof (extras.az as Endpoint3D).h === 'number'
      ? endpointHeightCm(extras.az as Endpoint3D)
      : typeof extras.bz === 'object' &&
          extras.bz != null &&
          typeof (extras.bz as Endpoint3D).h === 'number'
        ? endpointHeightCm(extras.bz as Endpoint3D)
        : DEFAULT_FML_WALL_HEIGHT_CM

  const az = parseEndpoint3D(extras.az, fallback)
  const bz = parseEndpoint3D(extras.bz, fallback)
  const mid = interpolateEndpoint3D(az, bz, t)

  const rest = { ...extras }
  delete rest.az
  delete rest.bz

  return {
    firstExtras: { ...rest, az, bz: mid },
    secondExtras: { ...rest, az: mid, bz },
  }
}

function mapPlanWalls(plan: FloorPlan, mapWall: (wall: Wall, floor: Floor) => Wall): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor) => ({
      ...floor,
      walls: floor.walls.map((wall) => mapWall(wall, floor)),
      designs: floor.designs?.map((design) => ({
        ...design,
        walls: design.walls.map((wall) => mapWall(wall, floor)),
      })),
    })),
  }
}

function mapPlanOpenings(
  plan: FloorPlan,
  mapOpening: (opening: Opening, floor: Floor) => Opening,
): FloorPlan {
  return mapPlanWalls(plan, (wall, floor) => ({
    ...wall,
    openings: wall.openings.map((opening) => mapOpening(opening, floor)),
  }))
}

/** Overschrijf `floor.height` + alle `az`/`bz` (z behouden). Deuren/ramen ongemoeid. */
export function overwritePlanWallHeights(plan: FloorPlan, heightCm: number): FloorPlan {
  const height = clampHeightCm(heightCm)
  return {
    ...plan,
    floors: plan.floors.map((floor) => {
      const nextFloor: Floor = { ...floor, height }
      const mapWall = (wall: Wall): Wall => withWallUniformHeight(wall, height, height)
      return {
        ...nextFloor,
        walls: nextFloor.walls.map(mapWall),
        designs: nextFloor.designs?.map((design) => ({
          ...design,
          walls: design.walls.map(mapWall),
        })),
      }
    }),
  }
}

export function overwritePlanDoorHeights(plan: FloorPlan, heightCm: number): FloorPlan {
  const height = clampHeightCm(heightCm)
  return mapPlanOpenings(plan, (opening) =>
    opening.type === 'door' ? { ...opening, z_height: height } : opening,
  )
}

export function overwritePlanWindowHeights(plan: FloorPlan, heightCm: number): FloorPlan {
  const height = clampHeightCm(heightCm)
  return mapPlanOpenings(plan, (opening) =>
    opening.type === 'window' ? { ...opening, z_height: height } : opening,
  )
}

export function overwritePlanWindowSills(plan: FloorPlan, sillZCm: number): FloorPlan {
  const sill = Math.max(0, Math.round(sillZCm))
  return mapPlanOpenings(plan, (opening) =>
    opening.type === 'window' ? { ...opening, z: sill } : opening,
  )
}

export function overwritePlanDoorBovenlicht(plan: FloorPlan, enabled: boolean): FloorPlan {
  return mapPlanOpenings(plan, (opening) =>
    opening.type === 'door' ? { ...opening, bovenlicht: enabled } : opening,
  )
}

export function overwritePlanWindowBovenlicht(plan: FloorPlan, enabled: boolean): FloorPlan {
  return mapPlanOpenings(plan, (opening) =>
    opening.type === 'window' ? { ...opening, bovenlicht: enabled } : opening,
  )
}

export function overwritePlanBovenlichtHeight(plan: FloorPlan, heightCm: number): FloorPlan {
  const height = clampHeightCm(heightCm)
  return mapPlanOpenings(plan, (opening) =>
    opening.bovenlicht === true ? { ...opening, bovenlichtHeightCm: height } : opening,
  )
}

export function overwritePlanBovenlichtGap(plan: FloorPlan, gapCm: number): FloorPlan {
  const gap = Math.max(0, Math.round(gapCm))
  return mapPlanOpenings(plan, (opening) =>
    opening.bovenlicht === true ? { ...opening, bovenlichtGapCm: gap } : opening,
  )
}

export function countPlanWalls(plan: FloorPlan): number {
  return plan.floors.reduce((sum, floor) => sum + floor.walls.length, 0)
}

export function countPlanOpenings(plan: FloorPlan, type: 'door' | 'window'): number {
  return plan.floors.reduce(
    (sum, floor) =>
      sum +
      floor.walls.reduce(
        (wallSum, wall) => wallSum + wall.openings.filter((op) => op.type === type).length,
        0,
      ),
    0,
  )
}

export function countPlanBovenlichtOpenings(plan: FloorPlan): number {
  return plan.floors.reduce(
    (sum, floor) =>
      sum +
      floor.walls.reduce(
        (wallSum, wall) => wallSum + wall.openings.filter((op) => op.bovenlicht === true).length,
        0,
      ),
    0,
  )
}
