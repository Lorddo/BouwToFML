import { floorplannerLeftNormal, wallDirectionUnit } from '@/core/fml/fml-wall-geom'
import type { Point2D, Wall } from '@/core/fml/types'
import { buildJunctions, type JunctionNode } from '@/ui/components/fml-preview-junction-core'
import { resolveWallExtents } from '@/ui/components/fml-preview-wall-polygons'
import type { CornerMarkerMode } from '@/ui/composables/settings/corner-marker-mode'

/** Eindpunten op dezelfde H/V-lijn (cm). Strakker dan snap (0,5 / 2). */
export const CORNER_AXIS_EPS_CM = 0.1

/** Sector ≥ dit telt als plat (T-onderzijde / doorgaande lijn), geen binnenhoek. */
export const CORNER_FLAT_MIN_DEG = 179

const MIN_DIR_CM = 1e-6

export type CornerKind = 'square' | 'skew'

export interface CornerSector {
  id: string
  junctionId: string
  x: number
  y: number
  dirA: Point2D
  dirB: Point2D
  bisector: Point2D
  kind: CornerKind
}

export type CornerMarker = CornerSector

export interface RenderCornerMarker {
  id: string
  x: number
  y: number
  kind: CornerKind
  armA: number[]
  armB: number[]
}

type WallLookup = Map<string, Wall>

/** Extra cm voorbij de binnenhoek, zodat het teken in de opening valt. */
export const CORNER_MARKER_PAD_CM = 4
export const CORNER_MARKER_INSET_PX = 0
export const CORNER_MARKER_ARM_PX = 10

function wallById(walls: Wall[]): WallLookup {
  const map = new Map<string, Wall>()
  for (const wall of walls) map.set(wall.id, wall)
  return map
}

function normalizeDir(dx: number, dy: number): Point2D | null {
  const len = Math.hypot(dx, dy)
  if (len < MIN_DIR_CM) return null
  return { x: dx / len, y: dy / len }
}

/** Richting vanaf het eindpunt de muur in (niet via gemiddeld knooppunt). */
function outgoingDir(wall: Wall, end: 'a' | 'b'): Point2D | null {
  return end === 'a'
    ? normalizeDir(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
    : normalizeDir(wall.a.x - wall.b.x, wall.a.y - wall.b.y)
}

export function classifyWallAxis(wall: Pick<Wall, 'a' | 'b'>): 'h' | 'v' | null {
  const dx = Math.abs(wall.b.x - wall.a.x)
  const dy = Math.abs(wall.b.y - wall.a.y)
  const horizontal = dy <= CORNER_AXIS_EPS_CM
  const vertical = dx <= CORNER_AXIS_EPS_CM
  if (horizontal && !vertical) return 'h'
  if (vertical && !horizontal) return 'v'
  return null
}

function positiveTurnDeg(from: Point2D, to: Point2D): number {
  const cross = from.x * to.y - from.y * to.x
  const dot = from.x * to.x + from.y * to.y
  let deg = (Math.atan2(cross, dot) * 180) / Math.PI
  if (deg < 0) deg += 360
  return deg
}

function bisectorOf(a: Point2D, b: Point2D): Point2D {
  const x = a.x + b.x
  const y = a.y + b.y
  return normalizeDir(x, y) ?? a
}

function sectorKind(wallA: Wall, wallB: Wall): CornerKind {
  const axisA = classifyWallAxis(wallA)
  const axisB = classifyWallAxis(wallB)
  if ((axisA === 'h' && axisB === 'v') || (axisA === 'v' && axisB === 'h')) return 'square'
  return 'skew'
}

/** Normaal van de muur-as de sector in (projectie van de bissectrice). */
function inwardFromBisector(dir: Point2D, bisector: Point2D): Point2D {
  const along = dir.x * bisector.x + dir.y * bisector.y
  return (
    normalizeDir(bisector.x - dir.x * along, bisector.y - dir.y * along) ?? {
      x: -dir.y,
      y: dir.x,
    }
  )
}

function faceExtentIntoSector(wall: Wall, inward: Point2D): number {
  const left = floorplannerLeftNormal(wallDirectionUnit(wall))
  const { plus, minus } = resolveWallExtents(wall)
  return inward.x * left.x + inward.y * left.y >= 0 ? plus : minus
}

function intersectLines(p1: Point2D, d1: Point2D, p2: Point2D, d2: Point2D): Point2D | null {
  const cross = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(cross) < MIN_DIR_CM) return null
  const s = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / cross
  return { x: p1.x + s * d1.x, y: p1.y + s * d1.y }
}

