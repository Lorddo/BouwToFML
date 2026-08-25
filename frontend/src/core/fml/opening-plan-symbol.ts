/**
 * CAD-plan glyphs voor deuren/ramen (ISO/AIA-conventie).
 * cm-first; preview flattent naar stage. Aparte van `door-swing-symbol` (L12-overlay).
 */
import type { DoorAssetKind, WindowAssetKind } from './opening-refid-catalog'
import { resolveHingeAtStart, resolveSwingSign, type DoorSwingPoint } from './door-swing-symbol'

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

/** Extra buiten de muurgap voor schuifpijlen. */
const SLIDING_ARROW_OUTSIDE_GAP = 10
const SLIDING_ARROW_FALLBACK_THICKNESS = 10

/** Vaste UI-diameter voor rond/half-rond/driehoek ornament (cm op plan). */
export const WINDOW_ORNAMENT_RADIUS_CM = 5

type Point = DoorSwingPoint

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function wallNormal(wallUnit: Point): Point {
  return { x: -wallUnit.y, y: wallUnit.x }
}

/** Halve kozijndiepte (≤ PLAN_FRAME_DEPTH_MAX_CM / 2). */
export function planFrameHalfDepth(wallThicknessCm: number): number {
  const depth = Math.min(
    Math.max(0.5, Number.isFinite(wallThicknessCm) && wallThicknessCm > 0 ? wallThicknessCm : 0.5),
    PLAN_FRAME_DEPTH_MAX_CM,
  )
  return depth / 2
}

function slidingArrowOffset(wallThickness?: number): number {
  const thickness =
    wallThickness != null && wallThickness > 0 ? wallThickness : SLIDING_ARROW_FALLBACK_THICKNESS
  return thickness / 2 + SLIDING_ARROW_OUTSIDE_GAP
}

/** Rechthoekig blad: hartlijn hinge→tip, dikte loodrecht op blad. */
function leafQuadAlong(hinge: Point, tip: Point, thicknessCm: number): number[] {
  const dx = tip.x - hinge.x
  const dy = tip.y - hinge.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  const half = thicknessCm / 2
  return [
    hinge.x + nx * half,
    hinge.y + ny * half,
    tip.x + nx * half,
    tip.y + ny * half,
    tip.x - nx * half,
    tip.y - ny * half,
    hinge.x - nx * half,
    hinge.y - ny * half,
  ]
}

function polyline(
  role: PlanGlyphRole,
  points: number[],
  closed = false,
  dashed = false,
): PlanPolylineGlyph {
  return { kind: 'polyline', role, points, closed, dashed: dashed || undefined }
}

function swingArc(
  hinge: Point,
  leafLength: number,
  startAngle: number,
  sweepRad: number,
): PlanArcGlyph {
  return {
    kind: 'arc',
    role: 'swing',
    cx: hinge.x,
    cy: hinge.y,
    r: leafLength,
    startRad: startAngle,
    sweepRad,
  }
}

/** Sample arc → flat points (display / Konva). */
export function samplePlanArc(arc: PlanArcGlyph, samples = 16): number[] {
  const points: number[] = []
  const end = arc.startRad + arc.sweepRad
  const n = Math.max(4, samples)
  for (let i = 0; i <= n; i += 1) {
    const t = i / n
    const a = arc.startRad + (end - arc.startRad) * t
    points.push(arc.cx + Math.cos(a) * arc.r, arc.cy + Math.sin(a) * arc.r)
  }
  return points
}

function buildArrowLine(center: Point, direction: Point, length: number): number[] {
  const half = length / 2
  const tipX = center.x + direction.x * half
  const tipY = center.y + direction.y * half
  const tailX = center.x - direction.x * half
  const tailY = center.y - direction.y * half
  const headLen = Math.min(10, length * 0.28)
  const angle = Math.atan2(direction.y, direction.x)
  const leftX = tipX - headLen * Math.cos(angle - 0.45)
  const leftY = tipY - headLen * Math.sin(angle - 0.45)
  const rightX = tipX - headLen * Math.cos(angle + 0.45)
  const rightY = tipY - headLen * Math.sin(angle + 0.45)
  return [tailX, tailY, tipX, tipY, leftX, leftY, tipX, tipY, rightX, rightY]
}

