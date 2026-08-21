/**
 * Buiten- en binnenkant van een gevelmuur in het aanzicht (cm voorbij de hartlijn).
 * Zelfde knoop-logica als de plattegrond-baksteen: vrij einde = halve eigen dikte;
 * knoop = buur-lichaam langs de uit-/inwaartse as (balance-aware).
 */
import {
  floorplannerLeftNormal,
  resolveWallBalanceExtents,
  wallDirectionUnit,
} from './fml-wall-geom'
import type { Point2D, Wall } from './types'

const ENDPOINT_EPS_CM = 3
const ON_SEGMENT_EPS_CM = 3
const FREE_END_FACTOR = 0.5

export type ElevationWallEndFaces = {
  /** Extra cm voorbij einde A/B aan de zichtbare buitenkant. */
  outerA: number
  outerB: number
  /** Inset cm vanaf einde A/B tot de binnenkant. */
  innerA: number
  innerB: number
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function endpointKey(point: Point2D): string {
  const q = 1 / ENDPOINT_EPS_CM
  return `${Math.round(point.x * q)},${Math.round(point.y * q)}`
}

function pointAtEnd(wall: Pick<Wall, 'a' | 'b'>, end: 'a' | 'b'): Point2D {
  return end === 'a' ? wall.a : wall.b
}

function extentAlongDirection(
  wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>,
  dir: Point2D,
): number {
  const len = Math.hypot(dir.x, dir.y)
  if (len < 1e-9) return 0
  const unit = { x: dir.x / len, y: dir.y / len }
  const n = floorplannerLeftNormal(wallDirectionUnit(wall))
  const { plus, minus } = resolveWallBalanceExtents(wall.thickness, wall.balance)
  const normalDot = n.x * unit.x + n.y * unit.y
  return Math.max(0, plus * normalDot, -minus * normalDot)
}

function neighborsAtEnd(wall: Wall, end: 'a' | 'b', walls: readonly Wall[]): Wall[] {
  const key = endpointKey(pointAtEnd(wall, end))
  return walls.filter((other) => {
    if (other.id === wall.id) return false
    return endpointKey(other.a) === key || endpointKey(other.b) === key
  })
}

function midspanHosts(wall: Wall, end: 'a' | 'b', walls: readonly Wall[]): Wall[] {
  const point = pointAtEnd(wall, end)
  const hosts: Wall[] = []
  for (const other of walls) {
    if (other.id === wall.id) continue
    const dx = other.b.x - other.a.x
    const dy = other.b.y - other.a.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-9) continue
    const t = ((point.x - other.a.x) * dx + (point.y - other.a.y) * dy) / (len * len)
    if (t < 0.02 || t > 0.98) continue
    const proj = { x: other.a.x + dx * t, y: other.a.y + dy * t }
    if (distance(point, proj) > ON_SEGMENT_EPS_CM) continue
    hosts.push(other)
  }
  return hosts
}

function facesAtEnd(
  wall: Wall,
  end: 'a' | 'b',
  walls: readonly Wall[],
): { outer: number; inner: number } {
  const along = wallDirectionUnit(wall)
  const out = end === 'a' ? { x: -along.x, y: -along.y } : along
  const inward = { x: -out.x, y: -out.y }
  const joined = neighborsAtEnd(wall, end, walls)
  const hosts = joined.length > 0 ? joined : midspanHosts(wall, end, walls)
  if (hosts.length > 0) {
    return {
      outer: Math.max(...hosts.map((host) => extentAlongDirection(host, out))),
      inner: Math.max(...hosts.map((host) => extentAlongDirection(host, inward))),
    }
  }
  return {
    outer: Math.max(0, wall.thickness * FREE_END_FACTOR),
    inner: 0,
  }
}

export function resolveElevationWallEndFaces(
  wall: Wall,
  floorWalls: readonly Wall[],
): ElevationWallEndFaces {
  if (!(wall.thickness > 1e-6)) {
    return { outerA: 0, outerB: 0, innerA: 0, innerB: 0 }
  }
  const a = facesAtEnd(wall, 'a', floorWalls)
  const b = facesAtEnd(wall, 'b', floorWalls)
  return {
    outerA: a.outer,
    innerA: a.inner,
    outerB: b.outer,
    innerB: b.inner,
  }
}

/** Hartlijn-X → buiten-/binnenkant-X in het aanzicht. */
export function elevationFaceXs(
  xa: number,
  xb: number,
  faces: ElevationWallEndFaces,
): { xOuterA: number; xOuterB: number; xInnerA: number; xInnerB: number } {
  const signA = xa >= xb ? 1 : -1
  const signB = xb >= xa ? 1 : -1
  return {
    xOuterA: xa + signA * faces.outerA,
    xOuterB: xb + signB * faces.outerB,
    xInnerA: xa - signA * faces.innerA,
    xInnerB: xb - signB * faces.innerB,
  }
}

/**
 * Nokbalk-silhouet: projectielengte + dwars `displayWidth` (3D-doos).
 * Kopgevel (along≈0) = gecentreerde dikte; langs gevel = lengte.
 * Niet `max(projectie, dikte)` — dat maakt een iets scheve as tot een blok.
 */
export function ridgeElevationFaceXs(
  xa: number,
  xb: number,
  wallLengthCm: number,
  displayWidthCm: number,
): { xOuterA: number; xOuterB: number; xInnerA: number; xInnerB: number } {
  const width = Math.max(1, displayWidthCm)
  const projLen = Math.abs(xb - xa)
  const len = Math.max(projLen, wallLengthCm)
  const along = len < 1e-6 ? 0 : Math.min(1, projLen / len)
  const across = Math.sqrt(Math.max(0, 1 - along * along))
  const half = (projLen + width * across) / 2
  const mid = (xa + xb) / 2
  const x0 = mid - half
  const x1 = mid + half
  if (xa <= xb) {
    return { xOuterA: x0, xOuterB: x1, xInnerA: x0, xInnerB: x1 }
  }
  return { xOuterA: x1, xOuterB: x0, xInnerA: x1, xInnerB: x0 }
}
