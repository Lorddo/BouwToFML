/**
 * Dakvlakken op het sibling Dak-design (naast nok-muren).
 * GUID-lijst in `plan.roof.planes` (`.plg`). FML-adapter projecteert naar settings.roofPlanes
 * — Floorplanner stript surface-extras soms; die FML-workaround blijft.
 */
import {
  DEFAULT_FLOOR_THICKNESS_CM,
  DEFAULT_NOK_THICKNESS_CM,
  readFloorStack,
  slabThicknessCm,
} from './floor-stack'
import {
  DEFAULT_RIDGE_DISPLAY_WIDTH_CM,
  ensureRidgeDesign,
  findRidgeDesignIndex,
  isRidgeDesign,
} from './ridge-walls'
import { followDormerWallsOnFloor, polyXyChanged } from './dormer-follow-roof'
import type { Floor, FloorPlan, FloorSurface, PlanExtras, Point2D } from './types'
import type { RoofKind } from '../plg/extension-types'

export const ROOF_PLANES_SETTINGS_KEY = 'roofPlanes'
export const ROOF_SURFACE_COLOR = '#c4a36a'
export const DORMER_ROOF_SURFACE_COLOR = '#a67c52'
/** FML settings-fallback voor roofKind/parentId (Floorplanner-hostile). */
export const ROOF_PLANES_KINDS_KEY = 'kinds'

/** Leeg of wit → dakkleur; een gekozen hex blijft staan. */
export function resolveRoofSurfaceColor(color?: string | null, dormer = false): string {
  const raw = color?.trim()
  if (!raw || raw.toLowerCase() === '#ffffff') {
    return dormer ? DORMER_ROOF_SURFACE_COLOR : ROOF_SURFACE_COLOR
  }
  return raw
}

export const ROOF_ORIGIN_GENERATED = 'generated'
export const ROOF_ORIGIN_MANUAL = 'manual'

export const ROOF_TOUCH_SLACK_CM = 8
export const ROOF_VERTICAL_Z_SLACK_CM = 8
export const ROOF_VERTICAL_XY_SLACK_CM = 16
export const ROOF_SAME_POINT_CM = 4

export type RoofSurfaceOrigin = typeof ROOF_ORIGIN_GENERATED | typeof ROOF_ORIGIN_MANUAL

export type RoofPlanesSettings = {
  surfaceIds: string[]
}

function cloneSettings(settings: PlanExtras | undefined): PlanExtras {
  return { ...(settings ?? {}) }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeGuids(raw: unknown): string[] {
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

export function readRoofPlanesSettings(plan: FloorPlan | null | undefined): RoofPlanesSettings {
  if (plan?.roof?.planes) {
    const raw = plan.roof.planes as { surfaceIds?: unknown; surfaceGuids?: unknown }
    return { surfaceIds: normalizeGuids(raw.surfaceIds ?? raw.surfaceGuids) }
  }
  return { surfaceIds: [] }
}

function writeRoofPlanesSettings(plan: FloorPlan, next: RoofPlanesSettings): void {
  plan.roof = {
    ridge: plan.roof?.ridge ?? {
      wallIds: [],
      displayWidthCm: DEFAULT_RIDGE_DISPLAY_WIDTH_CM,
    },
    planes: { surfaceIds: [...next.surfaceIds] },
    stack: plan.roof?.stack ?? { nokThicknessCm: DEFAULT_NOK_THICKNESS_CM, floors: [] },
  }
  const source = plan.source
  if (source?.settings && ROOF_PLANES_SETTINGS_KEY in source.settings) {
    const settings = cloneSettings(source.settings)
    delete settings[ROOF_PLANES_SETTINGS_KEY]
    source.settings = settings
  }
}

export function isRoofSurface(surface: FloorSurface | null | undefined): boolean {
  if (!surface) return false
  if (surface.isRoof === true) return true
  return surface.extras?.isRoof === true
}

export function roofKindOf(surface: FloorSurface | null | undefined): RoofKind {
  return surface?.roofKind === 'dormer' ? 'dormer' : 'plane'
}

export function isDormerRoof(
  surface: FloorSurface | null | undefined,
): surface is FloorSurface & { roofKind: 'dormer' } {
  return roofKindOf(surface) === 'dormer'
}

export function listParentRoofs(surfaces: ReadonlyArray<FloorSurface>): FloorSurface[] {
  return surfaces.filter((surface) => isRoofSurface(surface) && !isDormerRoof(surface))
}

function polyCentroid(poly: ReadonlyArray<Point2D>): Point2D | null {
  if (poly.length < 3) return null
  let sx = 0
  let sy = 0
  for (const p of poly) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / poly.length, y: sy / poly.length }
}

function pointInRing(point: Point2D, ring: readonly Point2D[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (!a || !b) continue
    const intersect =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + 1e-15) + a.x
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Ouder = plane-vlak dat het kindvlak dekt.
 * 1) unieke plane met centroid binnen → die
 * 2) anders plane met meeste kind-vertices binnen (unieke winnaar)
 * 3) anders null (UI kiest / weigeren)
 */
