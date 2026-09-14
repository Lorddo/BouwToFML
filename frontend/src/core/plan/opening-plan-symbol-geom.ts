import { resolveSwingSign } from './door-swing-symbol'
import {
  PLAN_FRAME_DEPTH_MAX_CM,
  PLAN_LEAF_THICKNESS_CM,
  WINDOW_GLASS_PAIR_GAP_CM,
  type PlanArcGlyph,
  type PlanGlyph,
  type PlanGlyphRole,
  type PlanPolylineGlyph,
  type Point,
} from './opening-plan-symbol-types'

/** Extra buiten de muurgap voor schuifpijlen. */
export const SLIDING_ARROW_OUTSIDE_GAP = 10
export const SLIDING_ARROW_FALLBACK_THICKNESS = 10

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function wallNormal(wallUnit: Point): Point {
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

export function slidingArrowOffset(wallThickness?: number): number {
  const thickness =
    wallThickness != null && wallThickness > 0 ? wallThickness : SLIDING_ARROW_FALLBACK_THICKNESS
  return thickness / 2 + SLIDING_ARROW_OUTSIDE_GAP
}

/** Rechthoekig blad: hartlijn hinge→tip, dikte loodrecht op blad. */
export function leafQuadAlong(hinge: Point, tip: Point, thicknessCm: number): number[] {
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

export function polyline(
  role: PlanGlyphRole,
  points: number[],
  closed = false,
  dashed = false,
): PlanPolylineGlyph {
  return { kind: 'polyline', role, points, closed, dashed: dashed || undefined }
}

export function swingArc(
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

export function arrowAlongWall(
  center: Point,
  wallUnit: Point,
  length: number,
  towardEnd: boolean,
): number[] {
  const dir = towardEnd ? wallUnit : { x: -wallUnit.x, y: -wallUnit.y }
  return buildArrowLine(center, dir, length)
}

export function slidingArrowLane(
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

/** Blad-rechthoek in de muurgap (along wall), dikte = min(leaf, wall). */
export function leafQuadInGap(
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

export function glassPairAlongGap(
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
