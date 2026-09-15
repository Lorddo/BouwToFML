import type { RenderAreaSideDim } from './plan-canvas-area-side-dims'
import type { Opening, Wall } from '@/core/plan/types'
import type { PlanGlyphRole } from '@/core/plan/opening-plan-symbol'
import type { WallEndRef } from '@/core/plan/junctions'

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

/** Stage-space plan glyph (arcs include sampled points for Konva). */
export type RenderPlanGlyph =
  | { kind: 'polyline'; role: PlanGlyphRole; points: number[]; closed?: boolean; dashed?: boolean }
  | {
      kind: 'arc'
      role: 'swing'
      cx: number
      cy: number
      r: number
      startRad: number
      sweepRad: number
      points: number[]
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
  glyphs: RenderPlanGlyph[]
}

export interface RenderWindowOpening {
  id: string
  wallId: string
  opening: Opening
  hitPoints: number[]
  gapPoints: number[]
  label: string
  detail: string
  glyphs: RenderPlanGlyph[]
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
  /** Wereld-cm van de benaming (centroid + name_x/y). */
  labelCm: { x: number; y: number }
  centroidCm: { x: number; y: number }
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
  isRoof?: boolean
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

export interface RenderRidge {
  id: string
  wall: Wall
  points: number[]
  outlinePoints: [number[], number[]]
  a: { x: number; y: number }
  b: { x: number; y: number }
}

export interface RenderModel {
  wallLines: RenderWall[]
  /** Plattegrond-muren als referentie (Dak-tab): alleen stippellijn. */
  ghostWallLines: RenderWall[]
  /** Dak-tab: baksteen-afdruk (binnen + buiten) als stippellijn, geen hartlijn. */
  ghostWallPolygons: RenderWallPolygon[]
  /** Dak-tab: interieur van de hogere floor (geen dak), één grijs vlak. */
  blockedRoofPolygons: RenderWallPolygon[]
  ridgeLines: RenderRidge[]
  /** Per-wall square-cap rects for move/settings overlays. */
  wallPolygons: RenderWallPolygon[]
  /** Boolean-union wall silhouette (single even-odd SVG path — never per-wall strokes). */
  wallFillPathData: string
  /** Architect: wall face polylines (stage coords); empty in editor/bouw. */
  wallOutlinePolylines: number[][]
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
  /** Live 1,50/2,00 m-contour (niet in export). */
  clearHeight: RenderClearHeight | null
  /** Plattegrond: dakvlak-omtrek (stage coords). */
  roofPlaneOutlines: RenderRoofPlaneOutline[]
  toCmPoint: (stageX: number, stageY: number) => { x: number; y: number }
  panRect: { x: number; y: number; width: number; height: number }
}

/** Stage-coords voor clear-height overlay. */
export type RenderClearHeight = {
  lines150: number[][]
  lines200: number[][]
  fills150: number[][]
}

/** Stage-coords voor dakvlak-omtrek op de plattegrond. */
export type RenderRoofPlaneOutline = {
  id: string
  points: number[]
  color: string
  dormer: boolean
}
