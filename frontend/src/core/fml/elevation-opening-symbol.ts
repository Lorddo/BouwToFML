/**
 * Parametrisch vooraanzicht per catalogus-kind (geen SVG per refid).
 * Kozijn zit in het FML-gat; X-frame al geschaald naar geprojecteerde breedte.
 */
import { resolveHingeAtStart } from './door-swing-symbol'
import { insetOpeningRect, resolveOpeningFrame, type OpeningFrameCm } from './opening-display-geom'
import {
  resolveOpeningCatalog,
  resolveWindowPanelCount,
  type OpeningCatalogInfo,
  type OpeningLeafKind,
} from './opening-refid-catalog'
import type { OpeningType, Point2D } from './types'

export type ElevationGlyphRole =
  'frame' | 'leaf' | 'glass' | 'mullion' | 'hinge' | 'handle' | 'panel' | 'railing'

/** Deurkrukhoogte vanaf de dorpel (NEN-achtig, leesbaar in aanzicht). */
const HANDLE_HEIGHT_FROM_SILL_CM = 105
const HANDLE_ROSE_R_CM = 2.4
const HANDLE_LEVER_LEN_CM = 12
const HANDLE_LEVER_THICK_CM = 1.8
const HANDLE_INSET_CM = 7

export interface ElevationGlyphPoly {
  role: ElevationGlyphRole
  points: number[]
  closed?: boolean
  fill?: boolean
}

export interface ElevationGlyphCircle {
  role: ElevationGlyphRole
  cx: number
  cy: number
  radius: number
  fill?: boolean
}

export interface ElevationOpeningSymbol {
  polys: ElevationGlyphPoly[]
  circles: ElevationGlyphCircle[]
  inner: { x0: number; y0: number; x1: number; y1: number }
}

export interface ElevationOpeningOuter {
  x0: number
  y0: number
  x1: number
  y1: number
}

function rectPoints(x0: number, y0: number, x1: number, y1: number): number[] {
  return [x0, y0, x1, y0, x1, y1, x0, y1]
}

function pushRect(
  polys: ElevationGlyphPoly[],
  role: ElevationGlyphRole,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fill = true,
): void {
  if (x1 - x0 < 0.2 || y1 - y0 < 0.2) return
  polys.push({ role, points: rectPoints(x0, y0, x1, y1), closed: true, fill })
}

function pushLine(
  polys: ElevationGlyphPoly[],
  role: ElevationGlyphRole,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  polys.push({ role, points: [x0, y0, x1, y1], closed: false, fill: false })
}

function pushFrameBands(
  polys: ElevationGlyphPoly[],
  outer: ElevationOpeningOuter,
  frame: OpeningFrameCm,
): void {
  const { x0, y0, x1, y1 } = outer
  pushRect(polys, 'frame', x0, y0, x0 + frame.leftCm, y1)
  pushRect(polys, 'frame', x1 - frame.rightCm, y0, x1, y1)
  pushRect(polys, 'frame', x0 + frame.leftCm, y0, x1 - frame.rightCm, y0 + frame.topCm)
  pushRect(polys, 'frame', x0 + frame.leftCm, y1 - frame.bottomCm, x1 - frame.rightCm, y1)
}

function sampleArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start: number,
  end: number,
  steps: number,
): number[] {
  const points: number[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const a = start + (end - start) * t
    points.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)
  }
  return points
}

function stileThicknessCm(frame: OpeningFrameCm, spanCm: number, count: number): number {
  const raw = Math.max(frame.leftCm, frame.rightCm, 2)
  const max = Math.max(1, (spanCm / Math.max(1, count + 1)) * 0.35)
  return Math.min(raw, max)
}

function pushStile(
  polys: ElevationGlyphPoly[],
  xCenter: number,
  y0: number,
  y1: number,
  thicknessCm: number,
): void {
  const half = thicknessCm / 2
  pushRect(polys, 'frame', xCenter - half, y0, xCenter + half, y1)
}

function hingeOnLeft(mirrored: [number, number] | undefined, startOnLeft: boolean): boolean {
  const atStart = resolveHingeAtStart(mirrored)
  return startOnLeft ? atStart : !atStart
}

