import type { Floor, FloorItem, FloorPlan, Opening, Point2D, Wall } from './types'

/** D4-orientatie t.o.v. canonieke generate (vóór spiegel/rotatie). */
export type FloorOrientState = {
  quarterTurnsCw: 0 | 1 | 2 | 3
  flipX: boolean
}

export type FloorOrientOp = 'flipX' | 'rotCw' | 'rotCcw'

export type Rotate90Dir = 'cw' | 'ccw'

const IDENTITY_ORIENT: FloorOrientState = { quarterTurnsCw: 0, flipX: false }

function cloneFloorShallow(floor: Floor): Floor {
  return {
    ...floor,
    walls: floor.walls.map((wall) => ({
      ...wall,
      openings: wall.openings.map((op) => ({ ...op })),
    })),
    items: floor.items?.map((item) => ({ ...item })),
  }
}

function mapPlanFloor(
  plan: FloorPlan,
  floorIndex: number | undefined,
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
    ...op,
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

function mirrorItem(item: FloorItem, axisXCm: number): FloorItem {
  const rotation = item.rotation ?? 0
  return {
    ...item,
    x: 2 * axisXCm - item.x,
    rotation: normalizeRotationDeg(-rotation),
    mirrored: toggleMirroredBit(item.mirrored, 0),
  }
}

function mirrorFloor(floor: Floor, axisXCm: number): Floor {
  return {
    ...floor,
    walls: floor.walls.map((wall) => mirrorWall(wall, axisXCm)),
    items: floor.items?.map((item) => mirrorItem(item, axisXCm)),
  }
}

/**
 * Reflecteer over verticale as `x = axisXCm` (default nulpunt: Y-as).
 * a/b niet wisselen; Opening.t blijft; mirrored[1] + balance inverteren.
 */
export function mirrorFloorPlanVertical(
  plan: FloorPlan,
  axisXCm = 0,
  floorIndex?: number,
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
    openings: wall.openings.map((op) => ({ ...op })),
  }
}

function rotateItem90(item: FloorItem, pivot: Point2D, dir: Rotate90Dir): FloorItem {
  const rotated = rotatePoint90({ x: item.x, y: item.y }, pivot, dir)
  const delta = dir === 'cw' ? 90 : -90
  return {
    ...item,
    x: rotated.x,
    y: rotated.y,
    rotation: normalizeRotationDeg((item.rotation ?? 0) + delta),
  }
}

function rotateFloor90(floor: Floor, pivot: Point2D, dir: Rotate90Dir): Floor {
  return {
    ...floor,
    walls: floor.walls.map((wall) => rotateWall90(wall, pivot, dir)),
    items: floor.items?.map((item) => rotateItem90(item, pivot, dir)),
  }
}

/**
 * 90° rotatie om `pivot` (default nulpunt). mirrored/balance ongemoeid.
 */
export function rotateFloorPlan90(
  plan: FloorPlan,
  pivot: Point2D = { x: 0, y: 0 },
  dir: Rotate90Dir = 'cw',
  floorIndex?: number,
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

/** Incrementele knop op het huidige plan (handmatige edits blijven). */
export function applyFloorOrientOp(plan: FloorPlan, op: FloorOrientOp, floorIndex = 0): FloorPlan {
  if (op === 'flipX') return mirrorFloorPlanVertical(plan, 0, floorIndex)
  return rotateFloorPlan90(plan, { x: 0, y: 0 }, op === 'rotCw' ? 'cw' : 'ccw', floorIndex)
}

export function isIdentityFloorOrient(state: FloorOrientState | null | undefined): boolean {
  if (!state) return true
  return state.quarterTurnsCw === 0 && !state.flipX
}
