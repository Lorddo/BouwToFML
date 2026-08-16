import type { Floor, FloorItem, FloorPlan, Point2D, Wall } from './types'

export type UnderlayOriginLayout = {
  origin: Point2D
  pxPerMmX: number
  pxPerMmY: number
  /** Onderlegger-rotatie in graden (FML drawing.rotation); ontbrekend = 0. */
  rotationDeg?: number
  /** Display-only: Konva scaleX −1 om bitmap-midden. */
  flipX?: boolean
}

function translatePoint(p: Point2D, dx: number, dy: number): Point2D {
  return { x: p.x + dx, y: p.y + dy }
}

function translateWall(wall: Wall, dx: number, dy: number): Wall {
  return {
    ...wall,
    a: translatePoint(wall.a, dx, dy),
    b: translatePoint(wall.b, dx, dy),
    c: wall.c ? translatePoint(wall.c, dx, dy) : wall.c,
    openings: wall.openings.map((op) => ({ ...op })),
  }
}

function translateItem(item: FloorItem, dx: number, dy: number): FloorItem {
  return {
    ...item,
    x: item.x + dx,
    y: item.y + dy,
  }
}

function translateFloor(floor: Floor, dx: number, dy: number): Floor {
  return {
    ...floor,
    walls: floor.walls.map((wall) => translateWall(wall, dx, dy)),
    items: floor.items?.map((item) => translateItem(item, dx, dy)),
  }
}

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

/** Verschuif floor-coords (muren a/b/c + items). Openings blijven `t`. */
export function translateFloorPlan(
  plan: FloorPlan,
  dx: number,
  dy: number,
  /** Alleen deze floor-index; default = alle floors (legacy). */
  floorIndex?: number,
): FloorPlan {
  if (dx === 0 && dy === 0) {
    return {
      ...plan,
      floors: plan.floors.map((floor) => cloneFloorShallow(floor)),
    }
  }
  if (floorIndex == null) {
    return {
      ...plan,
      floors: plan.floors.map((floor) => translateFloor(floor, dx, dy)),
    }
  }
  const idx = Math.max(0, Math.min(floorIndex, plan.floors.length - 1))
  return {
    ...plan,
    floors: plan.floors.map((floor, i) =>
      i === idx ? translateFloor(floor, dx, dy) : cloneFloorShallow(floor),
    ),
  }
}

/**
 * Zet FML-punt `p` als (0,0) op één floor: muren − p, layout.origin += p.
 * `nulpuntImageCm = p + layout.origin` is stabiel in scant-ruimte.
 * @param floorIndex alleen deze verdieping in het plan (workspace = meestal 0)
 */
export function applyNulpunt(
  plan: FloorPlan,
  layout: UnderlayOriginLayout,
  p: Point2D,
  floorIndex = 0,
): {
  plan: FloorPlan
  layout: UnderlayOriginLayout
  nulpuntImageCm: Point2D
} {
  const nulpuntImageCm = {
    x: p.x + layout.origin.x,
    y: p.y + layout.origin.y,
  }
  return {
    plan: translateFloorPlan(plan, -p.x, -p.y, floorIndex),
    layout: {
      ...layout,
      origin: {
        x: layout.origin.x + p.x,
        y: layout.origin.y + p.y,
      },
    },
    nulpuntImageCm,
  }
}

/**
 * Na generate: plaats nulpuntImageCm op FML (0,0) i.p.v. bbox-min origin.
 * Invariant: wallCm = imageCm − origin.
 */
export function reapplyNulpuntImageCm(
  plan: FloorPlan,
  layout: UnderlayOriginLayout,
  nulpuntImageCm: Point2D,
  floorIndex = 0,
): { plan: FloorPlan; layout: UnderlayOriginLayout } {
  const p = {
    x: nulpuntImageCm.x - layout.origin.x,
    y: nulpuntImageCm.y - layout.origin.y,
  }
  const applied = applyNulpunt(plan, layout, p, floorIndex)
  return { plan: applied.plan, layout: applied.layout }
}