function pushHingeTicks(
  polys: ElevationGlyphPoly[],
  inner: ElevationOpeningOuter,
  onLeft: boolean,
): void {
  const x = onLeft ? inner.x0 : inner.x1
  const h = inner.y1 - inner.y0
  const tick = Math.min(8, Math.max(4, (inner.x1 - inner.x0) * 0.08))
  const dir = onLeft ? 1 : -1
  for (const t of [0.25, 0.5, 0.75]) {
    const y = inner.y0 + h * t
    pushLine(polys, 'hinge', x, y, x + dir * tick, y)
  }
}

function handleCy(inner: ElevationOpeningOuter): number {
  const height = inner.y1 - inner.y0
  const raw = inner.y1 - HANDLE_HEIGHT_FROM_SILL_CM
  const lo = inner.y0 + height * 0.22
  const hi = inner.y1 - height * 0.14
  return Math.min(hi, Math.max(lo, raw))
}

/** Kruk: rozet + hefboom naar binnen, op de sluit-/schuifkant. */
function pushLeverHandle(
  polys: ElevationGlyphPoly[],
  circles: ElevationGlyphCircle[],
  inner: ElevationOpeningOuter,
  onLeft: boolean,
): void {
  const span = inner.x1 - inner.x0
  const height = inner.y1 - inner.y0
  if (span < 16 || height < 36) return
  const inset = Math.min(HANDLE_INSET_CM, span * 0.2)
  const leverLen = Math.min(HANDLE_LEVER_LEN_CM, span * 0.32)
  const roseR = Math.min(HANDLE_ROSE_R_CM, span * 0.07, height * 0.045)
  const leverH = Math.min(HANDLE_LEVER_THICK_CM, roseR * 1.5)
  const cx = onLeft ? inner.x0 + inset : inner.x1 - inset
  const cy = handleCy(inner)
  circles.push({ role: 'handle', cx, cy, radius: roseR, fill: true })
  const leverX0 = onLeft ? cx : cx - leverLen
  const leverX1 = onLeft ? cx + leverLen : cx
  pushRect(polys, 'handle', leverX0, cy - leverH / 2, leverX1, cy + leverH / 2)
}

function fillInner(
  polys: ElevationGlyphPoly[],
  inner: ElevationOpeningOuter,
  leaf: OpeningLeafKind,
): void {
  const role = leaf === 'glass' ? 'glass' : 'leaf'
  pushRect(polys, role, inner.x0, inner.y0, inner.x1, inner.y1)
}

function buildWindowRect(
  polys: ElevationGlyphPoly[],
  inner: ElevationOpeningOuter,
  panelCount: 1 | 2 | 3,
  frame: OpeningFrameCm,
  leaf: OpeningLeafKind = 'glass',
): void {
  pushRect(polys, leaf === 'glass' ? 'glass' : 'leaf', inner.x0, inner.y0, inner.x1, inner.y1)
  const span = inner.x1 - inner.x0
  const thickness = stileThicknessCm(frame, span, panelCount)
  for (let i = 1; i < panelCount; i += 1) {
    const x = inner.x0 + (span * i) / panelCount
    pushStile(polys, x, inner.y0, inner.y1, thickness)
  }
}

function buildGarage(polys: ElevationGlyphPoly[], inner: ElevationOpeningOuter): void {
  pushRect(polys, 'leaf', inner.x0, inner.y0, inner.x1, inner.y1)
  const rows = 5
  for (let i = 1; i < rows; i += 1) {
    const y = inner.y0 + ((inner.y1 - inner.y0) * i) / rows
    pushLine(polys, 'panel', inner.x0, y, inner.x1, y)
  }
}

function pushHingeTicksAtX(
  polys: ElevationGlyphPoly[],
  inner: ElevationOpeningOuter,
  x: number,
  towardRight: boolean,
): void {
  pushHingeTicks(polys, { ...inner, x0: x, x1: x }, towardRight)
}

