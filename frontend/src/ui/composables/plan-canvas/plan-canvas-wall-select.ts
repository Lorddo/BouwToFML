import {
  openingWorldCenter,
  wallBalanceMidOffsetCm,
  wallDirectionUnit,
  wallLeftNormal,
} from '@/core/plan/plan-wall-geom'
import { buildLocalOpeningId } from '@/core/plan/opening-ids'
import type { Opening, OpeningType, Wall } from '@/core/plan/types'

export type BoxSelectKind = 'wall' | 'door' | 'window' | 'all'

export interface BoxSelectHits {
  wallIds: string[]
  openingIds: string[]
}

export interface CmBBox {
  x: number
  y: number
  width: number
  height: number
}

/** Normaliseer signed width/height naar top-left + positieve size. */
export function normalizeCmBBox(bbox: CmBBox): CmBBox {
  const x = Math.min(bbox.x, bbox.x + bbox.width)
  const y = Math.min(bbox.y, bbox.y + bbox.height)
  return {
    x,
    y,
    width: Math.abs(bbox.width),
    height: Math.abs(bbox.height),
  }
}

function cmBBoxContains(outer: CmBBox, inner: CmBBox): boolean {
  const o = normalizeCmBBox(outer)
  const i = normalizeCmBBox(inner)
  if (o.width < 1e-6 || o.height < 1e-6) return false
  return (
    i.x >= o.x && i.y >= o.y && i.x + i.width <= o.x + o.width && i.y + i.height <= o.y + o.height
  )
}

/** Axis-aligned bbox van muur inclusief dikte (cm). */
export function wallCmBBox(wall: Wall): CmBBox {
  const half = wall.thickness / 2
  const minX = Math.min(wall.a.x, wall.b.x) - half
  const maxX = Math.max(wall.a.x, wall.b.x) + half
  const minY = Math.min(wall.a.y, wall.b.y) - half
  const maxY = Math.max(wall.a.y, wall.b.y) + half
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Muur-ids waarvan de volledige bbox binnen de selectie ligt. */
export function findWallsFullyInCmBBox(walls: Wall[], bbox: CmBBox): string[] {
  const selection = normalizeCmBBox(bbox)
  if (selection.width < 0.5 || selection.height < 0.5) return []
  return walls.filter((wall) => cmBBoxContains(selection, wallCmBBox(wall))).map((wall) => wall.id)
}

/** Axis-aligned bbox van een opening op de muur (gat + dikte, incl. balance). */
export function openingCmBBox(wall: Wall, opening: Opening): CmBBox {
  const dir = wallDirectionUnit(wall)
  const left = wallLeftNormal(wall)
  const center = openingWorldCenter(wall, opening.t)
  const mid = wallBalanceMidOffsetCm(wall.thickness, wall.balance)
  const cx = center.x + left.x * mid
  const cy = center.y + left.y * mid
  const halfW = Math.max(0, opening.width) / 2
  const halfT = wall.thickness / 2
  const xs = [
    cx - dir.x * halfW - left.x * halfT,
    cx + dir.x * halfW - left.x * halfT,
    cx + dir.x * halfW + left.x * halfT,
    cx - dir.x * halfW + left.x * halfT,
  ]
  const ys = [
    cy - dir.y * halfW - left.y * halfT,
    cy + dir.y * halfW - left.y * halfT,
    cy + dir.y * halfW + left.y * halfT,
    cy - dir.y * halfW + left.y * halfT,
  ]
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function listOpeningIdsByType(walls: Wall[], type?: OpeningType): string[] {
  const ids: string[] = []
  for (const wall of walls) {
    for (let index = 0; index < wall.openings.length; index++) {
      const opening = wall.openings[index]
      if (type != null && opening.type !== type) continue
      ids.push(buildLocalOpeningId(wall.id, opening, index))
    }
  }
  return ids
}

/** Opening-ids waarvan de volledige bbox binnen de selectie ligt. `type` weglaten = deur+raam. */
export function findOpeningsFullyInCmBBox(
  walls: Wall[],
  bbox: CmBBox,
  type?: OpeningType,
): string[] {
  const selection = normalizeCmBBox(bbox)
  if (selection.width < 0.5 || selection.height < 0.5) return []
  const ids: string[] = []
  for (const wall of walls) {
    for (let index = 0; index < wall.openings.length; index++) {
      const opening = wall.openings[index]
      if (type != null && opening.type !== type) continue
      if (!cmBBoxContains(selection, openingCmBBox(wall, opening))) continue
      ids.push(buildLocalOpeningId(wall.id, opening, index))
    }
  }
  return ids
}

export function collectBoxSelectHits(
  walls: Wall[],
  bbox: CmBBox,
  kind: BoxSelectKind,
): BoxSelectHits {
  if (kind === 'wall') {
    return { wallIds: findWallsFullyInCmBBox(walls, bbox), openingIds: [] }
  }
  if (kind === 'all') {
    return {
      wallIds: findWallsFullyInCmBBox(walls, bbox),
      openingIds: findOpeningsFullyInCmBBox(walls, bbox),
    }
  }
  return { wallIds: [], openingIds: findOpeningsFullyInCmBBox(walls, bbox, kind) }
}

/** Alle items van het gekozen type op de floor (zoals gevelgroep-leden). */
export function collectAllOfBoxKind(walls: Wall[], kind: BoxSelectKind): BoxSelectHits {
  if (kind === 'wall') {
    return { wallIds: walls.map((wall) => wall.id), openingIds: [] }
  }
  if (kind === 'all') {
    return { wallIds: walls.map((wall) => wall.id), openingIds: listOpeningIdsByType(walls) }
  }
  return { wallIds: [], openingIds: listOpeningIdsByType(walls, kind) }
}
