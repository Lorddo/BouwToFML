import { cloneFloorShallow } from './clone-floor-shallow'
import { mirrorObjectLabelX, rotateObjectLabel90 } from './object-label'
import { resolveFixtureCatalog } from './fixture-refid-catalog'
import type {
  DrawingMeta,
  Floor,
  FloorArea,
  FloorDesign,
  FloorDimension,
  FloorItem,
  FloorLabel,
  FloorLine,
  FloorPlan,
  FloorSurface,
  Opening,
  Point2D,
  Wall,
} from './types'

/** D4-orientatie t.o.v. canonieke generate (vóór spiegel/rotatie). */
export type FloorOrientState = {
  quarterTurnsCw: 0 | 1 | 2 | 3
  flipX: boolean
}

export type FloorOrientOp = 'flipX' | 'rotCw' | 'rotCcw'

export type Rotate90Dir = 'cw' | 'ccw'

const IDENTITY_ORIENT: FloorOrientState = { quarterTurnsCw: 0, flipX: false }

function mapPlanFloor(
  plan: FloorPlan,
  floorIndex: number | null | undefined,
  mapFloor: (floor: Floor) => Floor,
): FloorPlan {
  if (floorIndex == null) {
    return {
      ...plan,
      floors: plan.floors.map(mapFloor),
    }
  }
  const idx = Math.max(0, Math.min(floorIndex, plan.floors.length - 1))
  return {
    ...plan,
    floors: plan.floors.map((floor, i) => (i === idx ? mapFloor(floor) : cloneFloorShallow(floor))),
  }
}

function toggleMirroredBit(
  mirrored: [number, number] | undefined,
  index: 0 | 1,
): [number, number] | undefined {
  if (!mirrored) {
    const next: [number, number] = [0, 0]
    next[index] = 1
    return next
  }
  const next: [number, number] = [mirrored[0] === 1 ? 1 : 0, mirrored[1] === 1 ? 1 : 0]
  next[index] = next[index] === 1 ? 0 : 1
  return next
}

function mirrorOpening(op: Opening): Opening {
  return {
    ...mirrorObjectLabelX(op),
    mirrored: toggleMirroredBit(op.mirrored, 1),
  }
}

function mirrorPointX(p: Point2D, axisXCm: number): Point2D {
  return { x: 2 * axisXCm - p.x, y: p.y }
}

function invertBalance(balance: number | undefined): number | undefined {
  if (balance == null) return balance
  return Math.round((1 - balance) * 100) / 100
}

function mirrorWall(wall: Wall, axisXCm: number): Wall {
  return {
    ...wall,
    a: mirrorPointX(wall.a, axisXCm),
    b: mirrorPointX(wall.b, axisXCm),
    c: wall.c ? mirrorPointX(wall.c, axisXCm) : wall.c,
    balance: invertBalance(wall.balance),
    openings: wall.openings.map(mirrorOpening),
  }
}

function normalizeRotationDeg(deg: number): number {
  let next = deg % 360
  if (next > 180) next -= 360
  if (next <= -180) next += 360
  return next
}

/** Noordkruis wijst wereld-noord; X-flip mag glyph/heading niet omdraaien (N niet achterstevoren). */
function keepsWorldHeadingOnMirror(item: FloorItem): boolean {
  return resolveFixtureCatalog(item.refid).kind === 'north_cross'
}

function mirrorItem(item: FloorItem, axisXCm: number): FloorItem {
  const x = 2 * axisXCm - item.x
  if (keepsWorldHeadingOnMirror(item)) {
    return { ...mirrorObjectLabelX(item), x }
  }
  const rotation = item.rotation ?? 0
  return {
    ...mirrorObjectLabelX(item),
    x,
    rotation: normalizeRotationDeg(-rotation),
    mirrored: toggleMirroredBit(item.mirrored, 0),
  }
}

function mirrorArea(area: FloorArea, axisXCm: number): FloorArea {
  return {
    ...mirrorObjectLabelX(area),
    poly: area.poly.map((p) => mirrorPointX(p, axisXCm)),
  }
}

function mirrorSurface(surface: FloorSurface, axisXCm: number): FloorSurface {
  return {
    ...mirrorObjectLabelX(surface),
    poly: surface.poly.map((p) => ({ ...mirrorPointX(p, axisXCm), z: p.z })),
  }
}

function mirrorLabel(label: FloorLabel, axisXCm: number): FloorLabel {
  return {
    ...label,
    x: 2 * axisXCm - label.x,
    rotation: normalizeRotationDeg(-label.rotation),
  }
}

