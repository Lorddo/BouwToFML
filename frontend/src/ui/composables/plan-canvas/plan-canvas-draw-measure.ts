import type { Point2D, Wall } from '@/core/fml/types'
import { resolveWallBalanceExtents, wallLeftNormal } from '@/core/fml/fml-wall-geom'
import {
  formatScaleInputValue,
  parseScaleInput,
  type ScaleInputUnit,
} from '@/ui/composables/settings/scale-input-unit'

const EPS = 1e-6
const TOUCH_EPS_CM = 1

export type DrawThickWall = Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>

/** Eerste weergave na junction-tik: 0,5 m, zodat handles niet op het knooppunt zitten. */
export const DRAW_SEED_CM = 50

/** Hartlijn-zaad: binnenmaat 0,5 m omhoog + extra (muurdikte-insets). FML Y-down. */
export function seedDrawWallEnd(start: Point2D, extraLengthCm = 0): Point2D {
  return { x: start.x, y: start.y - (DRAW_SEED_CM + Math.max(0, extraLengthCm)) }
}

/** Kamer: binnenmaat 0,5 × 0,5 m, omhoog + rechts; extra = hartlijn-pad (diktes). */
export function seedDrawRoomEnd(start: Point2D, extraHCm = 0, extraVCm = 0): Point2D {
  return {
    x: start.x + DRAW_SEED_CM + Math.max(0, extraHCm),
    y: start.y - (DRAW_SEED_CM + Math.max(0, extraVCm)),
  }
}

export function halfThicknessCm(thicknessCm: number): number {
  return Math.max(0, thicknessCm) / 2
}

/** Binnenmaat tussen twee evenwijdige muren (gecentreerd: span − tA/2 − tB/2). */
export function innerSpanFromCenterline(spanCm: number, thickA: number, thickB: number): number {
  return Math.max(0, Math.abs(spanCm) - halfThicknessCm(thickA) - halfThicknessCm(thickB))
}

export function centerlineSpanFromInner(innerCm: number, thickA: number, thickB: number): number {
  return Math.abs(innerCm) + halfThicknessCm(thickA) + halfThicknessCm(thickB)
}

function wallTouchesPoint(wall: DrawThickWall, point: Point2D, epsCm: number): boolean {
  return (
    Math.hypot(wall.a.x - point.x, wall.a.y - point.y) <= epsCm ||
    Math.hypot(wall.b.x - point.x, wall.b.y - point.y) <= epsCm
  )
}

function isCollinearWithDir(wall: DrawThickWall, along: Point2D): boolean {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len = Math.hypot(dx, dy)
  if (len < EPS) return false
  return Math.abs(dx * along.y - dy * along.x) / len < 0.15
}

/**
 * Hoe ver een bestaande muur het lichaam in `along` duwt vanaf `point`.
 * Leeg / collinear → 0 (vrijstaand = hartlijn = binnenmaat).
 */
export function connectorInsetAlong(
  point: Point2D,
  along: Point2D,
  walls: ReadonlyArray<DrawThickWall>,
  epsCm = TOUCH_EPS_CM,
): number {
  const alongLen = Math.hypot(along.x, along.y)
  if (alongLen < EPS) return 0
  const ux = along.x / alongLen
  const uy = along.y / alongLen
  let best = 0
  for (const wall of walls) {
    if ((wall.thickness ?? 0) <= 0) continue
    if (!wallTouchesPoint(wall, point, epsCm)) continue
    if (isCollinearWithDir(wall, { x: ux, y: uy })) continue
    const n = wallLeftNormal(wall)
    const { plus, minus } = resolveWallBalanceExtents(wall.thickness, wall.balance)
    const d = n.x * ux + n.y * uy
    best = Math.max(best, plus * d, -minus * d, 0)
  }
  return best
}