/** Vouwdeur: 2 of 4 panelen; scharnier tussen de twee delen per deur. */
function buildBifold(
  polys: ElevationGlyphPoly[],
  circles: ElevationGlyphCircle[],
  inner: ElevationOpeningOuter,
  leaf: OpeningLeafKind,
  frame: OpeningFrameCm,
  mirrored: [number, number] | undefined,
  startOnLeft: boolean,
  double: boolean,
): void {
  fillInner(polys, inner, leaf)
  const span = inner.x1 - inner.x0
  const pairCount = double ? 4 : 2
  const thickness = stileThicknessCm(frame, span, pairCount)
  const hingeLeft = hingeOnLeft(mirrored, startOnLeft)
  if (!double) {
    const mid = (inner.x0 + inner.x1) / 2
    pushStile(polys, mid, inner.y0, inner.y1, thickness)
    pushHingeTicks(polys, inner, hingeLeft)
    pushHingeTicksAtX(polys, inner, mid, !hingeLeft)
    pushLeverHandle(polys, circles, inner, !hingeLeft)
    return
  }
  const q1 = inner.x0 + span * 0.25
  const mid = (inner.x0 + inner.x1) / 2
  const q3 = inner.x0 + span * 0.75
  pushStile(polys, q1, inner.y0, inner.y1, thickness)
  pushStile(polys, mid, inner.y0, inner.y1, thickness)
  pushStile(polys, q3, inner.y0, inner.y1, thickness)
  pushHingeTicks(polys, inner, true)
  pushHingeTicksAtX(polys, inner, q1, false)
  pushHingeTicksAtX(polys, inner, q3, true)
  pushHingeTicks(polys, inner, false)
  pushLeverHandle(polys, circles, { ...inner, x1: mid }, false)
  pushLeverHandle(polys, circles, { ...inner, x0: mid }, true)
}

function buildSliding(
  polys: ElevationGlyphPoly[],
  circles: ElevationGlyphCircle[],
  inner: ElevationOpeningOuter,
  kind: string,
  leaf: OpeningLeafKind,
  frame: OpeningFrameCm,
  mirrored: [number, number] | undefined,
  startOnLeft: boolean,
): void {
  fillInner(polys, inner, leaf)
  if (kind === 'sliding_pocket') {
    // Pocketkant = scharnier-einde; kruk op de vrije/grijpkant.
    pushLeverHandle(polys, circles, inner, !hingeOnLeft(mirrored, startOnLeft))
    return
  }
  const mid = (inner.x0 + inner.x1) / 2
  pushStile(polys, mid, inner.y0, inner.y1, stileThicknessCm(frame, inner.x1 - inner.x0, 2))
  if (kind === 'sliding') {
    pushLeverHandle(polys, circles, { ...inner, x1: mid }, false)
    pushLeverHandle(polys, circles, { ...inner, x0: mid }, true)
    return
  }
  // sliding_single: schuivend deel = eind-helft bij mirrored[0]=0 (zelfde als plattegrond-pijl).
  const slidingOnLeft = startOnLeft ? !resolveHingeAtStart(mirrored) : resolveHingeAtStart(mirrored)
  if (slidingOnLeft) {
    pushLeverHandle(polys, circles, { ...inner, x1: mid }, false)
  } else {
    pushLeverHandle(polys, circles, { ...inner, x0: mid }, true)
  }
}

/** Rechthoekige driehoek: verticaal op één jamb, basis op de dorpel. */
function trianglePoints(outer: ElevationOpeningOuter, apexOnLeft: boolean): Point2D[] {
  return [
    { x: outer.x0, y: outer.y1 },
    { x: outer.x1, y: outer.y1 },
    { x: apexOnLeft ? outer.x0 : outer.x1, y: outer.y0 },
  ]
}

function archHolePoints(outer: ElevationOpeningOuter, steps = 24): Point2D[] {
  const { x0, y0, x1, y1 } = outer
  const rx = Math.max(0.5, (x1 - x0) / 2)
  const cx = (x0 + x1) / 2
  const springY = Math.min(y1 - 0.5, y0 + rx)
  const ry = Math.max(0.5, springY - y0)
  const points: Point2D[] = [
    { x: x0, y: y1 },
    { x: x1, y: y1 },
  ]
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const a = 0 - Math.PI * t
    points.push({ x: cx + Math.cos(a) * rx, y: springY + Math.sin(a) * ry })
  }
  return points
}

function flattenPoints(points: Point2D[]): number[] {
  return points.flatMap((point) => [point.x, point.y])
}

function buildTriangle(
  polys: ElevationGlyphPoly[],
  outer: ElevationOpeningOuter,
  frame: OpeningFrameCm,
  mirrored: [number, number] | undefined,
  startOnLeft: boolean,
): void {
  const apexOnLeft = hingeOnLeft(mirrored, startOnLeft)
  const outerPts = trianglePoints(outer, apexOnLeft)
  const inner: ElevationOpeningOuter = {
    x0: outer.x0 + frame.leftCm,
    x1: outer.x1 - frame.rightCm,
    y0: outer.y0 + frame.topCm,
    y1: outer.y1 - frame.bottomCm,
  }
  if (inner.x1 - inner.x0 < 1 || inner.y1 - inner.y0 < 1) {
    polys.push({ role: 'glass', points: flattenPoints(outerPts), closed: true, fill: true })
    return
  }
  const innerPts = trianglePoints(inner, apexOnLeft)
  polys.push({
    role: 'frame',
    points: [...flattenPoints(outerPts), ...flattenPoints([...innerPts].reverse())],
    closed: true,
    fill: true,
  })
  polys.push({ role: 'glass', points: flattenPoints(innerPts), closed: true, fill: true })
}

