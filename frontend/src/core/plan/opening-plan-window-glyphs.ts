import type { WindowAssetKind } from './opening-refid-catalog'
import {
  WINDOW_GLASS_PAIR_GAP_CM,
  WINDOW_ORNAMENT_RADIUS_CM,
  type OpeningPlanSymbol,
  type PlanGlyph,
  type Point,
} from './opening-plan-symbol-types'
import {
  buildOpeningFaceSills,
  midpoint,
  planFrameHalfDepth,
  polyline,
  wallNormal,
} from './opening-plan-symbol-geom'

export interface BuildWindowPlanSymbolInput {
  start: Point
  end: Point
  wallUnit: Point
  thicknessCm: number
  panelCount: 1 | 2 | 3
  kind?: WindowAssetKind
  frameLeftCm?: number
  frameRightCm?: number
  mirrored?: [number, number]
  /** solid = blind paneel (zwart glasvlak). */
  leaf?: 'glass' | 'solid' | 'paneled'
}

function buildWindowOrnamentGlyphs(params: {
  start: Point
  end: Point
  thicknessCm: number
  wallUnit: Point
  normal: Point
  kind?: WindowAssetKind
  mirrored?: [number, number]
}): PlanGlyph[] {
  if (params.kind !== 'round' && params.kind !== 'half_round' && params.kind !== 'triangle') {
    return []
  }
  const mid = midpoint(params.start, params.end)
  const gapEdge = {
    x: mid.x - params.normal.x * (params.thicknessCm / 2),
    y: mid.y - params.normal.y * (params.thicknessCm / 2),
  }
  const radius = WINDOW_ORNAMENT_RADIUS_CM
  // Ornament “onder” gap: −normal vanaf mid → gapEdge; verder in die richting.
  const unitN = {
    x: gapEdge.x - mid.x,
    y: gapEdge.y - mid.y,
  }
  const nLen = Math.hypot(unitN.x, unitN.y) || 1
  unitN.x /= nLen
  unitN.y /= nLen
  const ornamentCenter = {
    x: gapEdge.x + unitN.x * (radius + 2),
    y: gapEdge.y + unitN.y * (radius + 2),
  }

  if (params.kind === 'triangle') {
    const unitW = params.wallUnit
    const apexAtStart = params.mirrored?.[0] !== 1
    const along = apexAtStart ? -radius : radius
    // Zelfde “bulge”-richting als half-rond (naar de opening toe = −unitN).
    const near = radius * 0.35
    const rightAngle = {
      x: ornamentCenter.x + unitW.x * along + unitN.x * near,
      y: ornamentCenter.y + unitW.y * along + unitN.y * near,
    }
    const apex = {
      x: ornamentCenter.x + unitW.x * along - unitN.x * radius,
      y: ornamentCenter.y + unitW.y * along - unitN.y * radius,
    }
    const baseFar = {
      x: ornamentCenter.x - unitW.x * along + unitN.x * near,
      y: ornamentCenter.y - unitW.y * along + unitN.y * near,
    }
    return [
      polyline('ornament', [
        rightAngle.x,
        rightAngle.y,
        apex.x,
        apex.y,
        baseFar.x,
        baseFar.y,
        rightAngle.x,
        rightAngle.y,
      ]),
    ]
  }

  if (params.kind === 'round') {
    const points: number[] = []
    const samples = 24
    for (let i = 0; i <= samples; i += 1) {
      const a = (i / samples) * Math.PI * 2
      points.push(ornamentCenter.x + Math.cos(a) * radius, ornamentCenter.y + Math.sin(a) * radius)
    }
    return [polyline('ornament', points)]
  }

  // Half-rond
  const unitW = params.wallUnit
  const startAngle = Math.atan2(unitW.y, unitW.x)
  const sweepSign = unitW.x * unitN.y - unitW.y * unitN.x >= 0 ? -1 : 1
  const points: number[] = []
  const samples = 16
  for (let i = 0; i <= samples; i += 1) {
    const a = startAngle + sweepSign * Math.PI * (i / samples)
    points.push(ornamentCenter.x + Math.cos(a) * radius, ornamentCenter.y + Math.sin(a) * radius)
  }
  points.push(points[0], points[1])
  return [polyline('ornament', points)]
}

/**
 * CAD-raam: buitenste sill = volle gatbreedte (muur tot muur);
 * glas per paneel (niet door kozijn); gap WINDOW_GLASS_PAIR_GAP_CM.
 * Zij- én middenstijlen = dezelfde jamb-banden (diepte ≤ PLAN_FRAME_DEPTH_MAX_CM).
 */