/** Binnenhoek van de twee faces + pad de sector in (cm). */
export function innerCornerAnchorCm(
  junction: Point2D,
  wallA: Wall,
  dirA: Point2D,
  wallB: Wall,
  dirB: Point2D,
  bisector: Point2D,
  padCm = CORNER_MARKER_PAD_CM,
): Point2D {
  const inA = inwardFromBisector(dirA, bisector)
  const inB = inwardFromBisector(dirB, bisector)
  const eA = faceExtentIntoSector(wallA, inA)
  const eB = faceExtentIntoSector(wallB, inB)
  const p1 = { x: junction.x + inA.x * eA, y: junction.y + inA.y * eA }
  const p2 = { x: junction.x + inB.x * eB, y: junction.y + inB.y * eB }
  const hit = intersectLines(p1, dirA, p2, dirB) ?? {
    x: junction.x + inA.x * eA + inB.x * eB,
    y: junction.y + inA.y * eA + inB.y * eB,
  }
  return {
    x: hit.x + bisector.x * padCm,
    y: hit.y + bisector.y * padCm,
  }
}

export function listCornerSectors(junction: JunctionNode, walls: Wall[]): CornerSector[] {
  const lookup = wallById(walls)
  const arms: { wall: Wall; dir: Point2D; angle: number; refKey: string }[] = []
  for (const ref of junction.refs) {
    const wall = lookup.get(ref.wallId)
    if (!wall) continue
    const dir = outgoingDir(wall, ref.end)
    if (!dir) continue
    arms.push({
      wall,
      dir,
      angle: Math.atan2(dir.y, dir.x),
      refKey: `${ref.wallId}:${ref.end}`,
    })
  }
  if (arms.length < 2) return []
  arms.sort((a, b) => a.angle - b.angle || a.refKey.localeCompare(b.refKey))

  const sectors: CornerSector[] = []
  for (let i = 0; i < arms.length; i += 1) {
    const a = arms[i]
    const b = arms[(i + 1) % arms.length]
    const turn = positiveTurnDeg(a.dir, b.dir)
    if (turn >= CORNER_FLAT_MIN_DEG) continue
    const bisector = bisectorOf(a.dir, b.dir)
    const anchor = innerCornerAnchorCm(
      { x: junction.x, y: junction.y },
      a.wall,
      a.dir,
      b.wall,
      b.dir,
      bisector,
    )
    sectors.push({
      id: `${junction.id}:${a.refKey}|${b.refKey}`,
      junctionId: junction.id,
      x: anchor.x,
      y: anchor.y,
      dirA: a.dir,
      dirB: b.dir,
      bisector,
      kind: sectorKind(a.wall, b.wall),
    })
  }
  return sectors
}

export function buildAllCornerMarkers(walls: Wall[]): CornerMarker[] {
  return buildJunctions(walls).flatMap((junction) => listCornerSectors(junction, walls))
}

export function buildCornerMarkers(walls: Wall[], mode: CornerMarkerMode): CornerMarker[] {
  if (mode === 'off') return []
  return buildAllCornerMarkers(walls).filter((sector) => sector.kind === mode)
}

function unitFromStage(origin: Point2D, tip: Point2D): Point2D | null {
  return normalizeDir(tip.x - origin.x, tip.y - origin.y)
}

export function buildRenderCornerMarkers(
  markers: CornerMarker[],
  toOverlayPoint: (x: number, y: number) => Point2D,
  options?: { insetPx?: number; armPx?: number },
): RenderCornerMarker[] {
  const insetPx = options?.insetPx ?? CORNER_MARKER_INSET_PX
  const armPx = options?.armPx ?? CORNER_MARKER_ARM_PX
  return markers.map((marker) => {
    const origin = toOverlayPoint(marker.x, marker.y)
    const bis = unitFromStage(
      origin,
      toOverlayPoint(marker.x + marker.bisector.x, marker.y + marker.bisector.y),
    ) ?? { x: 1, y: 0 }
    const dirA = unitFromStage(
      origin,
      toOverlayPoint(marker.x + marker.dirA.x, marker.y + marker.dirA.y),
    ) ?? { x: 1, y: 0 }
    const dirB = unitFromStage(
      origin,
      toOverlayPoint(marker.x + marker.dirB.x, marker.y + marker.dirB.y),
    ) ?? { x: 0, y: 1 }
    const x = origin.x + bis.x * insetPx
    const y = origin.y + bis.y * insetPx
    return {
      id: marker.id,
      x,
      y,
      kind: marker.kind,
      armA: [x, y, x + dirA.x * armPx, y + dirA.y * armPx],
      armB: [x, y, x + dirB.x * armPx, y + dirB.y * armPx],
    }
  })
}