/** Evenodd-gat in de baksteen; default rechthoek. */
export function elevationOpeningHolePoints(
  outer: ElevationOpeningOuter,
  type: OpeningType,
  refid: string,
  opts?: { mirrored?: [number, number]; startOnLeft?: boolean },
): Point2D[] {
  const catalog = resolveOpeningCatalog(refid, type)
  const kind = catalog.kind
  const symbol = catalog.elevationSymbol
  if (kind === 'archway' || symbol === 'archway') return archHolePoints(outer)
  if (kind === 'triangle' || symbol === 'triangle') {
    return trianglePoints(outer, hingeOnLeft(opts?.mirrored, opts?.startOnLeft !== false))
  }
  return [
    { x: outer.x0, y: outer.y0 },
    { x: outer.x1, y: outer.y0 },
    { x: outer.x1, y: outer.y1 },
    { x: outer.x0, y: outer.y1 },
  ]
}

function buildFrenchBalcony(polys: ElevationGlyphPoly[], inner: ElevationOpeningOuter): void {
  const railH = Math.min(80, (inner.y1 - inner.y0) * 0.4)
  const yTop = inner.y1 - railH
  const bars = 5
  for (let i = 0; i <= bars; i += 1) {
    const x = inner.x0 + ((inner.x1 - inner.x0) * i) / bars
    pushLine(polys, 'railing', x, yTop, x, inner.y1)
  }
  pushLine(polys, 'railing', inner.x0, yTop, inner.x1, yTop)
}

function buildRound(
  circles: ElevationGlyphCircle[],
  polys: ElevationGlyphPoly[],
  outer: ElevationOpeningOuter,
  frame: OpeningFrameCm,
  half: boolean,
): void {
  const cx = (outer.x0 + outer.x1) / 2
  const rx = Math.max(0.5, (outer.x1 - outer.x0) / 2)
  const height = Math.max(0.5, outer.y1 - outer.y0)
  const ring = Math.min(frame.leftCm, frame.topCm, rx * 0.4, height * 0.4)
  if (half) {
    // Y omlaag: platte kant op de dorpel (y1), boog omhoog naar y0 (θ = π → 2π).
    const cy = outer.y1
    const ry = height
    const innerRx = Math.max(1, rx - ring)
    const innerRy = Math.max(1, ry - ring)
    const outerUp = sampleArc(cx, cy, rx, ry, Math.PI, Math.PI * 2, 28)
    const innerDown = sampleArc(cx, cy, innerRx, innerRy, Math.PI * 2, Math.PI, 28)
    polys.push({
      role: 'frame',
      points: [...outerUp, ...innerDown],
      closed: true,
      fill: true,
    })
    const glass = sampleArc(cx, cy, innerRx, innerRy, Math.PI, Math.PI * 2, 28)
    polys.push({
      role: 'glass',
      points: [...glass, cx + innerRx, cy, cx - innerRx, cy],
      closed: true,
      fill: true,
    })
    return
  }
  const cy = (outer.y0 + outer.y1) / 2
  const radius = Math.min(rx, height / 2)
  const innerR = Math.max(1, radius - ring)
  circles.push({ role: 'frame', cx, cy, radius, fill: true })
  circles.push({ role: 'glass', cx, cy, radius: innerR, fill: true })
}

export function glyphFromElevationRect(rect: {
  x0: number
  y0: number
  x1: number
  y1: number
  type: OpeningCatalogInfo['type']
  refid: string
  mirrored?: [number, number]
  widthCm: number
  extras?: import('./types').FmlExtras
  /** Muur-a ligt links in het aanzicht (`xa <= xb`). Default true. */
  startOnLeft?: boolean
}): ElevationOpeningSymbol {
  const catalog = resolveOpeningCatalog(rect.refid, rect.type)
  const base = resolveOpeningFrame({ extras: rect.extras }, catalog)
  const projW = Math.max(0.1, rect.x1 - rect.x0)
  const worldW = Math.max(0.1, rect.widthCm)
  const scaleX = projW / worldW
  return buildElevationOpeningSymbol({
    outer: { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 },
    catalog,
    frame: {
      leftCm: base.leftCm * scaleX,
      rightCm: base.rightCm * scaleX,
      topCm: base.topCm,
      bottomCm: base.bottomCm,
    },
    mirrored: rect.mirrored,
    startOnLeft: rect.startOnLeft,
  })
}