function arrowAlongWall(
  center: Point,
  wallUnit: Point,
  length: number,
  towardEnd: boolean,
): number[] {
  const dir = towardEnd ? wallUnit : { x: -wallUnit.x, y: -wallUnit.y }
  return buildArrowLine(center, dir, length)
}

function slidingArrowLane(
  center: Point,
  wallUnit: Point,
  offset: number,
  mirrored?: [number, number],
): Point {
  const normal = wallNormal(wallUnit)
  const sign = resolveSwingSign(mirrored)
  return {
    x: center.x + normal.x * sign * offset,
    y: center.y + normal.y * sign * offset,
  }
}

function buildSingleSwingGlyphs(params: {
  start: Point
  end: Point
  wallUnit: Point
  width: number
  mirrored?: [number, number]
  swingDegrees?: 45 | 90
  leafLength?: number
  hingeAtStartOverride?: boolean
  swingSignOverride?: 1 | -1
  leafThicknessCm?: number
}): PlanGlyph[] {
  const normal = wallNormal(params.wallUnit)
  const hingeAtStart = params.hingeAtStartOverride ?? resolveHingeAtStart(params.mirrored)
  const swingSign = params.swingSignOverride ?? resolveSwingSign(params.mirrored)
  const hingePoint = hingeAtStart ? params.start : params.end
  const dirAlong = hingeAtStart ? params.wallUnit : { x: -params.wallUnit.x, y: -params.wallUnit.y }
  const spanLength = Math.hypot(params.end.x - params.start.x, params.end.y - params.start.y)
  const baseWidth = params.width > 0 ? params.width : spanLength
  const leafLength = params.leafLength ?? Math.max(10, baseWidth * 0.9)
  const swingDegrees = params.swingDegrees ?? 90
  const leafTh = params.leafThicknessCm ?? PLAN_LEAF_THICKNESS_CM

  // Blad recht in het kozijn (gesloten, langs de muur).
  const closedTip: Point = {
    x: hingePoint.x + dirAlong.x * leafLength,
    y: hingePoint.y + dirAlong.y * leafLength,
  }

  const rad = (swingDegrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  // Open tip: zelfde conventie als L12 (dirAlong·cos + normal·swingSign·sin).
  const openTip: Point = {
    x: hingePoint.x + (dirAlong.x * cos + normal.x * swingSign * sin) * leafLength,
    y: hingePoint.y + (dirAlong.y * cos + normal.y * swingSign * sin) * leafLength,
  }

  const startAngle = Math.atan2(dirAlong.y, dirAlong.x)
  const endAngle = Math.atan2(openTip.y - hingePoint.y, openTip.x - hingePoint.x)
  let sweep = endAngle - startAngle
  while (sweep > Math.PI) sweep -= Math.PI * 2
  while (sweep <= -Math.PI) sweep += Math.PI * 2

  const glyphs: PlanGlyph[] = [
    // Gesloten blad (quad in kozijn)
    polyline('leaf', leafQuadAlong(hingePoint, closedTip, leafTh), true),
    // Eindpositie: enkele lijn hinge → open tip
    polyline('leaf', [hingePoint.x, hingePoint.y, openTip.x, openTip.y]),
  ]
  if (Math.abs(sweep) > 0.05) {
    glyphs.push(swingArc(hingePoint, leafLength, startAngle, sweep))
  }
  return glyphs
}

function buildWideDoubleGlyphs(params: {
  start: Point
  end: Point
  wallUnit: Point
  width: number
  mirrored?: [number, number]
  leafLength?: number
}): PlanGlyph[] {
  const mid = midpoint(params.start, params.end)
  const halfSpan = Math.hypot(mid.x - params.start.x, mid.y - params.start.y)
  const leafLength =
    params.leafLength != null ? Math.max(10, params.leafLength / 2) : Math.max(10, halfSpan * 0.92)
  const swingSign = resolveSwingSign(params.mirrored)
  return [
    ...buildSingleSwingGlyphs({
      start: params.start,
      end: mid,
      wallUnit: params.wallUnit,
      width: params.width,
      mirrored: params.mirrored,
      leafLength,
      hingeAtStartOverride: true,
      swingSignOverride: swingSign,
    }),
    ...buildSingleSwingGlyphs({
      start: mid,
      end: params.end,
      wallUnit: params.wallUnit,
      width: params.width,
      mirrored: params.mirrored,
      leafLength,
      hingeAtStartOverride: false,
      swingSignOverride: swingSign,
    }),
  ]
}

/** Blad-rechthoek in de muurgap (along wall), dikte = min(leaf, wall). */
function leafQuadInGap(
  start: Point,
  _end: Point,
  wallUnit: Point,
  along0: number,
  along1: number,
  wallThicknessCm: number,
  leafThicknessCm = PLAN_LEAF_THICKNESS_CM,
  normalOffsetCm = 0,
): number[] {
  const halfLeaf = Math.min(leafThicknessCm, wallThicknessCm) / 2
  const normal = wallNormal(wallUnit)
  const a = {
    x: start.x + wallUnit.x * along0 + normal.x * normalOffsetCm,
    y: start.y + wallUnit.y * along0 + normal.y * normalOffsetCm,
  }
  const b = {
    x: start.x + wallUnit.x * along1 + normal.x * normalOffsetCm,
    y: start.y + wallUnit.y * along1 + normal.y * normalOffsetCm,
  }
  return [
    a.x + normal.x * halfLeaf,
    a.y + normal.y * halfLeaf,
    b.x + normal.x * halfLeaf,
    b.y + normal.y * halfLeaf,
    b.x - normal.x * halfLeaf,
    b.y - normal.y * halfLeaf,
    a.x - normal.x * halfLeaf,
    a.y - normal.y * halfLeaf,
  ]
}

function glassPairAlongGap(
  start: Point,
  _end: Point,
  wallUnit: Point,
  along0: number,
  along1: number,
): PlanGlyph[] {
  const normal = wallNormal(wallUnit)
  const glassHalf = WINDOW_GLASS_PAIR_GAP_CM / 2
  const a = {
    x: start.x + wallUnit.x * along0,
    y: start.y + wallUnit.y * along0,
  }
  const b = {
    x: start.x + wallUnit.x * along1,
    y: start.y + wallUnit.y * along1,
  }
  return [
    polyline('glass', [
      a.x + normal.x * glassHalf,
      a.y + normal.y * glassHalf,
      b.x + normal.x * glassHalf,
      b.y + normal.y * glassHalf,
    ]),
    polyline('glass', [
      a.x - normal.x * glassHalf,
      a.y - normal.y * glassHalf,
      b.x - normal.x * glassHalf,
      b.y - normal.y * glassHalf,
    ]),
  ]
}

function buildSlidingSingleGlyphs(params: {
  start: Point
  end: Point
  wallUnit: Point
  mirrored?: [number, number]
  wallThickness?: number
}): PlanGlyph[] {
  const span = Math.hypot(params.end.x - params.start.x, params.end.y - params.start.y)
  const wallTh =
    params.wallThickness != null && params.wallThickness > 0
      ? params.wallThickness
      : SLIDING_ARROW_FALLBACK_THICKNESS
  const arrowLen = Math.max(16, span * 0.2)
  const mid = midpoint(params.start, params.end)
  const offset = slidingArrowOffset(params.wallThickness)
  const leftCenter = slidingArrowLane(
    { x: (params.start.x + mid.x) / 2, y: (params.start.y + mid.y) / 2 },
    params.wallUnit,
    offset,
    params.mirrored,
  )
  const rightCenter = slidingArrowLane(
    { x: (mid.x + params.end.x) / 2, y: (mid.y + params.end.y) / 2 },
    params.wallUnit,
    offset,
    params.mirrored,
  )
  const hingeAtStart = resolveHingeAtStart(params.mirrored)
  // Eén schuivend blad + vast glaspaneel; pijl op schuifhelft.
  const leafAlong0 = hingeAtStart ? 0 : span / 2
  const leafAlong1 = hingeAtStart ? span / 2 : span
  const glassAlong0 = hingeAtStart ? span / 2 : 0
  const glassAlong1 = hingeAtStart ? span : span / 2
  const arrowCenter = hingeAtStart ? leftCenter : rightCenter
  const towardEnd = hingeAtStart
  const frameHalf = planFrameHalfDepth(wallTh)
  const normal = wallNormal(params.wallUnit)
  return [
    polyline(
      'leaf',
      leafQuadInGap(params.start, params.end, params.wallUnit, leafAlong0, leafAlong1, wallTh),
      true,
    ),
    ...glassPairAlongGap(params.start, params.end, params.wallUnit, glassAlong0, glassAlong1),
    // Middenstreep tussen vast en schuivend.
    polyline('mullion', [
      mid.x - normal.x * frameHalf,
      mid.y - normal.y * frameHalf,
      mid.x + normal.x * frameHalf,
      mid.y + normal.y * frameHalf,
    ]),
    polyline('arrow', arrowAlongWall(arrowCenter, params.wallUnit, arrowLen, towardEnd)),
  ]
}

function buildSlidingDoubleGlyphs(params: {
  start: Point
  end: Point
  wallUnit: Point
  mirrored?: [number, number]
  wallThickness?: number
}): PlanGlyph[] {
  const span = Math.hypot(params.end.x - params.start.x, params.end.y - params.start.y)
  const wallTh =
    params.wallThickness != null && params.wallThickness > 0
      ? params.wallThickness
      : SLIDING_ARROW_FALLBACK_THICKNESS
  const arrowLen = Math.max(16, span * 0.18)
  const mid = midpoint(params.start, params.end)
  const offset = slidingArrowOffset(params.wallThickness)
  const leftCenter = slidingArrowLane(
    { x: (params.start.x + mid.x) / 2, y: (params.start.y + mid.y) / 2 },
    params.wallUnit,
    offset,
    params.mirrored,
  )
  const rightCenter = slidingArrowLane(
    { x: (mid.x + params.end.x) / 2, y: (mid.y + params.end.y) / 2 },
    params.wallUnit,
    offset,
    params.mirrored,
  )
  const swap = !resolveHingeAtStart(params.mirrored)
  const a = swap ? rightCenter : leftCenter
  const b = swap ? leftCenter : rightCenter
  const stagger = SLIDING_STAGGER_CM / 2
  return [
    polyline(
      'leaf',
      leafQuadInGap(
        params.start,
        params.end,
        params.wallUnit,
        0,
        span / 2,
        wallTh,
        PLAN_LEAF_THICKNESS_CM,
        stagger,
      ),
      true,
    ),
    polyline(
      'leaf',
      leafQuadInGap(
        params.start,
        params.end,
        params.wallUnit,
        span / 2,
        span,
        wallTh,
        PLAN_LEAF_THICKNESS_CM,
        -stagger,
      ),
      true,
    ),
    polyline('arrow', arrowAlongWall(a, params.wallUnit, arrowLen, !swap)),
    polyline('arrow', arrowAlongWall(b, params.wallUnit, arrowLen, swap)),
  ]
}

function buildSlidingPocketGlyphs(params: {
  start: Point
  end: Point
  wallUnit: Point
  mirrored?: [number, number]
  wallThickness?: number
}): PlanGlyph[] {
  const span = Math.hypot(params.end.x - params.start.x, params.end.y - params.start.y)
  const wallTh =
    params.wallThickness != null && params.wallThickness > 0
      ? params.wallThickness
      : SLIDING_ARROW_FALLBACK_THICKNESS
  const arrowLen = Math.max(18, span * 0.35)
  const center = midpoint(params.start, params.end)
  const offset = slidingArrowOffset(params.wallThickness)
  const lane = slidingArrowLane(center, params.wallUnit, offset, params.mirrored)
  const towardEnd = !resolveHingeAtStart(params.mirrored)
  // Blad in het kozijn (geen pocket in de muur).
  return [
    polyline(
      'leaf',
      leafQuadInGap(params.start, params.end, params.wallUnit, 0, span, wallTh),
      true,
    ),
    polyline('arrow', arrowAlongWall(lane, params.wallUnit, arrowLen, towardEnd)),
  ]
}

function buildGarageGlyphs(params: {
  start: Point
  end: Point
  wallUnit: Point
  wallThickness?: number
  mirrored?: [number, number]
}): PlanGlyph[] {
  const wallTh =
    params.wallThickness != null && params.wallThickness > 0
      ? params.wallThickness
      : SLIDING_ARROW_FALLBACK_THICKNESS
  const half = planFrameHalfDepth(wallTh)
  const normal = wallNormal(params.wallUnit)
  const keep = resolveSwingSign(params.mirrored)
  const span = Math.hypot(params.end.x - params.start.x, params.end.y - params.start.y)
  const glyphs: PlanGlyph[] = []
  // Paneellijnen binnen kozijndiepte (clear-span = start→end).
  for (const t of [-0.35, 0, 0.35]) {
    const o = half * t
    glyphs.push(
      polyline('panel', [
        params.start.x - normal.x * o,
        params.start.y - normal.y * o,
        params.end.x - normal.x * o,
        params.end.y - normal.y * o,
      ]),
    )
  }
  // Keep-richting: V vanaf de deurvlak (keep-zijde) naar een top in de kamer.
  const faceOff = half * keep
  const left: Point = {
    x: params.start.x + normal.x * faceOff,
    y: params.start.y + normal.y * faceOff,
  }
  const right: Point = {
    x: params.end.x + normal.x * faceOff,
    y: params.end.y + normal.y * faceOff,
  }
  const mid = midpoint(params.start, params.end)
  const apexDepth = Math.max(18, Math.min(48, span * 0.22))
  const apex: Point = {
    x: mid.x + normal.x * keep * (half + apexDepth),
    y: mid.y + normal.y * keep * (half + apexDepth),
  }
  glyphs.push(polyline('arrow', [left.x, left.y, apex.x, apex.y, right.x, right.y]))
  return glyphs
}

function buildBifoldPairGlyphs(params: {
  hinge: Point
  along: Point
  wallUnit: Point
  leafLength: number
  swingSign: 1 | -1
}): PlanGlyph[] {
  const normal = wallNormal(params.wallUnit)
  const fold: Point = {
    x:
      params.hinge.x +
      params.along.x * params.leafLength * 0.5 +
      normal.x * params.swingSign * params.leafLength * 0.5,
    y:
      params.hinge.y +
      params.along.y * params.leafLength * 0.5 +
      normal.y * params.swingSign * params.leafLength * 0.5,
  }
  const lead: Point = {
    x: params.hinge.x + params.along.x * params.leafLength,
    y: params.hinge.y + params.along.y * params.leafLength,
  }
  return [
    polyline('leaf', leafQuadAlong(params.hinge, fold, PLAN_LEAF_THICKNESS_CM), true),
    polyline('leaf', leafQuadAlong(fold, lead, PLAN_LEAF_THICKNESS_CM), true),
  ]
}

function buildBifoldGlyphs(params: {
  start: Point
  end: Point
  wallUnit: Point
  width: number
  mirrored?: [number, number]
  leafLength?: number
  double: boolean
}): PlanGlyph[] {
  const swingSign = resolveSwingSign(params.mirrored)
  const span = Math.hypot(params.end.x - params.start.x, params.end.y - params.start.y)
  const baseWidth = params.width > 0 ? params.width : span
  if (!params.double) {
    const hingeAtStart = resolveHingeAtStart(params.mirrored)
    const hinge = hingeAtStart ? params.start : params.end
    const along = hingeAtStart ? params.wallUnit : { x: -params.wallUnit.x, y: -params.wallUnit.y }
    const raw = params.leafLength ?? Math.max(12, baseWidth * 0.92)
    const leafLength = Math.max(12, raw - BIFOLD_EDGE_GAP_CM)
    return buildBifoldPairGlyphs({
      hinge,
      along,
      wallUnit: params.wallUnit,
      leafLength,
      swingSign,
    })
  }
  const mid = midpoint(params.start, params.end)
  const halfSpan = Math.hypot(mid.x - params.start.x, mid.y - params.start.y)
  const raw =
    params.leafLength != null ? Math.max(10, params.leafLength / 2) : Math.max(10, halfSpan * 0.92)
  const leafLength = Math.max(10, raw - BIFOLD_EDGE_GAP_CM / 2)
  return [
    ...buildBifoldPairGlyphs({
      hinge: params.start,
      along: params.wallUnit,
      wallUnit: params.wallUnit,
      leafLength,
      swingSign,
    }),
    ...buildBifoldPairGlyphs({
      hinge: params.end,
      along: { x: -params.wallUnit.x, y: -params.wallUnit.y },
      wallUnit: params.wallUnit,
      leafLength,
      swingSign,
    }),
  ]
}

/** Buitenfaces langs de muur (±halve muurdikte): raam solid, passage/boog dashed. */
export function buildOpeningFaceSills(params: {
  start: Point
  end: Point
  wallUnit: Point
  wallThickness?: number
  dashed?: boolean
}): PlanGlyph[] {
  const wallTh =
    params.wallThickness != null && params.wallThickness > 0
      ? params.wallThickness
      : SLIDING_ARROW_FALLBACK_THICKNESS
  const half = Math.max(0.5, wallTh / 2)
  const normal = wallNormal(params.wallUnit)
  const dashed = params.dashed === true
  return [
    polyline(
      'sill',
      [
        params.start.x + normal.x * half,
        params.start.y + normal.y * half,
        params.end.x + normal.x * half,
        params.end.y + normal.y * half,
      ],
      false,
      dashed,
    ),
    polyline(
      'sill',
      [
        params.start.x - normal.x * half,
        params.start.y - normal.y * half,
        params.end.x - normal.x * half,
        params.end.y - normal.y * half,
      ],
      false,
      dashed,
    ),
  ]
}

/** Dwarslijnen op de gat-einden (volle muurdikte) — sluit een buur-raam-sill. */
export function buildOpeningEndCaps(params: {
  start: Point
  end: Point
  wallUnit: Point
  wallThickness?: number
}): PlanGlyph[] {
  const wallTh =
    params.wallThickness != null && params.wallThickness > 0
      ? params.wallThickness
      : SLIDING_ARROW_FALLBACK_THICKNESS
  const half = Math.max(0.5, wallTh / 2)
  const normal = wallNormal(params.wallUnit)
  const cap = (at: Point): PlanPolylineGlyph =>
    polyline('sill', [
      at.x - normal.x * half,
      at.y - normal.y * half,
      at.x + normal.x * half,
      at.y + normal.y * half,
    ])
  return [cap(params.start), cap(params.end)]
}

/**
 * Archway: stippellijn buitenfaces + 7 dwarsstrepen (midden dichter, randen ruimer).
 */
function buildArchwayGlyphs(params: {
  start: Point
  end: Point
  wallUnit: Point
  wallThickness?: number
}): PlanGlyph[] {
  const glyphs = buildOpeningFaceSills({ ...params, dashed: true })
  const wallTh =
    params.wallThickness != null && params.wallThickness > 0
      ? params.wallThickness
      : SLIDING_ARROW_FALLBACK_THICKNESS
  const half = wallTh / 2
  const normal = wallNormal(params.wallUnit)
  // 6 gaps tussen 7 strepen: groot → klein → klein → groot
  const gaps = [3.2, 2.1, 1.15, 1.15, 2.1, 3.2]
  const gapSum = gaps.reduce((a, b) => a + b, 0)
  const margin = 0.04
  let acc = 0
  const ts: number[] = []
  for (let i = 0; i < 7; i += 1) {
    const u = i === 0 ? 0 : acc / gapSum
    ts.push(margin + u * (1 - 2 * margin))
    if (i < gaps.length) acc += gaps[i]
  }
  for (const t of ts) {
    const ax = params.start.x + (params.end.x - params.start.x) * t
    const ay = params.start.y + (params.end.y - params.start.y) * t
    glyphs.push(
      polyline('panel', [
        ax - normal.x * half,
        ay - normal.y * half,
        ax + normal.x * half,
        ay + normal.y * half,
      ]),
    )
  }
  return glyphs
}

function buildFrenchBalconyGlyphs(params: {
  start: Point
  end: Point
  wallUnit: Point
  width: number
  mirrored?: [number, number]
  leafLength?: number
  wallThickness?: number
  /** Volledige FML-gap voor het rek (tot de muur); default = swing-span. */
  gapStart?: Point
  gapEnd?: Point
}): PlanGlyph[] {
  const railSign = resolveSwingSign(params.mirrored)
  const inwardSign = railSign === 1 ? -1 : 1
  const door = buildSingleSwingGlyphs({
    start: params.start,
    end: params.end,
    wallUnit: params.wallUnit,
    width: params.width,
    mirrored: params.mirrored,
    leafLength: params.leafLength,
    swingSignOverride: inwardSign,
  })
  const thickness =
    params.wallThickness != null && params.wallThickness > 0 ? params.wallThickness : 10
  const face = thickness / 2
  const railOffset = face + 4
  const normal = wallNormal(params.wallUnit)
  const railA = params.gapStart ?? params.start
  const railB = params.gapEnd ?? params.end
  const railStart = {
    x: railA.x + normal.x * railSign * railOffset,
    y: railA.y + normal.y * railSign * railOffset,
  }
  const railEnd = {
    x: railB.x + normal.x * railSign * railOffset,
    y: railB.y + normal.y * railSign * railOffset,
  }
  const span = Math.hypot(railB.x - railA.x, railB.y - railA.y)
  const n = Math.max(3, Math.round(span / 16))
  const glyphs: PlanGlyph[] = [
    ...door,
    polyline('rail', [railStart.x, railStart.y, railEnd.x, railEnd.y]),
  ]
  for (let i = 0; i <= n; i += 1) {
    const t = i / n
    const ax = railA.x + (railB.x - railA.x) * t
    const ay = railA.y + (railB.y - railA.y) * t
    glyphs.push(
      polyline('rail', [
        ax + normal.x * railSign * face,
        ay + normal.y * railSign * face,
        ax + normal.x * railSign * railOffset,
        ay + normal.y * railSign * railOffset,
      ]),
    )
  }
  return glyphs
}

export interface BuildDoorPlanSymbolInput {
  kind: DoorAssetKind
  start: Point
  end: Point
  wallUnit: Point
  width: number
  mirrored?: [number, number]
  leafLength?: number
  wallThickness?: number
  /** Volledige opening (muur tot muur) voor o.a. Frans-balkon rek. */
  gapStart?: Point
  gapEnd?: Point
}

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

function buildDoorKindGlyphs(params: BuildDoorPlanSymbolInput): OpeningPlanSymbol {
  switch (params.kind) {
    case 'double_wide':
      return {
        glyphs: buildWideDoubleGlyphs({
          start: params.start,
          end: params.end,
          wallUnit: params.wallUnit,
          width: params.width,
          mirrored: params.mirrored,
          leafLength: params.leafLength,
        }),
      }
    case 'sliding':
      return {
        glyphs: buildSlidingDoubleGlyphs({
          start: params.start,
          end: params.end,
          wallUnit: params.wallUnit,
          mirrored: params.mirrored,
          wallThickness: params.wallThickness,
        }),
      }
    case 'sliding_single':
      return {
        glyphs: buildSlidingSingleGlyphs({
          start: params.start,
          end: params.end,
          wallUnit: params.wallUnit,
          mirrored: params.mirrored,
          wallThickness: params.wallThickness,
        }),
      }
    case 'sliding_pocket':
      return {
        glyphs: buildSlidingPocketGlyphs({
          start: params.start,
          end: params.end,
          wallUnit: params.wallUnit,
          mirrored: params.mirrored,
          wallThickness: params.wallThickness,
        }),
      }
    case 'garage':
      return {
        glyphs: buildGarageGlyphs({
          start: params.start,
          end: params.end,
          wallUnit: params.wallUnit,
          wallThickness: params.wallThickness,
          mirrored: params.mirrored,
        }),
      }
    case 'passage':
      return {
        glyphs: buildOpeningFaceSills({
          start: params.start,
          end: params.end,
          wallUnit: params.wallUnit,
          wallThickness: params.wallThickness,
          dashed: true,
        }),
      }
    case 'archway':
      return {
        glyphs: buildArchwayGlyphs({
          start: params.start,
          end: params.end,
          wallUnit: params.wallUnit,
          wallThickness: params.wallThickness,
        }),
      }
    case 'closet45':
      return {
        glyphs: buildSingleSwingGlyphs({
          start: params.start,
          end: params.end,
          wallUnit: params.wallUnit,
          width: params.width,
          mirrored: params.mirrored,
          swingDegrees: 45,
          leafLength: params.leafLength,
        }),
      }
    case 'french_balcony':
      return {
        glyphs: buildFrenchBalconyGlyphs({
          start: params.start,
          end: params.end,
          wallUnit: params.wallUnit,
          width: params.width,
          mirrored: params.mirrored,
          leafLength: params.leafLength,
          wallThickness: params.wallThickness,
          gapStart: params.gapStart,
          gapEnd: params.gapEnd,
        }),
      }
    case 'bifold':
    case 'bifold_double':
      return {
        glyphs: buildBifoldGlyphs({
          start: params.start,
          end: params.end,
          wallUnit: params.wallUnit,
          width: params.width,
          mirrored: params.mirrored,
          leafLength: params.leafLength,
          double: params.kind === 'bifold_double',
        }),
      }
    default:
      return {
        glyphs: buildSingleSwingGlyphs({
          start: params.start,
          end: params.end,
          wallUnit: params.wallUnit,
          width: params.width,
          mirrored: params.mirrored,
          leafLength: params.leafLength,
        }),
      }
  }
}

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
