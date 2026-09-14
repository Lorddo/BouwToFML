import type { DoorSwingPoint } from './door-swing-symbol'

export type Point = DoorSwingPoint

export type PlanGlyphRole =
  | 'gap'
  | 'jamb'
  | 'leaf'
  | 'swing'
  | 'glass'
  | 'sill'
  | 'mullion'
  | 'arrow'
  | 'rail'
  | 'panel'
  | 'ornament'

export type PlanPolylineGlyph = {
  kind: 'polyline'
  role: PlanGlyphRole
  points: number[]
  closed?: boolean
  /** Stippellijn (passage/arch outer edges). */
  dashed?: boolean
}

export type PlanArcGlyph = {
  kind: 'arc'
  role: 'swing'
  cx: number
  cy: number
  r: number
  startRad: number
  sweepRad: number
}

export type PlanGlyph = PlanPolylineGlyph | PlanArcGlyph

export type OpeningPlanSymbol = {
  glyphs: PlanGlyph[]
}

/** Dun deurblad in plattegrond (cm) — CAD-conventie. */
export const PLAN_LEAF_THICKNESS_CM = 4

/** Raam: vaste afstand tussen de twee middellijnen (glas). */
export const WINDOW_GLASS_PAIR_GAP_CM = 3

/**
 * Kozijnband diepte loodrecht op de muur: max 10 cm (dunner mag bij dunnere muur).
 * Niet over de volle muurdikte tekenen.
 */
export const PLAN_FRAME_DEPTH_MAX_CM = 10

/** Schuifpui 2-delig: normale verspring tussen bladen. */
export const SLIDING_STAGGER_CM = 2

/** Vouwdeur: ruimte aan de vrije kant zodat bladen niet tot de overkant reiken. */
export const BIFOLD_EDGE_GAP_CM = 8

/** Vaste UI-diameter voor rond/half-rond/driehoek ornament (cm op plan). */
export const WINDOW_ORNAMENT_RADIUS_CM = 5