export function buildElevationOpeningSymbol(params: {
  outer: ElevationOpeningOuter
  catalog: OpeningCatalogInfo
  frame: OpeningFrameCm
  mirrored?: [number, number]
  startOnLeft?: boolean
}): ElevationOpeningSymbol {
  const width = Math.max(0, params.outer.x1 - params.outer.x0)
  const height = Math.max(0, params.outer.y1 - params.outer.y0)
  const inset = insetOpeningRect({ width, height }, params.frame)
  const inner: ElevationOpeningOuter = {
    x0: params.outer.x0 + inset.frame.leftCm,
    x1: params.outer.x1 - inset.frame.rightCm,
    y0: params.outer.y0 + inset.frame.topCm,
    y1: params.outer.y1 - inset.frame.bottomCm,
  }
  const polys: ElevationGlyphPoly[] = []
  const circles: ElevationGlyphCircle[] = []
  const symbol = params.catalog.elevationSymbol
  const kind = params.catalog.kind
  const leaf = params.catalog.leaf
  const startOnLeft = params.startOnLeft !== false
  const hingeLeft = hingeOnLeft(params.mirrored, startOnLeft)

  if (params.catalog.type === 'window' && (kind === 'round' || symbol === 'round')) {
    buildRound(circles, polys, params.outer, inset.frame, false)
    return { polys, circles, inner }
  }
  if (params.catalog.type === 'window' && (kind === 'half_round' || symbol === 'half_round')) {
    buildRound(circles, polys, params.outer, inset.frame, true)
    return { polys, circles, inner }
  }
  if (params.catalog.type === 'window' && (kind === 'triangle' || symbol === 'triangle')) {
    buildTriangle(polys, params.outer, inset.frame, params.mirrored, startOnLeft)
    return { polys, circles, inner }
  }

  const frameless = kind === 'passage' || kind === 'archway'
  if (!frameless) {
    pushFrameBands(polys, params.outer, inset.frame)
  }

  if (params.catalog.type === 'window') {
    const panels = resolveWindowPanelCount(width, params.catalog.kind, params.catalog.panels)
    buildWindowRect(polys, inner, panels, inset.frame, leaf)
    return { polys, circles, inner }
  }

  if (frameless) {
    return { polys, circles, inner: params.outer }
  }

  if (kind === 'garage') {
    buildGarage(polys, inner)
    return { polys, circles, inner }
  }

  if (
    kind === 'bifold' ||
    kind === 'bifold_double' ||
    symbol === 'bifold' ||
    symbol === 'bifold_double'
  ) {
    buildBifold(
      polys,
      circles,
      inner,
      leaf,
      inset.frame,
      params.mirrored,
      startOnLeft,
      kind === 'bifold_double' || symbol === 'bifold_double',
    )
    return { polys, circles, inner }
  }

  if (kind === 'sliding' || kind === 'sliding_single' || kind === 'sliding_pocket') {
    buildSliding(polys, circles, inner, kind, leaf, inset.frame, params.mirrored, startOnLeft)
    return { polys, circles, inner }
  }

  if (kind === 'double_wide') {
    fillInner(polys, inner, leaf)
    const mid = (inner.x0 + inner.x1) / 2
    pushStile(polys, mid, inner.y0, inner.y1, stileThicknessCm(inset.frame, inner.x1 - inner.x0, 2))
    pushHingeTicks(polys, { ...inner, x1: mid }, true)
    pushHingeTicks(polys, { ...inner, x0: mid }, false)
    pushLeverHandle(polys, circles, { ...inner, x1: mid }, false)
    pushLeverHandle(polys, circles, { ...inner, x0: mid }, true)
    return { polys, circles, inner }
  }

  fillInner(polys, inner, leaf)
  pushHingeTicks(polys, inner, hingeLeft)
  pushLeverHandle(polys, circles, inner, !hingeLeft)
  if (kind === 'french_balcony') {
    buildFrenchBalcony(polys, inner)
  }
  return { polys, circles, inner }
}