function mirrorLine(line: FloorLine, axisXCm: number): FloorLine {
  return {
    ...line,
    a: mirrorPointX(line.a, axisXCm),
    b: mirrorPointX(line.b, axisXCm),
  }
}

function mirrorDimension(dim: FloorDimension, axisXCm: number): FloorDimension {
  return {
    ...dim,
    a: mirrorPointX(dim.a, axisXCm),
    b: mirrorPointX(dim.b, axisXCm),
  }
}

function mirrorDrawing(drawing: DrawingMeta | undefined, axisXCm: number): DrawingMeta | undefined {
  if (!drawing) return drawing
  return {
    ...drawing,
    x: 2 * axisXCm - drawing.x,
  }
}

function mirrorCamera(camera: unknown, axisXCm: number): unknown {
  if (!camera || typeof camera !== 'object') return camera
  const c = camera as Record<string, unknown>
  const next = { ...c }
  if (typeof c.x === 'number') next.x = 2 * axisXCm - c.x
  if (typeof c.dx === 'number') next.dx = -c.dx
  return next
}

function mirrorDesign(design: FloorDesign, axisXCm: number): FloorDesign {
  return {
    ...design,
    walls: design.walls.map((wall) => mirrorWall(wall, axisXCm)),
    items: design.items?.map((item) => mirrorItem(item, axisXCm)),
    areas: design.areas?.map((area) => mirrorArea(area, axisXCm)),
    surfaces: design.surfaces?.map((surface) => mirrorSurface(surface, axisXCm)),
    labels: design.labels?.map((label) => mirrorLabel(label, axisXCm)),
    lines: design.lines?.map((line) => mirrorLine(line, axisXCm)),
    dimensions: design.dimensions?.map((dim) => mirrorDimension(dim, axisXCm)),
    source: design.source
      ? {
          ...design.source,
          cameras: design.source.cameras?.map((cam) => mirrorCamera(cam, axisXCm)),
        }
      : design.source,
  }
}

function mirrorFloor(floor: Floor, axisXCm: number): Floor {
  const designs = floor.designs?.map((d) => mirrorDesign(d, axisXCm))
  const activeIdx = floor.activeDesignIndex ?? 0
  const active = designs?.[activeIdx]
  return {
    ...floor,
    walls: active?.walls ?? floor.walls.map((wall) => mirrorWall(wall, axisXCm)),
    items: active?.items ?? floor.items?.map((item) => mirrorItem(item, axisXCm)),
    areas: active?.areas ?? floor.areas?.map((area) => mirrorArea(area, axisXCm)),
    surfaces: active?.surfaces ?? floor.surfaces?.map((surface) => mirrorSurface(surface, axisXCm)),
    labels: active?.labels ?? floor.labels?.map((label) => mirrorLabel(label, axisXCm)),
    lines: active?.lines ?? floor.lines?.map((line) => mirrorLine(line, axisXCm)),
    dimensions: active?.dimensions ?? floor.dimensions?.map((dim) => mirrorDimension(dim, axisXCm)),
    drawing: mirrorDrawing(floor.drawing, axisXCm),
    designs,
    source: floor.source
      ? {
          ...floor.source,
          cameras: floor.source.cameras?.map((cam) => mirrorCamera(cam, axisXCm)),
        }
      : floor.source,
  }
}

/**
 * Reflecteer over verticale as `x = axisXCm` (default nulpunt: Y-as).
 * a/b niet wisselen; Opening.t blijft; mirrored[1] + balance inverteren.
 * Noordkruis (`north_cross`): positie wel, rotatie/`mirrored` niet — pijl blijft wereld-noord.
 */
export function mirrorFloorPlanVertical(
  plan: FloorPlan,
  axisXCm = 0,
  floorIndex?: number | null,
): FloorPlan {
  return mapPlanFloor(plan, floorIndex, (floor) => mirrorFloor(floor, axisXCm))
}

/** Y-down scherm: CW = (dx,dy) → (−dy, dx); CCW = (dx,dy) → (dy, −dx). */
function rotatePoint90(p: Point2D, pivot: Point2D, dir: Rotate90Dir): Point2D {
  const dx = p.x - pivot.x
  const dy = p.y - pivot.y
  if (dir === 'cw') {
    return { x: pivot.x - dy, y: pivot.y + dx }
  }
  return { x: pivot.x + dy, y: pivot.y - dx }
}

