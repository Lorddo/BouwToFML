/**
 * Dakraam (skylight-fixture) ↔ dakvlak: footprint, Z-sample, bind, elevatie-projectie.
 */
import {
  sampleCeilingRoofAtPoint,
  sampleRoofZAtPoint,
} from './bind-walls-to-roofs'
import { isPointSkyExposedOnFloor } from './ridge-floor'
import type { FloorItem, FloorPlan, FloorSurface, Point2D } from './types'

export const SKYLIGHT_ELEV_FILL = '#dbeafe'
export const SKYLIGHT_ELEV_STROKE = '#60a5fa'

export type SkylightCorner3 = Point2D & { z: number }

export type SkylightOnRoof = {
  surfaceId: string
  centerZ: number
  corners: SkylightCorner3[]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function localToWorld(
  center: Point2D,
  local: Point2D,
  rotationDeg: number,
  mirrored: readonly [number, number] | undefined,
): Point2D {
  const lx = mirrored?.[0] === 1 ? -local.x : local.x
  const ly = mirrored?.[1] === 1 ? -local.y : local.y
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    x: center.x + lx * cos - ly * sin,
    y: center.y + lx * sin + ly * cos,
  }
}

export function isSkylightItem(item: Pick<FloorItem, 'kind'> | null | undefined): boolean {
  return item?.kind === 'skylight'
}

/** Vier hoeken van de fixture-footprint in plan-XY (NW, NE, SE, SW). */
export function skylightFootprintCorners(
  item: Pick<FloorItem, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'mirrored'>,
): Point2D[] {
  const hx = Math.max(1, item.width) / 2
  const hy = Math.max(1, item.height) / 2
  const center = { x: item.x, y: item.y }
  const rotation = item.rotation ?? 0
  const locals: Point2D[] = [
    { x: -hx, y: -hy },
    { x: hx, y: -hy },
    { x: hx, y: hy },
    { x: -hx, y: hy },
  ]
  return locals.map((local) => localToWorld(center, local, rotation, item.mirrored))
}

/**
 * Welk dakvlak hoort bij dit dakraam: prefer `roofSurfaceId` als die het centrum
 * nog dekt, anders plafond-sample (dakkapel wint in zijn voetafdruk).
 */
export function resolveSkylightRoof(
  surfaces: ReadonlyArray<FloorSurface>,
  item: Pick<FloorItem, 'x' | 'y' | 'roofSurfaceId'>,
): { surfaceId: string; z: number; dormer: boolean } | null {
  const center = { x: item.x, y: item.y }
  const preferred = item.roofSurfaceId?.trim()
  if (preferred) {
    const surface = surfaces.find((entry) => entry.id === preferred)
    if (surface) {
      const z = sampleRoofZAtPoint([surface], center)
      if (z != null) {
        return {
          surfaceId: preferred,
          z,
          dormer: false,
        }
      }
    }
  }
  const hit = sampleCeilingRoofAtPoint(surfaces, center)
  if (!hit) return null
  return { surfaceId: hit.surfaceId, z: hit.z, dormer: hit.dormer }
}

/**
 * Samplet centrum + 4 hoeken op het gekoppelde (of opnieuw gevonden) dakvlak.
 * `null` als het centrum geen dak-Z heeft.
 */
export function sampleSkylightOnRoof(
  surfaces: ReadonlyArray<FloorSurface>,
  item: Pick<FloorItem, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'mirrored' | 'roofSurfaceId'>,
): SkylightOnRoof | null {
  const resolved = resolveSkylightRoof(surfaces, item)
  if (!resolved) return null
  const host = surfaces.filter((surface) => surface.id === resolved.surfaceId)
  if (host.length === 0) return null
  const corners2d = skylightFootprintCorners(item)
  const corners: SkylightCorner3[] = []
  for (const corner of corners2d) {
    const z = sampleRoofZAtPoint(host, corner) ?? sampleRoofZAtPoint(host, { x: item.x, y: item.y })
    if (z == null) return null
    corners.push({ x: corner.x, y: corner.y, z })
  }
  return {
    surfaceId: resolved.surfaceId,
    centerZ: resolved.z,
    corners,
  }
}

export type BindSkylightResult =
  | { ok: true; item: FloorItem }
  | { ok: false; reason: 'blocked' | 'uncovered' | 'not-skylight' }

/** Koppel één dakraam aan een dakvlak (Z + surfaceId). */
export function bindSkylightToRoofs(
  item: FloorItem,
  surfaces: ReadonlyArray<FloorSurface>,
  plan: FloorPlan,
  floorIndex: number,
): BindSkylightResult {
  if (!isSkylightItem(item)) return { ok: false, reason: 'not-skylight' }
  const center = { x: item.x, y: item.y }
  if (!isPointSkyExposedOnFloor(plan, floorIndex, center)) {
    return { ok: false, reason: 'blocked' }
  }
  const sampled = sampleSkylightOnRoof(surfaces, { ...item, roofSurfaceId: undefined })
  if (!sampled) return { ok: false, reason: 'uncovered' }
  return {
    ok: true,
    item: {
      ...item,
      roofSurfaceId: sampled.surfaceId,
      z: sampled.centerZ,
    },
  }
}

/** Projecteer footprint-hoeken naar aanzicht-cm (X langs as, Y = −worldZ). */
export function projectSkylightToElevation(
  sampled: SkylightOnRoof,
  params: {
    lineOrigin: Point2D
    elevAxis: Point2D
    floorBaseZ: number
    projectOnAxis: (point: Point2D, origin: Point2D, axis: Point2D) => number
    elevY: (worldZ: number) => number
  },
): Point2D[] {
  return sampled.corners.map((corner) => ({
    x: params.projectOnAxis(corner, params.lineOrigin, params.elevAxis),
    y: params.elevY(params.floorBaseZ + corner.z),
  }))
}

/** True als het item een bruikbare roof-koppeling heeft (niet leeg). */
export function hasSkylightRoofLink(item: Pick<FloorItem, 'roofSurfaceId'>): boolean {
  return typeof item.roofSurfaceId === 'string' && item.roofSurfaceId.trim().length > 0
}

export function skylightRoofSurfaceId(item: Pick<FloorItem, 'roofSurfaceId'>): string | null {
  const id = item.roofSurfaceId?.trim()
  return id ? id : null
}

export function isValidSkylightSize(item: Pick<FloorItem, 'width' | 'height'>): boolean {
  return isFiniteNumber(item.width) && item.width > 0 && isFiniteNumber(item.height) && item.height > 0
}
