import type { FixtureAssetKind } from '../fixture-refid-catalog'

export interface FixtureSymbolShape {
  /** Gefillde rechthoeken [x, y, w, h] in lokale cm (origine = item-midden). */
  rects: number[][]
  /** Ellipsen [cx, cy, rx, ry]. */
  ellipses: number[][]
  /** Circles [cx, cy, r]. */
  circles: number[][]
  /** Gesloten fill-polygonen [x0,y0,x1,y1,...] (geen stroke). */
  fillPolygons?: number[][]
  /** Polyline-punten [x0,y0,x1,y1,...]. */
  polylines: number[][]
  /** Dashed polylines (schuine snede); zelfde stroke, dash [5,4]. */
  dashPolylines?: number[][]
  /** Pijl-polylines (eigen stroke); leeg = geen. */
  arrowPolylines?: number[][]
  stroke: string
  fill: string
  /** Override voor circles (spil, schoorsteen-opening). */
  circleFill?: string
  /** Optionele afronding van rects (cm). */
  cornerRadius?: number
  /**
   * Lijndikte in FML-cm (lokale fixture-coords). Group scaleX = cm→stage;
   * stroke schaalt mee met muren/zoom.
   */
  strokeWidth?: number
  arrowStrokeWidth?: number
  /** Dash-array in FML-cm (lokale coords). */
  dash?: number[]
  /**
   * true = boven muurfill (dak/gevel-symbolen).
   * false = onder muurfill zodat flush-meubels niet door de muur steken.
   */
  overWalls: boolean
}

export const STROKE = '#475569'
export const FILL = '#e2e8f0'
export const METAL_FILL = '#94a3b8'
export const METAL_STROKE = '#334155'
export const STAIR_STROKE = '#334155'
export const STAIR_FILL = '#f1f5f9'
/** Traptreden ~1.5 cm — leesbaar na fit, niet dik bij inzoomen. */
export const STAIR_STROKE_W = 1.5
export const STAIR_ARROW_W = 2.2

export function emptyShape(
  partial: Partial<FixtureSymbolShape> & Pick<FixtureSymbolShape, 'overWalls'>,
): FixtureSymbolShape {
  return {
    rects: [],
    ellipses: [],
    circles: [],
    fillPolygons: [],
    polylines: [],
    dashPolylines: [],
    arrowPolylines: [],
    stroke: STROKE,
    fill: FILL,
    ...partial,
  }
}

/** Meubels tegen een flush-muur (balance=0) overlappen de muurdikte — muren tekenen we eroverheen. */
export function isFurnitureKind(kind: FixtureAssetKind): boolean {
  return (
    kind === 'countertop' ||
    kind === 'fridge' ||
    kind === 'cabinet_high' ||
    kind === 'kitchen_sink' ||
    kind === 'cooktop' ||
    kind === 'dishwasher' ||
    kind === 'washing_machine' ||
    kind === 'dryer' ||
    kind === 'washer_dryer' ||
    kind === 'bathtub' ||
    kind === 'sink_double' ||
    kind === 'toilet' ||
    kind === 'toilet_wall_hung' ||
    kind === 'sink_small' ||
    kind === 'sink_large' ||
    kind === 'sink_vanity' ||
    kind === 'shower_head' ||
    kind === 'fuse_box' ||
    kind === 'stair_winder_180' ||
    kind === 'stair_quarter_90' ||
    kind === 'stair_quarter_90_up' ||
    kind === 'stair_straight' ||
    kind === 'stair_straight_double' ||
    kind === 'stair_opening' ||
    kind === 'roof_eave'
  )
}
