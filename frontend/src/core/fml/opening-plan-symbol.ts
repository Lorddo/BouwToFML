/**
 * CAD-plan glyphs voor deuren/ramen (ISO/AIA-conventie).
 * cm-first; preview flattent naar stage. Aparte van `door-swing-symbol` (L12-overlay).
 */
export type {
  OpeningPlanSymbol,
  PlanArcGlyph,
  PlanGlyph,
  PlanGlyphRole,
  PlanPolylineGlyph,
  Point,
} from './opening-plan-symbol-types'
export {
  BIFOLD_EDGE_GAP_CM,
  PLAN_FRAME_DEPTH_MAX_CM,
  PLAN_LEAF_THICKNESS_CM,
  SLIDING_STAGGER_CM,
  WINDOW_GLASS_PAIR_GAP_CM,
  WINDOW_ORNAMENT_RADIUS_CM,
} from './opening-plan-symbol-types'
export {
  buildOpeningEndCaps,
  buildOpeningFaceSills,
  planFrameHalfDepth,
  samplePlanArc,
} from './opening-plan-symbol-geom'
export { type BuildDoorPlanSymbolInput } from './opening-plan-door-glyphs'
export {
  buildWindowPlanSymbol,
  type BuildWindowPlanSymbolInput,
} from './opening-plan-window-glyphs'

import type { OpeningPlanSymbol, PlanGlyph, Point } from './opening-plan-symbol-types'
import {
  buildOpeningEndCaps,
  planFrameHalfDepth,
  polyline,
  wallNormal,
} from './opening-plan-symbol-geom'
import { buildDoorKindGlyphs, type BuildDoorPlanSymbolInput } from './opening-plan-door-glyphs'

export function buildDoorPlanSymbol(params: BuildDoorPlanSymbolInput): OpeningPlanSymbol {
  const symbol = buildDoorKindGlyphs(params)
  const start = params.gapStart ?? params.start
  const end = params.gapEnd ?? params.end
  return {
    glyphs: [
      ...buildOpeningEndCaps({
        start,
        end,
        wallUnit: params.wallUnit,
        wallThickness: params.wallThickness,
      }),
      ...symbol.glyphs,
    ],
  }
}

/** Kozijnbanden deur (diepte ≤ PLAN_FRAME_DEPTH_MAX_CM). */
export function buildPlanJambGlyphs(
  startCm: Point,
  wallUnit: Point,
  spanCm: number,
  thicknessCm: number,
  frame: { leftCm: number; rightCm: number },
): PlanGlyph[] {
  const glyphs: PlanGlyph[] = []
  const half = planFrameHalfDepth(thicknessCm)
  const normal = wallNormal(wallUnit)
  const pushBand = (along0: number, along1: number) => {
    if (along1 - along0 < 0.2) return
    const a = {
      x: startCm.x + wallUnit.x * along0,
      y: startCm.y + wallUnit.y * along0,
    }
    const b = {
      x: startCm.x + wallUnit.x * along1,
      y: startCm.y + wallUnit.y * along1,
    }
    glyphs.push(
      polyline(
        'jamb',
        [
          a.x + normal.x * half,
          a.y + normal.y * half,
          b.x + normal.x * half,
          b.y + normal.y * half,
          b.x - normal.x * half,
          b.y - normal.y * half,
          a.x - normal.x * half,
          a.y - normal.y * half,
        ],
        true,
      ),
    )
  }
  if (frame.leftCm > 0.2) pushBand(0, frame.leftCm)
  if (frame.rightCm > 0.2) pushBand(spanCm - frame.rightCm, spanCm)
  return glyphs
}