export function buildWindowPlanSymbol(params: BuildWindowPlanSymbolInput): OpeningPlanSymbol {
  const dx = params.end.x - params.start.x
  const dy = params.end.y - params.start.y
  const span = Math.hypot(dx, dy) || 1
  const wallUnit = params.wallUnit
  const normal = wallNormal(wallUnit)
  const wallHalf = Math.max(0.5, params.thicknessCm / 2)
  const frameHalf = planFrameHalfDepth(params.thicknessCm)
  const leftCm = Math.max(0, params.frameLeftCm ?? 0)
  const rightCm = Math.max(0, params.frameRightCm ?? 0)
  const segmentCount = params.panelCount
  const postCount = Math.max(0, segmentCount - 1)
  // Middenstijl zelfde breedte als zijkant-framing (fallback 5 cm).
  const sidePost = Math.max(leftCm, rightCm)
  const postCm = sidePost > 0.2 ? sidePost : postCount > 0 ? 5 : 0
  const clear = Math.max(0, span - leftCm - rightCm)
  const glassEach =
    segmentCount > 0 ? Math.max(0.5, (clear - postCount * postCm) / segmentCount) : clear
  const solidGlass = params.leaf === 'solid'
  const glyphs: PlanGlyph[] = []

  const glassHalf = Math.min(WINDOW_GLASS_PAIR_GAP_CM / 2, Math.max(0.4, wallHalf - 0.5))
  glyphs.push(
    ...buildOpeningFaceSills({
      start: params.start,
      end: params.end,
      wallUnit,
      wallThickness: params.thicknessCm,
    }),
  )

  const pushBand = (along0: number, along1: number) => {
    if (along1 - along0 < 0.2) return
    const a = {
      x: params.start.x + wallUnit.x * along0,
      y: params.start.y + wallUnit.y * along0,
    }
    const b = {
      x: params.start.x + wallUnit.x * along1,
      y: params.start.y + wallUnit.y * along1,
    }
    glyphs.push(
      polyline(
        'jamb',
        [
          a.x - normal.x * frameHalf,
          a.y - normal.y * frameHalf,
          b.x - normal.x * frameHalf,
          b.y - normal.y * frameHalf,
          b.x + normal.x * frameHalf,
          b.y + normal.y * frameHalf,
          a.x + normal.x * frameHalf,
          a.y + normal.y * frameHalf,
        ],
        true,
      ),
    )
  }

  const pushGlassPane = (along0: number, along1: number) => {
    if (along1 - along0 < 0.2) return
    const a = {
      x: params.start.x + wallUnit.x * along0,
      y: params.start.y + wallUnit.y * along0,
    }
    const b = {
      x: params.start.x + wallUnit.x * along1,
      y: params.start.y + wallUnit.y * along1,
    }
    if (solidGlass) {
      glyphs.push(
        polyline(
          'glass',
          [
            a.x + normal.x * glassHalf,
            a.y + normal.y * glassHalf,
            b.x + normal.x * glassHalf,
            b.y + normal.y * glassHalf,
            b.x - normal.x * glassHalf,
            b.y - normal.y * glassHalf,
            a.x - normal.x * glassHalf,
            a.y - normal.y * glassHalf,
          ],
          true,
        ),
      )
      return
    }
    for (const offset of [-glassHalf, glassHalf]) {
      glyphs.push(
        polyline('glass', [
          a.x + normal.x * offset,
          a.y + normal.y * offset,
          b.x + normal.x * offset,
          b.y + normal.y * offset,
        ]),
      )
    }
  }

  // Zijstijlen + middenstijlen (zelfde jamb-band) en glas per paneel.
  pushBand(0, leftCm)
  let cursor = leftCm
  for (let i = 0; i < segmentCount; i += 1) {
    pushGlassPane(cursor, cursor + glassEach)
    cursor += glassEach
    if (i < postCount) {
      pushBand(cursor, cursor + postCm)
      cursor += postCm
    }
  }
  pushBand(span - rightCm, span)

  if (params.kind === 'grid') {
    const midAlong = span / 2
    const mid = {
      x: params.start.x + wallUnit.x * midAlong,
      y: params.start.y + wallUnit.y * midAlong,
    }
    glyphs.push(
      polyline('jamb', [
        mid.x - normal.x * glassHalf,
        mid.y - normal.y * glassHalf,
        mid.x + normal.x * glassHalf,
        mid.y + normal.y * glassHalf,
      ]),
    )
  }

  glyphs.push(
    ...buildWindowOrnamentGlyphs({
      start: params.start,
      end: params.end,
      thicknessCm: params.thicknessCm,
      wallUnit,
      normal,
      kind: params.kind,
      mirrored: params.mirrored,
    }),
  )

  return { glyphs }
}
