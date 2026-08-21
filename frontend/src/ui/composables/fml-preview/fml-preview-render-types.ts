import type { RenderAreaSideDim } from './fml-preview-area-side-dims'
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
  fillPolygons: number[][]
  polylines: number[][]
  dashPolylines: number[][]
  arrowPolylines: number[][]
  stroke: string
  fill: string
  circleFill?: string
  /** Lijndikte in FML-cm (lokale coords; group scale = cm→stage). */
  strokeWidth: number
  arrowStrokeWidth?: number
  /** Dash in FML-cm. */
  dash?: number[]
  cornerRadius?: number
  overWalls: boolean
  localX: number
  localY: number
  localWidth: number
  localHeight: number
}

export interface RenderArea {
  id: string
  /** Flat stage [x,y,…] */
  points: number[]
  fill: string
  label: string | null
  labelX: number
  labelY: number
  role?: number
  color: string
  customName?: string
  name?: string
  /** Floorplanner `showAreaLabel`; default true. */
  showAreaLabel: boolean
  /** Source poly in cm for hit-test. */
  polyCm: { x: number; y: number }[]
}

export interface RenderSurface extends RenderArea {
  isCutout?: boolean
}

export interface RenderLabel {
  id: string
  x: number
  y: number
  text: string
  fontFamily: string
  fontSize: number
  fontColor: string
  backgroundColor: string
  align: 'left' | 'center' | 'right'
  rotation: number
  outline?: boolean
  bold?: boolean
  italic?: boolean
  /** Source cm for hit-test. */
  cmX: number
  cmY: number
}

export interface RenderLine {
  id: string
  points: number[]
  stroke: string
  strokeWidth: number
  dash?: number[]
  /** Source cm for hit-test. */
  aCm: { x: number; y: number }
  bCm: { x: number; y: number }
}

export interface RenderDimension {
  id: string
  points: number[]
  tickA: number[]
  tickB: number[]
  labelX: number
  labelY: number
  label: string
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
  areas: RenderArea[]
  surfaces: RenderSurface[]
  labels: RenderLabel[]
  lines: RenderLine[]
  dimensions: RenderDimension[]
  /** Viewer-overlay uit engineAutoDims; niet floor.dimensions. */
  autoDimensions: RenderDimension[]
  /** Live slicer-maten op P-lijn. */
  sliceDimensions: RenderDimension[]
  areaSideDims: RenderAreaSideDim[]
  toCmPoint: (stageX: number, stageY: number) => { x: number; y: number }
  panRect: { x: number; y: number; width: number; height: number }
}