export function resolveDormerParent(
  child: FloorSurface | Pick<FloorSurface, 'poly'>,
  candidates: ReadonlyArray<FloorSurface>,
  excludeId?: string | null,
): FloorSurface | null {
  const parents = listParentRoofs(candidates).filter((surface) => {
    if (excludeId && surface.id === excludeId) return false
    return surface.poly.length >= 3
  })
  if (parents.length === 0) return null

  const centroid = polyCentroid(child.poly)
  if (centroid) {
    const containing = parents.filter((surface) => pointInRing(centroid, surface.poly))
    if (containing.length === 1) return containing[0] ?? null
    if (containing.length > 1) {
      // Ambigu centroid: kies meeste vertices binnen onder die kandidaten.
      const ranked = rankParentsByChildVertices(child.poly, containing)
      if (ranked.length === 1) return ranked[0] ?? null
      if (
        ranked.length >= 2 &&
        countChildVerticesInside(child.poly, ranked[0]!) >
          countChildVerticesInside(child.poly, ranked[1]!)
      ) {
        return ranked[0] ?? null
      }
      return null
    }
  }

  const ranked = rankParentsByChildVertices(child.poly, parents).filter(
    (parent) => countChildVerticesInside(child.poly, parent) > 0,
  )
  if (ranked.length === 0) return null
  if (ranked.length === 1) return ranked[0] ?? null
  const top = countChildVerticesInside(child.poly, ranked[0]!)
  const second = countChildVerticesInside(child.poly, ranked[1]!)
  return top > second ? (ranked[0] ?? null) : null
}

