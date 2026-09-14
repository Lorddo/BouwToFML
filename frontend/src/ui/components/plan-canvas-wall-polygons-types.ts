import type { Point2D } from '@/core/plan/types'

export interface WallPolygonInput {
  id: string
  a: Point2D
  b: Point2D
  thickness: number
  balance?: number
}

export interface WallPolygon {
  id: string
  points: Point2D[]
}

/** One connected component from the wall union (exterior + optional holes). */
export interface WallFillComponent {
  rings: Point2D[][]
}

export interface WallRenderGeometry {
  fillComponents: WallFillComponent[]
  wallPolygons: WallPolygon[]
}

/** Opening punch/drop input (cm along wall axis via `t` + `width`). */
export interface WallOutlineOpeningInput {
  wallId: string
  t: number
  width: number
  /** Deur: jamb-edges droppen (glyph heeft end-caps). Raam: jambs behouden. */
  type?: 'door' | 'window'
}

export type WallOutlinePolyline = Point2D[]