export function unitFromTo(start: Point2D, end: Point2D, fallback: Point2D): Point2D {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.hypot(dx, dy)
  if (len < EPS) return fallback
  return { x: dx / len, y: dy / len }
}

/** Dikte van een bestaande as-muur op een H- of V-rand; anders draft. */
export function thicknessOnOrthoEdge(
  walls: ReadonlyArray<DrawThickWall>,
  axis: 'x' | 'y',
  line: number,
  range0: number,
  range1: number,
  draftCm: number,
): number {
  const lo = Math.min(range0, range1)
  const hi = Math.max(range0, range1)
  let found: number | null = null
  for (const wall of walls) {
    const alongA = axis === 'x' ? wall.a.x : wall.a.y
    const alongB = axis === 'x' ? wall.b.x : wall.b.y
    const rangeA = axis === 'x' ? wall.a.y : wall.a.x
    const rangeB = axis === 'x' ? wall.b.y : wall.b.x
    if (Math.abs(alongA - line) > TOUCH_EPS_CM || Math.abs(alongB - line) > TOUCH_EPS_CM) continue
    const wLo = Math.min(rangeA, rangeB)
    const wHi = Math.max(rangeA, rangeB)
    if (wHi < lo - TOUCH_EPS_CM || wLo > hi + TOUCH_EPS_CM) continue
    const t = wall.thickness > 0 ? wall.thickness : draftCm
    found = found == null ? t : Math.max(found, t)
  }
  return found ?? draftCm
}

export function roomSideThicknesses(
  start: Point2D,
  end: Point2D,
  draftCm: number,
  walls: ReadonlyArray<DrawThickWall>,
): { west: number; east: number; north: number; south: number } {
  const minX = Math.min(start.x, end.x)
  const maxX = Math.max(start.x, end.x)
  const minY = Math.min(start.y, end.y)
  const maxY = Math.max(start.y, end.y)
  return {
    west: thicknessOnOrthoEdge(walls, 'x', minX, minY, maxY, draftCm),
    east: thicknessOnOrthoEdge(walls, 'x', maxX, minY, maxY, draftCm),
    north: thicknessOnOrthoEdge(walls, 'y', minY, minX, maxX, draftCm),
    south: thicknessOnOrthoEdge(walls, 'y', maxY, minX, maxX, draftCm),
  }
}

export function flipPointAround(origin: Point2D, point: Point2D): Point2D {
  return { x: origin.x * 2 - point.x, y: origin.y * 2 - point.y }
}

export function flipPointX(origin: Point2D, point: Point2D): Point2D {
  return { x: origin.x * 2 - point.x, y: point.y }
}

export function flipPointY(origin: Point2D, point: Point2D): Point2D {
  return { x: point.x, y: origin.y * 2 - point.y }
}

export function ensureAwayFromStart(start: Point2D, hover: Point2D, seed: Point2D): Point2D {
  if (Math.hypot(hover.x - start.x, hover.y - start.y) < EPS) return seed
  return hover
}

export function hitClosestDraftPoint(
  cm: Point2D,
  points: ReadonlyArray<Point2D>,
  radiusCm: number,
): number | null {
  let best = -1
  let bestDist = radiusCm
  for (let i = 0; i < points.length; i++) {
    const dist = Math.hypot(points[i].x - cm.x, points[i].y - cm.y)
    if (dist <= bestDist) {
      best = i
      bestDist = dist
    }
  }
  return best < 0 ? null : best
}

/** Cursorrichting vanaf start → eindpunt op vaste lengte (cm). Geen richting → +X. */
export function endFromDirection(start: Point2D, hover: Point2D, lengthCm: number): Point2D {
  const dx = hover.x - start.x
  const dy = hover.y - start.y
  const len = Math.hypot(dx, dy)
  if (len < EPS) {
    return { x: start.x + lengthCm, y: start.y }
  }
  const scale = lengthCm / len
  return { x: start.x + dx * scale, y: start.y + dy * scale }
}

