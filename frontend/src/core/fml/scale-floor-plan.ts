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
import type { UnderlayOriginLayout } from './translate-floor-plan'
import { scaleObjectLabel } from './object-label'

/** Anisotrope plan-schaal (stap-1 H/V-achtig). */
export type PlanScaleFactors = { x: number; y: number }

function normalizeFactors(factor: number | PlanScaleFactors): PlanScaleFactors | null {
  if (typeof factor === 'number') {
    if (!Number.isFinite(factor)) return null
    return { x: factor, y: factor }
  }
  if (!Number.isFinite(factor.x) || !Number.isFinite(factor.y)) return null
  return { x: factor.x, y: factor.y }
}

function isIdentityFactors(f: PlanScaleFactors): boolean {
  return Math.abs(f.x - 1) < 1e-12 && Math.abs(f.y - 1) < 1e-12
}

function scalePoint(p: Point2D, f: PlanScaleFactors): Point2D {
  return { x: p.x * f.x, y: p.y * f.y }
}

/** Lengtefactor langs een segment na anisotrope schaal. */
function lengthScaleAlong(dx: number, dy: number, f: PlanScaleFactors): number {
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return Math.sqrt(Math.max(0, f.x * f.y))
  return Math.hypot(dx * f.x, dy * f.y) / len
}

function scaleWall(wall: Wall, f: PlanScaleFactors): Wall {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const along = lengthScaleAlong(dx, dy, f)
  return {
    ...wall,
    a: scalePoint(wall.a, f),
    b: scalePoint(wall.b, f),
    c: wall.c ? scalePoint(wall.c, f) : wall.c,
    // Muurdikte blijft — alleen plan-geometry (assen), zoals stap-1 H/V.
    openings: wall.openings.map((op) => ({
      ...scaleObjectLabel(op, f),
      width: op.width * along,
      // t stays normalized; z / z_height stay (vertical defaults, not scan-scale).
    })),
  }
}

