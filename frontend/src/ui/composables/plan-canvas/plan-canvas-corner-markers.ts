import { wallJoinFaceCorner } from '@/core/plan/plan-wall-geom'
import type { Point2D, Wall } from '@/core/plan/types'
import { buildJunctions, type JunctionNode } from '@/core/plan/junction-core'
import type { CornerMarkerMode } from '@/ui/composables/settings/corner-marker-mode'

/** Eindpunten op dezelfde H/V-lijn (cm). Strakker dan snap (0,5 / 2). */
export const CORNER_AXIS_EPS_CM = 0.1

/**
 * Weergave-slack: ≤ dit geen `!` / wel `|_`.
 * Opschonen recht nog steeds kleinere resthoeken (ortho 1,5°).
 */
export const CORNER_SQUARE_EPS_DEG = 0.005

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

function sectorKind(turnDeg: number): CornerKind {
  return Math.abs(turnDeg - 90) <= CORNER_SQUARE_EPS_DEG ? 'square' : 'skew'
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
  const hit = wallJoinFaceCorner(junction, wallA, dirA, wallB, dirB) ?? {
    x: junction.x + bisector.x * Math.max(wallA.thickness, wallB.thickness) * 0.5,
    y: junction.y + bisector.y * Math.max(wallA.thickness, wallB.thickness) * 0.5,
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
      kind: sectorKind(turn),
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
