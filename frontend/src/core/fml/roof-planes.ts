/**
 * Dakvlakken op het sibling Dak-design (naast nok-muren).
 * GUID-lijst in settings — Floorplanner stript surface-extras soms.
 */
import { ensureRidgeDesign, findRidgeDesignIndex, isRidgeDesign } from './ridge-walls'
import type { Floor, FloorPlan, FloorPlanSource, FloorSurface, FmlExtras, Point2D } from './types'

export const ROOF_PLANES_SETTINGS_KEY = 'roofPlanes'
export const ROOF_SURFACE_COLOR = '#c4a36a'

/** Leeg of wit → dakkleur; een gekozen hex blijft staan. */
export function resolveRoofSurfaceColor(color?: string | null): string {
  const raw = color?.trim()
  if (!raw || raw.toLowerCase() === '#ffffff') return ROOF_SURFACE_COLOR
  return raw
}

export const ROOF_ORIGIN_GENERATED = 'generated'
export const ROOF_ORIGIN_MANUAL = 'manual'
export const ROOF_ORIGIN_EXTRA = 'btfOrigin'

export const ROOF_TOUCH_SLACK_CM = 8
export const ROOF_VERTICAL_Z_SLACK_CM = 8
export const ROOF_VERTICAL_XY_SLACK_CM = 16
export const ROOF_SAME_POINT_CM = 4

export type RoofSurfaceOrigin = typeof ROOF_ORIGIN_GENERATED | typeof ROOF_ORIGIN_MANUAL

export type RoofPlanesSettings = {
  surfaceGuids: string[]
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
  const raw = plan?.source?.settings?.[ROOF_PLANES_SETTINGS_KEY]
  if (!raw || typeof raw !== 'object') return { surfaceGuids: [] }
  const record = raw as Record<string, unknown>
  return { surfaceGuids: normalizeGuids(record.surfaceGuids) }
}

function writeRoofPlanesSettings(plan: FloorPlan, next: RoofPlanesSettings): void {
  const source = ensurePlanSource(plan)
  const settings = cloneSettings(source.settings)
  settings[ROOF_PLANES_SETTINGS_KEY] = { surfaceGuids: [...next.surfaceGuids] }
  source.settings = settings
}

export function isRoofSurface(surface: FloorSurface | null | undefined): boolean {
  if (!surface) return false
  if (surface.isRoof === true) return true
  return surface.extras?.isRoof === true
}

export function roofSurfaceOrigin(surface: FloorSurface | null | undefined): RoofSurfaceOrigin {
  const raw = surface?.extras?.[ROOF_ORIGIN_EXTRA]
  return raw === ROOF_ORIGIN_MANUAL ? ROOF_ORIGIN_MANUAL : ROOF_ORIGIN_GENERATED
}

export function markRoofSurface(
  surface: FloorSurface,
  origin: RoofSurfaceOrigin = ROOF_ORIGIN_GENERATED,
): FloorSurface {
  return {
    ...surface,
    isRoof: true,
    extras: { ...(surface.extras ?? {}), [ROOF_ORIGIN_EXTRA]: origin },
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
  writeRoofPlanesSettings(plan, { surfaceGuids })
  return surfaceGuids
}

/** Patch één dakvlak op de floor die het bezit (multi-verdieping). */
export function mapRidgeSurfaceOnPlan(
  plan: FloorPlan,
  surfaceId: string,
  map: (surface: FloorSurface) => FloorSurface,
): FloorPlan {
  const id = surfaceId.trim()
  if (!id) return plan
  let changed = false
  const floors = plan.floors.map((floor) => {
    const current = listRidgeSurfacesOnFloor(floor)
    if (!current.some((surface) => surface.id === id)) return floor
    changed = true
    return setRidgeSurfacesOnFloor(
      floor,
      current.map((surface) => (surface.id === id ? map(surface) : surface)),
    )
  })
  if (!changed) return plan
  const next = { ...plan, floors }
  syncRoofPlaneGuidsFromDesigns(next)
  return next
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
  if (readRoofPlanesSettings(plan).surfaceGuids.includes(id)) return true
  if (!plan) return false
  for (const floor of plan.floors) {
    const design = floor.designs?.find(isRidgeDesign)
    if (design?.surfaces?.some((surface) => surface.id === id)) return true
  }
  return false
}

export const ROOF_VERTEX_Z_MIN_CM = 0
export const ROOF_VERTEX_Z_MAX_CM = 800

/** Alleen Z van één dakvlak-hoek; X/Y blijven. Markeert het vlak `manual`. */
export function setRidgeSurfaceVertexZ(
  plan: FloorPlan,
  surfaceId: string,
  vertexIndex: number,
  zCm: number,
): FloorPlan {
  const z = Math.max(ROOF_VERTEX_Z_MIN_CM, Math.min(ROOF_VERTEX_Z_MAX_CM, Math.round(zCm)))
  return mapRidgeSurfaceOnPlan(plan, surfaceId, (surface) => {
    const point = surface.poly[vertexIndex]
    if (!point) return surface
    if (Math.round(point.z ?? 0) === z) return surface
    return markRoofSurfaceManual({
      ...surface,
      isRoof: true,
      poly: surface.poly.map((entry, index) => (index === vertexIndex ? { ...entry, z } : entry)),
    })
  })
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
}): FloorSurface {
  return markRoofSurface(
    {
      id: params.id,
      poly: params.poly,
      color: resolveRoofSurfaceColor(params.color),
      showAreaLabel: false,
      isRoof: true,
    },
    params.origin,
  )
}