function scaleItem(item: FloorItem, f: PlanScaleFactors): FloorItem {
  const rotRad = ((item.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(rotRad)
  const sin = Math.sin(rotRad)
  // Lokale +X / +Y in wereld → lengtefactor na anisotrope schaal.
  const alongLocalX = lengthScaleAlong(cos, sin, f)
  const alongLocalY = lengthScaleAlong(-sin, cos, f)
  return {
    ...scaleObjectLabel(item, f),
    x: item.x * f.x,
    y: item.y * f.y,
    width: item.width * alongLocalX,
    height: item.height * alongLocalY,
  }
}

function scaleArea(area: FloorArea, f: PlanScaleFactors): FloorArea {
  return {
    ...scaleObjectLabel(area, f),
    poly: area.poly.map((p) => scalePoint(p, f)),
  }
}

function scaleSurface(surface: FloorSurface, f: PlanScaleFactors): FloorSurface {
  return {
    ...scaleObjectLabel(surface, f),
    poly: surface.poly.map((p) => ({
      ...scalePoint(p, f),
      z: p.z,
    })),
  }
}

function scaleLabel(label: FloorLabel, f: PlanScaleFactors): FloorLabel {
  return {
    ...label,
    x: label.x * f.x,
    y: label.y * f.y,
    // fontSize blijft — geen “dikte”; alleen positie.
  }
}

function scaleLine(line: FloorLine, f: PlanScaleFactors): FloorLine {
  return {
    ...line,
    a: scalePoint(line.a, f),
    b: scalePoint(line.b, f),
    // Stroke-dikte blijft (geen muurdikte-schaal).
  }
}

function scaleDimension(dim: FloorDimension, f: PlanScaleFactors): FloorDimension {
  return {
    ...dim,
    a: scalePoint(dim.a, f),
    b: scalePoint(dim.b, f),
  }
}

function scaleDrawing(
  drawing: DrawingMeta | undefined,
  f: PlanScaleFactors,
): DrawingMeta | undefined {
  if (!drawing) return drawing
  return {
    ...drawing,
    x: drawing.x * f.x,
    y: drawing.y * f.y,
    width: drawing.width * f.x,
    height: drawing.height * f.y,
  }
}

function scaleCamera(camera: unknown, f: PlanScaleFactors): unknown {
  if (!camera || typeof camera !== 'object') return camera
  const c = camera as Record<string, unknown>
  const next = { ...c }
  if (typeof c.x === 'number') next.x = c.x * f.x
  if (typeof c.y === 'number') next.y = c.y * f.y
  return next
}

function scaleDesign(design: FloorDesign, f: PlanScaleFactors): FloorDesign {
  return {
    ...design,
    walls: design.walls.map((wall) => scaleWall(wall, f)),
    items: design.items?.map((item) => scaleItem(item, f)),
    areas: design.areas?.map((area) => scaleArea(area, f)),
    surfaces: design.surfaces?.map((surface) => scaleSurface(surface, f)),
    labels: design.labels?.map((label) => scaleLabel(label, f)),
    lines: design.lines?.map((line) => scaleLine(line, f)),
    dimensions: design.dimensions?.map((dim) => scaleDimension(dim, f)),
    source: design.source
      ? {
          ...design.source,
          cameras: design.source.cameras?.map((cam) => scaleCamera(cam, f)),
        }
      : design.source,
  }
}

function scaleFloor(floor: Floor, f: PlanScaleFactors): Floor {
  const designs = floor.designs?.map((d) => scaleDesign(d, f))
  const activeIdx = floor.activeDesignIndex ?? 0
  const active = designs?.[activeIdx]
  return {
    ...floor,
    // height stays — vertical project default, not scan px/mm error.
    walls: active?.walls ?? floor.walls.map((wall) => scaleWall(wall, f)),
    items: active?.items ?? floor.items?.map((item) => scaleItem(item, f)),
    areas: active?.areas ?? floor.areas?.map((area) => scaleArea(area, f)),
    surfaces: active?.surfaces ?? floor.surfaces?.map((surface) => scaleSurface(surface, f)),
    labels: active?.labels ?? floor.labels?.map((label) => scaleLabel(label, f)),
    lines: active?.lines ?? floor.lines?.map((line) => scaleLine(line, f)),
    dimensions: active?.dimensions ?? floor.dimensions?.map((dim) => scaleDimension(dim, f)),
    drawing: scaleDrawing(floor.drawing, f),
    designs,
    source: floor.source
      ? {
          ...floor.source,
          cameras: floor.source.cameras?.map((cam) => scaleCamera(cam, f)),
        }
      : floor.source,
  }
}

/**
 * Plan-schaal in FML-cm. `factor` = uniforme of `{ x, y }` (aparte H/V zoals stap 1).
 * Muurdikte blijft; opening-breedte volgt de muur-as. Verticale maten (height/z) blijven.
 */
export function scaleFloorPlan(
  plan: FloorPlan,
  factor: number | PlanScaleFactors,
  floorIndex?: number,
): FloorPlan {
  const f = normalizeFactors(factor)
  if (!f || isIdentityFactors(f)) return plan
  if (floorIndex == null) {
    return {
      ...plan,
      floors: plan.floors.map((floor) => scaleFloor(floor, f)),
    }
  }
  const idx = Math.max(0, Math.min(floorIndex, plan.floors.length - 1))
  return {
    ...plan,
    floors: plan.floors.map((floor, i) => (i === idx ? scaleFloor(floor, f) : floor)),
  }
}

/** Underlay: origin anisotroop; px/mm per as ÷ factor. */
export function scaleUnderlayLayout(
  layout: UnderlayOriginLayout,
  factor: number | PlanScaleFactors,
): UnderlayOriginLayout {
  const f = normalizeFactors(factor)
  if (!f || isIdentityFactors(f)) return layout
  return {
    ...layout,
    origin: scalePoint(layout.origin, f),
    pxPerMmX: layout.pxPerMmX / f.x,
    pxPerMmY: layout.pxPerMmY / f.y,
  }
}
