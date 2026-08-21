/**
 * Projectie van één gevelgroep op een 2D-aanzicht (alle floors gestapeld).
 * X = langs het gevelvlak; Y = −worldZ (grond onderaan in Y-omlaag-canvas).
 */
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from './extraction-to-plan-types'
import { listElevationFacadeGroups, wallGuidsInGroup } from './facade-groups'
import {
  floorSlabWorldRange,
  floorWallBaseWorldZ,
  nokWorldRange,
  readFloorStack,
} from './floor-stack'
import type { Floor, FloorPlan, Opening, OpeningType, Point2D, Wall } from './types'
import { parseEndpoint3D, type Endpoint3D } from './wall-endpoint-height'

/** Hoek t.o.v. loodrecht: kleiner → return-wand, weglaten. */
export const ELEVATION_RETURN_MAX_DOT = Math.cos((65 * Math.PI) / 180)

export type ElevationRect = {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type ElevationWallRect = ElevationRect & {
  wallId: string
  floorIndex: number
  xa: number
  xb: number
  /** Eindpunt A/B in aanzicht-cm (Y = −worldZ); top/bottom volgen `az`/`bz`. */
  aTop: Point2D
  aBottom: Point2D
  bTop: Point2D
  bBottom: Point2D
}

export type ElevationOpeningRect = ElevationRect & {
  openingId: string
  openingGuid: string
  wallId: string
  floorIndex: number
  type: OpeningType
}

export type ElevationBand = ElevationRect & {
  kind: 'slab' | 'nok'
  floorIndex?: number
}

export type FacadeElevation = {
  groupId: string
  axis: Point2D
  origin: Point2D
  walls: ElevationWallRect[]
  openings: ElevationOpeningRect[]
  bands: ElevationBand[]
  bounds: ElevationRect
}

function wallLen(wall: Pick<Wall, 'a' | 'b'>): number {
  return Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
}

function unit(dx: number, dy: number): Point2D | null {
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null
  return { x: dx / len, y: dy / len }
}

function flipConsistent(dir: Point2D): Point2D {
  if (dir.x < -1e-9 || (Math.abs(dir.x) <= 1e-9 && dir.y < 0)) {
    return { x: -dir.x, y: -dir.y }
  }
  return dir
}

function projectOnAxis(point: Point2D, origin: Point2D, axis: Point2D): number {
  return (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y
}

function elevY(worldZ: number): number {
  return -worldZ
}

function openingHeightCm(opening: Opening): number {
  if (typeof opening.z_height === 'number' && Number.isFinite(opening.z_height)) {
    return opening.z_height
  }
  return opening.type === 'window' ? DEFAULT_FML_WINDOW_HEIGHT_CM : DEFAULT_FML_DOOR_HEIGHT_CM
}

function openingSillCm(opening: Opening): number {
  if (typeof opening.z === 'number' && Number.isFinite(opening.z)) return opening.z
  return opening.type === 'window' ? DEFAULT_FML_WINDOW_SILL_Z_CM : 0
}

export function elevationOpeningId(wallId: string, opening: Opening, openingIndex: number): string {
  return opening.type === 'window'
    ? `${wallId}-window-${opening.guid ?? openingIndex}`
    : `${wallId}-door-${opening.guid ?? openingIndex}`
}

function wallEndpoints(wall: Wall, floorHeightCm: number): { az: Endpoint3D; bz: Endpoint3D } {
  return {
    az: parseEndpoint3D(wall.extras?.az, floorHeightCm),
    bz: parseEndpoint3D(wall.extras?.bz, floorHeightCm),
  }
}

function collectGroupWalls(
  plan: FloorPlan,
  groupId: string,
): Array<{ wall: Wall; floorIndex: number; floor: Floor }> {
  const ids = new Set(wallGuidsInGroup(plan, groupId))
  if (ids.size === 0) return []
  const out: Array<{ wall: Wall; floorIndex: number; floor: Floor }> = []
  plan.floors.forEach((floor, floorIndex) => {
    for (const wall of floor.walls) {
      if (!ids.has(wall.id)) continue
      out.push({ wall, floorIndex, floor })
    }
  })
  return out
}

export function resolveElevationAxis(walls: ReadonlyArray<Pick<Wall, 'a' | 'b'>>): Point2D | null {
  const dirs: Array<{ dir: Point2D; len: number }> = []
  for (const wall of walls) {
    const dir = unit(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
    if (!dir) continue
    dirs.push({ dir: flipConsistent(dir), len: wallLen(wall) })
  }
  if (dirs.length === 0) return null
  dirs.sort((a, b) => a.dir.x - b.dir.x || a.dir.y - b.dir.y)
  const mid = dirs[Math.floor(dirs.length / 2)]
  if (mid) return mid.dir
  dirs.sort((a, b) => b.len - a.len)
  return dirs[0]?.dir ?? null
}

function emptyBounds(): ElevationRect {
  return { x0: 0, y0: 0, x1: 1, y1: 1 }
}

function unionBounds(rects: ElevationRect[]): ElevationRect {
  if (rects.length === 0) return emptyBounds()
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const rect of rects) {
    x0 = Math.min(x0, rect.x0, rect.x1)
    y0 = Math.min(y0, rect.y0, rect.y1)
    x1 = Math.max(x1, rect.x0, rect.x1)
    y1 = Math.max(y1, rect.y0, rect.y1)
  }
  if (!Number.isFinite(x0) || !Number.isFinite(y0)) return emptyBounds()
  return { x0, y0, x1: Math.max(x1, x0 + 1), y1: Math.max(y1, y0 + 1) }
}

export function projectFacadeElevation(plan: FloorPlan, groupId: string): FacadeElevation | null {
  const group = listElevationFacadeGroups(plan).find((entry) => entry.id === groupId)
  if (!group) return null
  const members = collectGroupWalls(plan, groupId)
  const axis = resolveElevationAxis(members.map((item) => item.wall))
  if (!axis) {
    return {
      groupId,
      axis: { x: 1, y: 0 },
      origin: { x: 0, y: 0 },
      walls: [],
      openings: [],
      bands: [],
      bounds: emptyBounds(),
    }
  }

  /** X = p · axis zodat nulpunt (0,0) op X=0 ligt. */
  const lineOrigin: Point2D = { x: 0, y: 0 }

  const walls: ElevationWallRect[] = []
  const openings: ElevationOpeningRect[] = []

  for (const { wall, floorIndex, floor } of members) {
    const dir = unit(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
    if (!dir) continue
    const along = Math.abs(dir.x * axis.x + dir.y * axis.y)
    if (along < ELEVATION_RETURN_MAX_DOT) continue
    const xa = projectOnAxis(wall.a, lineOrigin, axis)
    const xb = projectOnAxis(wall.b, lineOrigin, axis)
    const base = floorWallBaseWorldZ(plan, floorIndex)
    const ends = wallEndpoints(wall, floor.height)
    const aTop = { x: xa, y: elevY(base + ends.az.h) }
    const aBottom = { x: xa, y: elevY(base + ends.az.z) }
    const bTop = { x: xb, y: elevY(base + ends.bz.h) }
    const bBottom = { x: xb, y: elevY(base + ends.bz.z) }
    const ys = [aTop.y, aBottom.y, bTop.y, bBottom.y]
    walls.push({
      wallId: wall.id,
      floorIndex,
      xa,
      xb,
      aTop,
      aBottom,
      bTop,
      bBottom,
      x0: Math.min(xa, xb),
      x1: Math.max(xa, xb),
      y0: Math.min(...ys),
      y1: Math.max(...ys),
    })

    wall.openings.forEach((opening, openingIndex) => {
      const t = Number.isFinite(opening.t) ? opening.t : 0.5
      const width = Math.max(1, opening.width)
      const projWidth = width * along
      const xCenter = xa + (xb - xa) * t
      const sill = openingSillCm(opening)
      const height = openingHeightCm(opening)
      const z0 = base + sill
      const z1 = z0 + height
      const guid = opening.guid?.trim() || `${wall.id}:${openingIndex}`
      openings.push({
        openingId: elevationOpeningId(wall.id, opening, openingIndex),
        openingGuid: guid,
        wallId: wall.id,
        floorIndex,
        type: opening.type,
        x0: xCenter - projWidth / 2,
        x1: xCenter + projWidth / 2,
        y0: elevY(z1),
        y1: elevY(z0),
      })
    })
  }

  const bands: ElevationBand[] = []
  const xs = walls.length > 0 ? walls.flatMap((w) => [w.x0, w.x1]) : [0, 1]
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  plan.floors.forEach((_, floorIndex) => {
    const range = floorSlabWorldRange(plan, floorIndex)
    if (!range) return
    bands.push({
      kind: 'slab',
      floorIndex,
      x0,
      x1,
      y0: elevY(range.z1),
      y1: elevY(range.z0),
    })
  })
  const nok = nokWorldRange(plan)
  if (readFloorStack(plan).nokThicknessCm > 0) {
    bands.push({
      kind: 'nok',
      x0,
      x1,
      y0: elevY(nok.z1),
      y1: elevY(nok.z0),
    })
  }

  return {
    groupId,
    axis,
    origin: lineOrigin,
    walls,
    openings,
    bands,
    bounds: unionBounds([...walls, ...openings, ...bands]),
  }
}

export function hitElevationBand(
  elevation: FacadeElevation,
  point: Point2D,
  kind: ElevationBand['kind'] = 'slab',
): ElevationBand | null {
  for (let i = elevation.bands.length - 1; i >= 0; i -= 1) {
    const band = elevation.bands[i]
    if (!band || band.kind !== kind) continue
    if (point.x >= band.x0 && point.x <= band.x1 && point.y >= band.y0 && point.y <= band.y1) {
      return band
    }
  }
  return null
}

export function hitElevationOpening(
  elevation: FacadeElevation,
  point: Point2D,
): ElevationOpeningRect | null {
  for (let i = elevation.openings.length - 1; i >= 0; i -= 1) {
    const rect = elevation.openings[i]
    if (!rect) continue
    if (point.x >= rect.x0 && point.x <= rect.x1 && point.y >= rect.y0 && point.y <= rect.y1) {
      return rect
    }
  }
  return null
}

function pointOnWallElevation(wall: ElevationWallRect, point: Point2D): boolean {
  const xSpan = wall.xb - wall.xa
  if (Math.abs(xSpan) < 1e-6) return false
  const t = (point.x - wall.xa) / xSpan
  if (t < 0 || t > 1) return false
  const yTop = wall.aTop.y + (wall.bTop.y - wall.aTop.y) * t
  const yBot = wall.aBottom.y + (wall.bBottom.y - wall.aBottom.y) * t
  const lo = Math.min(yTop, yBot)
  const hi = Math.max(yTop, yBot)
  return point.y >= lo && point.y <= hi
}

export function hitElevationWall(
  elevation: FacadeElevation,
  point: Point2D,
): ElevationWallRect | null {
  for (let i = elevation.walls.length - 1; i >= 0; i -= 1) {
    const rect = elevation.walls[i]
    if (!rect) continue
    if (pointOnWallElevation(rect, point)) return rect
  }
  return null
}

function overlapArea(a: ElevationRect, b: ElevationRect): number {
  const x0 = Math.max(Math.min(a.x0, a.x1), Math.min(b.x0, b.x1))
  const x1 = Math.min(Math.max(a.x0, a.x1), Math.max(b.x0, b.x1))
  const y0 = Math.max(Math.min(a.y0, a.y1), Math.min(b.y0, b.y1))
  const y1 = Math.min(Math.max(a.y0, a.y1), Math.max(b.y0, b.y1))
  const w = x1 - x0
  const h = y1 - y0
  if (w <= 0 || h <= 0) return 0
  return w * h
}

export function openingOverlapRatio(a: ElevationRect, b: ElevationRect): number {
  const areaA = Math.abs(a.x1 - a.x0) * Math.abs(a.y1 - a.y0)
  if (areaA < 1e-6) return 0
  return overlapArea(a, b) / areaA
}

export type ElevationOpeningPatch = {
  t: number
  width: number
  z: number
  z_height: number
}

/** AABB in elevatie-cm → opening-velden op de geraakte muur. */
export function openingPatchFromElevationRect(
  wall: ElevationWallRect,
  rect: ElevationRect,
  floorBaseWorldZ: number,
): ElevationOpeningPatch {
  const xSpan = wall.xb - wall.xa
  const xCenter = (rect.x0 + rect.x1) / 2
  const t = Math.abs(xSpan) < 1e-6 ? 0.5 : (xCenter - wall.xa) / xSpan
  const width = Math.max(1, Math.abs(rect.x1 - rect.x0))
  const zTop = -Math.min(rect.y0, rect.y1)
  const zBottom = -Math.max(rect.y0, rect.y1)
  const z = Math.max(0, zBottom - floorBaseWorldZ)
  const z_height = Math.max(1, zTop - zBottom)
  return {
    t: Math.max(0, Math.min(1, t)),
    width: Math.round(width),
    z: Math.round(z),
    z_height: Math.round(z_height),
  }
}
