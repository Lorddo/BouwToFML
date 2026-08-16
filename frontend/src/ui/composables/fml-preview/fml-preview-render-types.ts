import type { Opening, Wall } from '@/core/fml/types'
import type { WallEndRef } from '@/ui/components/fml-preview-junctions'
import type { WindowOrnament } from './fml-preview-opening-render'

export interface RenderWall {
  id: string
  wall: Wall
  points: number[]
  strokeWidth: number
  a: { x: number; y: number }
  b: { x: number; y: number }
}

export interface RenderWallPolygon {
  id: string
  points: number[]
}

export interface RenderJunction {
  id: string
  x: number
  y: number
  cmX: number
  cmY: number
  refs: WallEndRef[]
  wallCount: number
}

export interface RenderDoorGroup {
  id: string
  wallId: string
  openingIndex: number
  openingGuid?: string
  openings: Opening[]
  hitPoints: number[]
  gapPoints: number[]
  label: string
  detail: string
  leafLines: number[][]
  arcPoints: number[][]
  arrowPoints: number[][]
}

export interface RenderWindowOpening {
  id: string
  wallId: string
  opening: Opening
  hitPoints: number[]
  gapPoints: number[]
  label: string
  detail: string
  basePoints?: number[]
  mullions?: number[][]
  ornament?: WindowOrnament | null
}

export interface RenderFixture {
  id: string
  label: string
  detail: string
  x: number
  y: number
  rotationDeg: number
  scaleX: number
  scaleY: number
  rects: number[][]
  ellipses: number[][]
  circles: number[][]
  polylines: number[][]
  arrowPolylines: number[][]
  stroke: string
  fill: string
  circleFill?: string
  strokeWidth: number
  arrowStrokeWidth?: number
  dash?: number[]
  overWalls: boolean
}

export interface RenderModel {
  wallLines: RenderWall[]
  /** Per-wall square-cap rects for move/settings overlays. */
  wallPolygons: RenderWallPolygon[]
  /** Boolean-union wall silhouette (single even-odd SVG path — never per-wall strokes). */
  wallFillPathData: string
  doorGroups: RenderDoorGroup[]
  windows: RenderWindowOpening[]
  fixtures: RenderFixture[]
  toCmPoint: (stageX: number, stageY: number) => { x: number; y: number }
  panRect: { x: number; y: number; width: number; height: number }
}