function rotateWall90(wall: Wall, pivot: Point2D, dir: Rotate90Dir): Wall {
  return {
    ...wall,
    a: rotatePoint90(wall.a, pivot, dir),
    b: rotatePoint90(wall.b, pivot, dir),
    c: wall.c ? rotatePoint90(wall.c, pivot, dir) : wall.c,
    openings: wall.openings.map((op) => rotateObjectLabel90(op, dir)),
  }
}

function rotateItem90(item: FloorItem, pivot: Point2D, dir: Rotate90Dir): FloorItem {
  const rotated = rotatePoint90({ x: item.x, y: item.y }, pivot, dir)
  const delta = dir === 'cw' ? 90 : -90
  return {
    ...rotateObjectLabel90(item, dir),
    x: rotated.x,
    y: rotated.y,
    rotation: normalizeRotationDeg((item.rotation ?? 0) + delta),
  }
}

function rotateArea90(area: FloorArea, pivot: Point2D, dir: Rotate90Dir): FloorArea {
  return {
    ...rotateObjectLabel90(area, dir),
    poly: area.poly.map((p) => rotatePoint90(p, pivot, dir)),
  }
}

function rotateSurface90(surface: FloorSurface, pivot: Point2D, dir: Rotate90Dir): FloorSurface {
  return {
    ...rotateObjectLabel90(surface, dir),
    poly: surface.poly.map((p) => ({ ...rotatePoint90(p, pivot, dir), z: p.z })),
  }
}

function rotateLabel90(label: FloorLabel, pivot: Point2D, dir: Rotate90Dir): FloorLabel {
  const rotated = rotatePoint90({ x: label.x, y: label.y }, pivot, dir)
  const delta = dir === 'cw' ? 90 : -90
  return {
    ...label,
    x: rotated.x,
    y: rotated.y,
    rotation: normalizeRotationDeg(label.rotation + delta),
  }
}

function rotateLine90(line: FloorLine, pivot: Point2D, dir: Rotate90Dir): FloorLine {
  return {
    ...line,
    a: rotatePoint90(line.a, pivot, dir),
    b: rotatePoint90(line.b, pivot, dir),
  }
}

function rotateDimension90(dim: FloorDimension, pivot: Point2D, dir: Rotate90Dir): FloorDimension {
  return {
    ...dim,
    a: rotatePoint90(dim.a, pivot, dir),
    b: rotatePoint90(dim.b, pivot, dir),
  }
}

function rotateDrawing90(
  drawing: DrawingMeta | undefined,
  pivot: Point2D,
  dir: Rotate90Dir,
): DrawingMeta | undefined {
  if (!drawing) return drawing
  const rotated = rotatePoint90({ x: drawing.x, y: drawing.y }, pivot, dir)
  const delta = dir === 'cw' ? 90 : -90
  return {
    ...drawing,
    x: rotated.x,
    y: rotated.y,
    rotation: normalizeRotationDeg(drawing.rotation + delta),
  }
}

function rotateCamera90(camera: unknown, pivot: Point2D, dir: Rotate90Dir): unknown {
  if (!camera || typeof camera !== 'object') return camera
  const c = camera as Record<string, unknown>
  const next = { ...c }
  if (typeof c.x === 'number' && typeof c.y === 'number') {
    const rotated = rotatePoint90({ x: c.x, y: c.y }, pivot, dir)
    next.x = rotated.x
    next.y = rotated.y
  }
  if (typeof c.dx === 'number' && typeof c.dy === 'number') {
    const d = rotatePoint90({ x: c.dx, y: c.dy }, { x: 0, y: 0 }, dir)
    next.dx = d.x
    next.dy = d.y
  }
  return next
}

function rotateDesign90(design: FloorDesign, pivot: Point2D, dir: Rotate90Dir): FloorDesign {
  return {
    ...design,
    walls: design.walls.map((wall) => rotateWall90(wall, pivot, dir)),
    items: design.items?.map((item) => rotateItem90(item, pivot, dir)),
    areas: design.areas?.map((area) => rotateArea90(area, pivot, dir)),
    surfaces: design.surfaces?.map((surface) => rotateSurface90(surface, pivot, dir)),
    labels: design.labels?.map((label) => rotateLabel90(label, pivot, dir)),
    lines: design.lines?.map((line) => rotateLine90(line, pivot, dir)),
    dimensions: design.dimensions?.map((dim) => rotateDimension90(dim, pivot, dir)),
    source: design.source
      ? {
          ...design.source,
          cameras: design.source.cameras?.map((cam) => rotateCamera90(cam, pivot, dir)),
        }
      : design.source,
  }
}

