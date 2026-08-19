import { cloneFloorShallow } from './clone-floor-shallow'
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
  Point2D,
  Wall,
} from './types'

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

function translateArea(area: FloorArea, dx: number, dy: number): FloorArea {
  return {
    ...area,
    poly: area.poly.map((p) => translatePoint(p, dx, dy)),
  }
}

function translateSurface(surface: FloorSurface, dx: number, dy: number): FloorSurface {
  return {
    ...surface,
    poly: surface.poly.map((p) => ({
      ...translatePoint(p, dx, dy),
      z: p.z,
    })),
  }
}

function translateLabel(label: FloorLabel, dx: number, dy: number): FloorLabel {
  return {
    ...label,
    x: label.x + dx,
    y: label.y + dy,
  }
}

function translateLine(line: FloorLine, dx: number, dy: number): FloorLine {
  return {
    ...line,
    a: translatePoint(line.a, dx, dy),
    b: translatePoint(line.b, dx, dy),
  }
}

function translateDimension(dim: FloorDimension, dx: number, dy: number): FloorDimension {
  return {
    ...dim,
    a: translatePoint(dim.a, dx, dy),
    b: translatePoint(dim.b, dx, dy),
  }
}

function translateDrawing(
  drawing: DrawingMeta | undefined,
  dx: number,
  dy: number,
): DrawingMeta | undefined {
  if (!drawing) return drawing
  return {
    ...drawing,
    x: drawing.x + dx,
    y: drawing.y + dy,
  }
}

function translateCamera(camera: unknown, dx: number, dy: number): unknown {
  if (!camera || typeof camera !== 'object') return camera
  const c = camera as Record<string, unknown>
  const next = { ...c }
  if (typeof c.x === 'number') next.x = c.x + dx
  if (typeof c.y === 'number') next.y = c.y + dy
  return next
}

function translateDesign(design: FloorDesign, dx: number, dy: number): FloorDesign {
  return {
    ...design,
    walls: design.walls.map((wall) => translateWall(wall, dx, dy)),
    items: design.items?.map((item) => translateItem(item, dx, dy)),
    areas: design.areas?.map((area) => translateArea(area, dx, dy)),
    surfaces: design.surfaces?.map((surface) => translateSurface(surface, dx, dy)),
    labels: design.labels?.map((label) => translateLabel(label, dx, dy)),
    lines: design.lines?.map((line) => translateLine(line, dx, dy)),
    dimensions: design.dimensions?.map((dim) => translateDimension(dim, dx, dy)),
    source: design.source
      ? {
          ...design.source,
          cameras: design.source.cameras?.map((cam) => translateCamera(cam, dx, dy)),
        }
      : design.source,
  }
}

function translateFloor(floor: Floor, dx: number, dy: number): Floor {
  const designs = floor.designs?.map((d) => translateDesign(d, dx, dy))
  const activeIdx = floor.activeDesignIndex ?? 0
  const active = designs?.[activeIdx]
  return {
    ...floor,
    walls: active?.walls ?? floor.walls.map((wall) => translateWall(wall, dx, dy)),
    items: active?.items ?? floor.items?.map((item) => translateItem(item, dx, dy)),
    areas: active?.areas ?? floor.areas?.map((area) => translateArea(area, dx, dy)),
    surfaces:
      active?.surfaces ?? floor.surfaces?.map((surface) => translateSurface(surface, dx, dy)),
    labels: active?.labels ?? floor.labels?.map((label) => translateLabel(label, dx, dy)),
    lines: active?.lines ?? floor.lines?.map((line) => translateLine(line, dx, dy)),
    dimensions:
      active?.dimensions ?? floor.dimensions?.map((dim) => translateDimension(dim, dx, dy)),
    drawing: translateDrawing(floor.drawing, dx, dy),
    designs,
    source: floor.source
      ? {
          ...floor.source,
          cameras: floor.source.cameras?.map((cam) => translateCamera(cam, dx, dy)),
        }
      : floor.source,
  }
}

/** Verschuif floor-coords (muren + items + areas/surfaces + labels/lijnen/dims + alle designs + drawing). */
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