/**
 * Kamer-eindhoek: H/V in cm met teken uit hover-kwadrant.
 * Geen hover-delta → +X / +Y.
 */
export function roomEndFromHv(start: Point2D, hover: Point2D, hCm: number, vCm: number): Point2D {
  const dx = hover.x - start.x
  const dy = hover.y - start.y
  const sx = Math.abs(dx) < EPS ? 1 : Math.sign(dx)
  const sy = Math.abs(dy) < EPS ? 1 : Math.sign(dy)
  return {
    x: start.x + sx * Math.abs(hCm),
    y: start.y + sy * Math.abs(vCm),
  }
}

/**
 * Parse maat → cm. Zonder suffix = `defaultUnit` (schaalliniaal).
 * Expliciet wint: `2m` / `200cm` / `2000mm` / `1' 5"` / `66"` (komma of punt).
 */
export function parseDrawLengthToCm(raw: string, defaultUnit: ScaleInputUnit = 'm'): number | null {
  const cm = parseScaleInput(raw, defaultUnit)
  if (cm === null || !Number.isFinite(cm) || cm === 0) return null
  return cm
}

/** cm → weergave in de gekozen eenheid (trailing zeros weg). */
export function formatDrawLength(cm: number, unit: ScaleInputUnit = 'm'): string {
  return formatScaleInputValue(cm, unit)
}

export function formatDrawLengthMeters(cm: number): string {
  return formatDrawLength(cm, 'm')
}

/** Draft-buffer: accepteert `3.` / `-` / `5'` terwijl je typt. */
export function parseDrawLengthDraftToCm(
  raw: string,
  defaultUnit: ScaleInputUnit = 'm',
): number | null {
  const trimmed = raw.trim().toLowerCase().replace(',', '.')
  if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === '-.') return null
  return parseDrawLengthToCm(trimmed.replace(/\.+$/, ''), defaultUnit)
}

export function formatDrawTypeLabel(
  typeText: string,
  cm: number,
  unit: ScaleInputUnit = 'm',
): string {
  return typeText || formatDrawLength(cm, unit)
}

/** Letters die in unit-suffixen voorkomen (mm/cm/m/in/inch). */
const DRAW_TYPE_UNIT_LETTERS = new Set(['m', 'c', 'i', 'n', 'h', 'e', 's'])

/** Cijfers / komma / min / feet-inch / unit-letters / backspace — niet in een echt invoerveld. */
export function isDrawTypeLengthKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (event.key === 'Backspace' || event.key === 'Delete') return true
  if (event.key === '-' || event.key === ',' || event.key === '.') return true
  if (event.key === "'" || event.key === '"' || event.key === '/' || event.key === ' ') return true
  if (event.key.length === 1 && DRAW_TYPE_UNIT_LETTERS.has(event.key.toLowerCase())) return true
  return event.key.length === 1 && event.key >= '0' && event.key <= '9'
}

/** Tab / x wisselt H ↔ V bij kamertekenen. */
export function isDrawTypeRoomFieldKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (event.key === 'Tab') return true
  const key = event.key.toLowerCase()
  return key === 'x' || key === '*'
}

export function applyDrawTypeKey(text: string, key: string): string | null {
  if (key === 'Backspace') return text.slice(0, -1)
  if (key === 'Delete') return ''
  if (key === '-') return text.startsWith('-') ? text.slice(1) : `-${text}`
  if (key === ',' || key === '.') {
    const body = text.startsWith('-') ? text.slice(1) : text
    if (body.includes('.') || body.includes(',')) return text
    return `${text}.`
  }
  if (key === "'" || key === '"' || key === '/' || key === ' ') return text + key
  if (key.length === 1 && DRAW_TYPE_UNIT_LETTERS.has(key.toLowerCase())) {
    return text + key.toLowerCase()
  }
  if (key.length === 1 && key >= '0' && key <= '9') return text + key
  return null
}
