import type { Wall } from '@/core/fml/types'

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