function rotateFloor90(floor: Floor, pivot: Point2D, dir: Rotate90Dir): Floor {
  const designs = floor.designs?.map((d) => rotateDesign90(d, pivot, dir))
  const activeIdx = floor.activeDesignIndex ?? 0
  const active = designs?.[activeIdx]
  return {
    ...floor,
    walls: active?.walls ?? floor.walls.map((wall) => rotateWall90(wall, pivot, dir)),
    items: active?.items ?? floor.items?.map((item) => rotateItem90(item, pivot, dir)),
    areas: active?.areas ?? floor.areas?.map((area) => rotateArea90(area, pivot, dir)),
    surfaces:
      active?.surfaces ?? floor.surfaces?.map((surface) => rotateSurface90(surface, pivot, dir)),
    labels: active?.labels ?? floor.labels?.map((label) => rotateLabel90(label, pivot, dir)),
    lines: active?.lines ?? floor.lines?.map((line) => rotateLine90(line, pivot, dir)),
    dimensions:
      active?.dimensions ?? floor.dimensions?.map((dim) => rotateDimension90(dim, pivot, dir)),
    drawing: rotateDrawing90(floor.drawing, pivot, dir),
    designs,
    source: floor.source
      ? {
          ...floor.source,
          cameras: floor.source.cameras?.map((cam) => rotateCamera90(cam, pivot, dir)),
        }
      : floor.source,
  }
}

/**
 * 90° rotatie om `pivot` (default nulpunt). mirrored/balance ongemoeid.
 */
export function rotateFloorPlan90(
  plan: FloorPlan,
  pivot: Point2D = { x: 0, y: 0 },
  dir: Rotate90Dir = 'cw',
  floorIndex?: number | null,
): FloorPlan {
  return mapPlanFloor(plan, floorIndex, (floor) => rotateFloor90(floor, pivot, dir))
}

export function defaultFloorOrient(): FloorOrientState {
  return { ...IDENTITY_ORIENT }
}

function asQuarter(n: number): 0 | 1 | 2 | 3 {
  const m = ((n % 4) + 4) % 4
  return m as 0 | 1 | 2 | 3
}

/**
 * Compose D4: na flipX is visueel-CW = canoniek CCW.
 * Ops op de huidige stand (viewer), state t.o.v. canonieke generate.
 */
export function composeFloorOrient(state: FloorOrientState, op: FloorOrientOp): FloorOrientState {
  if (op === 'flipX') {
    return { quarterTurnsCw: state.quarterTurnsCw, flipX: !state.flipX }
  }
  const step = op === 'rotCw' ? 1 : -1
  const signed = state.flipX ? -step : step
  return {
    quarterTurnsCw: asQuarter(state.quarterTurnsCw + signed),
    flipX: state.flipX,
  }
}

/**
 * Pas canonieke orient-staat toe op verse detectie (ná nulpunt).
 * Volgorde: eerst quarterTurnsCw om (0,0), daarna optioneel X-flip om x=0.
 */
export function applyFloorOrientFromCanonical(
  plan: FloorPlan,
  state: FloorOrientState | null | undefined,
  floorIndex = 0,
): FloorPlan {
  if (!state) return plan
  const turns = state.quarterTurnsCw
  let next = plan
  for (let i = 0; i < turns; i++) {
    next = rotateFloorPlan90(next, { x: 0, y: 0 }, 'cw', floorIndex)
  }
  if (state.flipX) {
    next = mirrorFloorPlanVertical(next, 0, floorIndex)
  }
  return next
}

/**
 * Incrementele knop op het huidige plan (handmatige edits blijven).
 * `floorIndex = null` = alle verdiepingen; default `0` = alleen floors[0].
 */
export function applyFloorOrientOp(
  plan: FloorPlan,
  op: FloorOrientOp,
  floorIndex: number | null = 0,
): FloorPlan {
  if (op === 'flipX') return mirrorFloorPlanVertical(plan, 0, floorIndex)
  return rotateFloorPlan90(plan, { x: 0, y: 0 }, op === 'rotCw' ? 'cw' : 'ccw', floorIndex)
}

export function isIdentityFloorOrient(state: FloorOrientState | null | undefined): boolean {
  if (!state) return true
  return state.quarterTurnsCw === 0 && !state.flipX
}