function roofZSpanCm(surface: FloorSurface): number {
  let lo = Infinity
  let hi = -Infinity
  for (const p of surface.poly) {
    const z = typeof p.z === 'number' && Number.isFinite(p.z) ? p.z : 0
    lo = Math.min(lo, z)
    hi = Math.max(hi, z)
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return 0
  return hi - lo
}

/**
 * Getagd kindvlak, of een vlakker nested vlak (FIN-0013 zonder `roofKind`).
 * T-vleugel op hetzelfde schild (zelfde Z-span) telt niet.
 * Geen vertex-count: een kapel op de kopgevel deelt 2 hoeken met de ouder-rand
 * (ray-casting telt die niet als binnen) — dat is wél een kapel.
 */
export function isDormerLikeRoof(
  surface: FloorSurface,
  all: ReadonlyArray<FloorSurface>,
): boolean {
  if (isDormerRoof(surface)) return true
  if (!isRoofSurface(surface) || surface.poly.length < 3) return false
  const centroid = polyCentroid(surface.poly)
  if (!centroid) return false
  const parents = listParentRoofs(all).filter((item) => item.id !== surface.id)
  const host = parents.find((item) => pointInRing(centroid, item.poly))
  if (!host) return false
  const childSpan = roofZSpanCm(surface)
  const parentSpan = roofZSpanCm(host)
  return childSpan < Math.max(80, parentSpan * 0.5)
}

function countChildVerticesInside(poly: ReadonlyArray<Point2D>, parent: FloorSurface): number {
  let n = 0
  for (const p of poly) {
    if (pointInRing(p, parent.poly)) n += 1
  }
  return n
}

function rankParentsByChildVertices(
  poly: ReadonlyArray<Point2D>,
  parents: ReadonlyArray<FloorSurface>,
): FloorSurface[] {
  return [...parents].sort(
    (a, b) => countChildVerticesInside(poly, b) - countChildVerticesInside(poly, a),
  )
}

export function withRoofKind(
  surface: FloorSurface,
  kind: RoofKind,
  parentId?: string | null,
): FloorSurface {
  if (kind === 'dormer') {
    const id = parentId?.trim()
    return {
      ...surface,
      isRoof: true,
      roofKind: 'dormer',
      roofParentId: id || undefined,
      color: resolveRoofSurfaceColor(surface.color, true),
    }
  }
  const next = { ...surface, isRoof: true, roofKind: 'plane' as const }
  delete next.roofParentId
  return {
    ...next,
    color: resolveRoofSurfaceColor(surface.color, false),
  }
}

export function roofSurfaceOrigin(surface: FloorSurface | null | undefined): RoofSurfaceOrigin {
  if (surface?.origin === ROOF_ORIGIN_MANUAL) return ROOF_ORIGIN_MANUAL
  if (surface?.origin === ROOF_ORIGIN_GENERATED) return ROOF_ORIGIN_GENERATED
  return ROOF_ORIGIN_GENERATED
}

export function markRoofSurface(
  surface: FloorSurface,
  origin: RoofSurfaceOrigin = ROOF_ORIGIN_MANUAL,
): FloorSurface {
  return {
    ...surface,
    isRoof: true,
    origin,
  }
}

export function markRoofSurfaceManual(surface: FloorSurface): FloorSurface {
  return markRoofSurface(surface, ROOF_ORIGIN_MANUAL)
}

export function listRidgeSurfacesOnFloor(floor: Floor | null | undefined): FloorSurface[] {
  if (!floor) return []
  const index = findRidgeDesignIndex(floor)
  if (index < 0) return []
  return [...(floor.designs?.[index]?.surfaces ?? [])]
}

export function listRidgeSurfacesOnPlan(plan: FloorPlan | null | undefined): FloorSurface[] {
  if (!plan) return []
  return plan.floors.flatMap((floor) => listRidgeSurfacesOnFloor(floor))
}

export function collectRoofPlaneIdsOnPlan(plan: FloorPlan | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const surface of listRidgeSurfacesOnPlan(plan)) {
    const id = surface.id?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function syncRoofPlaneGuidsFromDesigns(plan: FloorPlan): string[] {
  const surfaceGuids = collectRoofPlaneIdsOnPlan(plan)
  writeRoofPlanesSettings(plan, { surfaceIds: surfaceGuids })
  return surfaceGuids
}

/** Patch één dakvlak op de floor die het bezit (multi-verdieping). */
export type MapRidgeSurfaceOptions = {
  /**
   * Default false. Live-follow tijdens sleep laat snap-doelen springen.
   * Alleen dakkapel: XY-randmuren bij loslaten via `followDormerWallsForSurfaceMove`.
   */
  followDormerWalls?: boolean
}

export function mapRidgeSurfaceOnPlan(
  plan: FloorPlan,
  surfaceId: string,
  map: (surface: FloorSurface) => FloorSurface,
  options?: MapRidgeSurfaceOptions,
): FloorPlan {
  const id = surfaceId.trim()
  if (!id) return plan
  const followWalls = options?.followDormerWalls === true
  let changed = false
  const floors = plan.floors.map((floor) => {
    const current = listRidgeSurfacesOnFloor(floor)
    const previous = current.find((surface) => surface.id === id)
    if (!previous) return floor
    changed = true
    const nextSurfaces = current.map((surface) => (surface.id === id ? map(surface) : surface))
    let nextFloor = setRidgeSurfacesOnFloor(floor, nextSurfaces)
    const mapped = nextSurfaces.find((surface) => surface.id === id)
    if (
      followWalls &&
      mapped &&
      isDormerLikeRoof(previous, current) &&
      polyXyChanged(previous.poly, mapped.poly)
    ) {
      nextFloor = followDormerWallsOnFloor(nextFloor, previous.poly, mapped.poly)
    }
    return nextFloor
  })
  if (!changed) return plan
  const next = { ...plan, floors }
  syncRoofPlaneGuidsFromDesigns(next)
  return next
}

/**
 * Na live sleep zonder wang-follow: één keer dakkapel-randmuren syncen.
 * No-op als geen dakkapel of XY ongewijzigd. Hoofddak verplaatst geen gevels.
 */
export function followDormerWallsForSurfaceMove(
  plan: FloorPlan,
  surfaceId: string,
  oldPoly: ReadonlyArray<Point2D & { z?: number }>,
): FloorPlan {
  const id = surfaceId.trim()
  if (!id || oldPoly.length === 0) return plan
  let changed = false
  const floors = plan.floors.map((floor) => {
    const current = listRidgeSurfacesOnFloor(floor)
    const surface = current.find((entry) => entry.id === id)
    if (!surface || !isDormerLikeRoof(surface, current)) return floor
    if (!polyXyChanged(oldPoly, surface.poly)) return floor
    const nextFloor = followDormerWallsOnFloor(floor, oldPoly, surface.poly)
    if (nextFloor !== floor) changed = true
    return nextFloor
  })
  return changed ? { ...plan, floors } : plan
}

export function removeRidgeSurfaceOnPlan(plan: FloorPlan, surfaceId: string): FloorPlan {
  const id = surfaceId.trim()
  if (!id) return plan
  let changed = false
  const floors = plan.floors.map((floor) => {
    const current = listRidgeSurfacesOnFloor(floor)
    if (!current.some((surface) => surface.id === id)) return floor
    changed = true
    return setRidgeSurfacesOnFloor(
      floor,
      current.filter((surface) => surface.id !== id),
    )
  })
  if (!changed) return plan
  const next = { ...plan, floors }
  syncRoofPlaneGuidsFromDesigns(next)
  return next
}

export function setRidgeSurfacesOnFloor(floor: Floor, surfaces: FloorSurface[]): Floor {
  const ensured = ensureRidgeDesign(floor)
  const designs = (ensured.floor.designs ?? []).map((design, index) =>
    index === ensured.designIndex ? { ...design, surfaces } : design,
  )
  return { ...ensured.floor, designs }
}

export function isRidgeSurfaceId(plan: FloorPlan | null | undefined, surfaceId: string): boolean {
  const id = surfaceId.trim()
  if (!id) return false
  if (readRoofPlanesSettings(plan).surfaceIds.includes(id)) return true
  if (!plan) return false
  for (const floor of plan.floors) {
    const design = floor.designs?.find(isRidgeDesign)
    if (design?.surfaces?.some((surface) => surface.id === id)) return true
  }
  return false
}

export const ROOF_VERTEX_Z_MAX_CM = 800

/** Onderkant dakplaat t.o.v. vloer-Z 0; goot mag tot onderkant vloerplaat. */
export function roofVertexZMinCm(slabCm: number): number {
  return -Math.max(0, Math.round(slabCm))
}

export function clampRoofVertexZCm(zCm: number, slabCm: number): number {
  if (!Number.isFinite(zCm)) return 0
  return Math.max(roofVertexZMinCm(slabCm), Math.min(ROOF_VERTEX_Z_MAX_CM, Math.round(zCm)))
}

export function slabCmForRoofSurface(plan: FloorPlan, surfaceId: string): number {
  const id = surfaceId.trim()
  if (!id) return DEFAULT_FLOOR_THICKNESS_CM
  const stack = readFloorStack(plan)
  for (const floor of plan.floors) {
    if (!listRidgeSurfacesOnFloor(floor).some((surface) => surface.id === id)) continue
    return slabThicknessCm(stack, floor.level)
  }
  return DEFAULT_FLOOR_THICKNESS_CM
}

function clampRoofVertexZ(plan: FloorPlan, surfaceId: string, zCm: number): number {
  return clampRoofVertexZCm(zCm, slabCmForRoofSurface(plan, surfaceId))
}

export type RidgeSurfaceVertexPatch = {
  vertexIndex: number
  x?: number
  y?: number
  z?: number
}

/**
 * Meerdere dakvlak-hoeken in één `mapRidgeSurfaceOnPlan` (dakkapel-XY-follow één keer).
 * Ontbrekende velden per patch blijven; markeert het vlak `manual`.
 */
export function setRidgeSurfaceVertices(
  plan: FloorPlan,
  surfaceId: string,
  patches: readonly RidgeSurfaceVertexPatch[],
  options?: MapRidgeSurfaceOptions,
): FloorPlan {
  if (patches.length === 0) return plan
  return mapRidgeSurfaceOnPlan(
    plan,
    surfaceId,
    (surface) => {
      let changed = false
      const poly = surface.poly.map((entry, index) => {
        const patch = patches.find((item) => item.vertexIndex === index)
        if (!patch) return entry
        const x = patch.x ?? entry.x
        const y = patch.y ?? entry.y
        const z = patch.z != null ? clampRoofVertexZ(plan, surfaceId, patch.z) : (entry.z ?? 0)
        if (entry.x === x && entry.y === y && Math.round(entry.z ?? 0) === z) return entry
        changed = true
        return { ...entry, x, y, z }
      })
      if (!changed) return surface
      return markRoofSurfaceManual({
        ...surface,
        isRoof: true,
        poly,
      })
    },
    options,
  )
}

/** Eén dakvlak-hoek; ontbrekende velden blijven. Markeert het vlak `manual`. */
export function setRidgeSurfaceVertex(
  plan: FloorPlan,
  surfaceId: string,
  vertexIndex: number,
  next: { x?: number; y?: number; z?: number },
): FloorPlan {
  return setRidgeSurfaceVertices(plan, surfaceId, [{ vertexIndex, ...next }])
}

/** Alleen Z van één dakvlak-hoek; X/Y blijven. Markeert het vlak `manual`. */
export function setRidgeSurfaceVertexZ(
  plan: FloorPlan,
  surfaceId: string,
  vertexIndex: number,
  zCm: number,
): FloorPlan {
  return setRidgeSurfaceVertex(plan, surfaceId, vertexIndex, { z: zCm })
}

/** Zelfde Z op meerdere hoeken (zijaanzicht-paar). */
export function setRidgeSurfaceVerticesZ(
  plan: FloorPlan,
  surfaceId: string,
  vertexIndices: readonly number[],
  zCm: number,
): FloorPlan {
  return setRidgeSurfaceVertices(
    plan,
    surfaceId,
    vertexIndices.map((vertexIndex) => ({ vertexIndex, z: zCm })),
  )
}

/** Weergave-Z van het vlak: eerste geldige hoek (typen zet alle hoeken gelijk). */
export function roofSurfaceHeightCm(
  surface: FloorSurface | null | undefined,
): number | null {
  if (!surface?.poly.length) return null
  for (const point of surface.poly) {
    const z = point.z
    if (typeof z === 'number' && Number.isFinite(z)) return Math.round(z)
  }
  return null
}

/** Hele vlak in Z: alle hoeken op dezelfde getypte hoogte (geklemmd). */
export function setRidgeSurfaceHeightCm(
  plan: FloorPlan,
  surfaceId: string,
  zCm: number,
): FloorPlan {
  const surface = findRidgeSurface(plan, surfaceId)
  if (!surface?.poly.length || !Number.isFinite(zCm)) return plan
  const z = clampRoofVertexZ(plan, surfaceId, zCm)
  if (surface.poly.every((point) => Math.round(point.z ?? 0) === z)) return plan
  return setRidgeSurfaceVertices(
    plan,
    surfaceId,
    surface.poly.map((_, vertexIndex) => ({ vertexIndex, z })),
  )
}

export function findRidgeSurface(
  plan: FloorPlan | null | undefined,
  surfaceId: string,
): FloorSurface | null {
  if (!plan) return null
  const id = surfaceId.trim()
  for (const floor of plan.floors) {
    const found = listRidgeSurfacesOnFloor(floor).find((surface) => surface.id === id)
    if (found) return found
  }
  return null
}

export function makeRoofSurface(params: {
  id: string
  poly: Array<Point2D & { z?: number }>
  origin: RoofSurfaceOrigin
  color?: string
  roofKind?: RoofKind
  roofParentId?: string
}): FloorSurface {
  const dormer = params.roofKind === 'dormer'
  return markRoofSurface(
    withRoofKind(
      {
        id: params.id,
        poly: params.poly,
        color: resolveRoofSurfaceColor(params.color, dormer),
        showAreaLabel: false,
        isRoof: true,
      },
      dormer ? 'dormer' : 'plane',
      params.roofParentId,
    ),
    params.origin,
  )
}
