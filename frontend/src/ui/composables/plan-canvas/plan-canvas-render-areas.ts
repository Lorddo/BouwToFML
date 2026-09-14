import { displayAreaLabel } from '@/core/plan/roomtype-catalog'
import { resolveRoofSurfaceColor } from '@/core/plan/roof-planes'
import type { FloorArea, FloorSurface, Point2D } from '@/core/plan/types'
import type { RenderArea, RenderSurface } from './plan-canvas-render-types'

/**
 * Labelhoogte in FML-cm (wereldmaat). Stage-px = heightCm × layout.scale;
 * daarna schaalt viewScale mee zoals muren (~8px op een ~20 m appartement na fit).
 */
export const AREA_LABEL_HEIGHT_CM = 20

/** Minimale schermhoogte (px) om een label te mounten — LOD bij uitzoomen. */
export const AREA_LABEL_LOD_MIN_SCREEN_PX = 6

/** Regelafstand t.o.v. fontSize — voorkomt gestapelde regels bij multiline. */
export const AREA_LABEL_LINE_HEIGHT = 1.15

/** Gemiddelde tekenbreedte t.o.v. fontSize (zonder canvas-measure). */
export const AREA_LABEL_CHAR_WIDTH = 0.62

export type PlanLabelAlign = 'left' | 'center' | 'right'

export function areaLabelFontSizeStage(layoutScale: number): number {
  return AREA_LABEL_HEIGHT_CM * Math.max(0, layoutScale)
}

/** true als fontSizeStage × viewScale groot genoeg is om te tekenen. */
export function areaLabelVisibleOnScreen(fontSizeStage: number, viewScale: number): boolean {
  return fontSizeStage * viewScale >= AREA_LABEL_LOD_MIN_SCREEN_PX
}

export function normalizePlanLabelText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function planLabelLines(text: string): string[] {
  const normalized = normalizePlanLabelText(text)
  return normalized.length === 0 ? [''] : normalized.split('\n')
}

/** Bounding box in dezelfde eenheid als `fontSize` (stage of cm). */
export function planLabelBox(
  text: string,
  fontSize: number,
): { width: number; height: number; lines: string[] } {
  const size = Math.max(0.01, fontSize)
  const lines = planLabelLines(text)
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0)
  return {
    width: Math.max(size * 4, longest * size * AREA_LABEL_CHAR_WIDTH),
    height: Math.max(size, lines.length * size * AREA_LABEL_LINE_HEIGHT),
    lines,
  }
}

function planLabelOffsetX(width: number, align: PlanLabelAlign): number {
  if (align === 'left') return 0
  if (align === 'right') return width
  return width / 2
}

export function areaLabelKonvaConfig(
  label: string,
  x: number,
  y: number,
  fill = '#1f2937',
  fontSizeStage: number,
  align: PlanLabelAlign = 'center',
): Record<string, unknown> {
  const fontSize = Math.max(0.01, fontSizeStage)
  const text = normalizePlanLabelText(label)
  const { width, height } = planLabelBox(text, fontSize)
  return {
    x,
    y,
    text,
    width,
    height,
    fontSize,
    lineHeight: AREA_LABEL_LINE_HEIGHT,
    fontFamily: 'Inter, system-ui, sans-serif',
    fill,
    align,
    verticalAlign: 'middle',
    offsetX: planLabelOffsetX(width, align),
    offsetY: height / 2,
    wrap: 'none',
    listening: false,
    perfectDrawEnabled: false,
  }
}

export function areaLabelSelectRectConfig(
  label: string,
  x: number,
  y: number,
  fontSizeStage: number,
  selected: boolean,
  invView: number,
): Record<string, unknown> {
  const { width, height } = planLabelBox(label, fontSizeStage)
  return {
    x,
    y,
    width,
    height,
    offsetX: width / 2,
    offsetY: height / 2,
    stroke: selected ? '#f97316' : '#94a3b8',
    strokeWidth: selected ? 2 * invView : invView,
    listening: false,
  }
}

/**
 * Oppervlakte-gewogen middenpunt (shoelace). Stabieler dan vertex-gemiddelde
 * bij L-/T-vormige ruimtes. Fallback = vertex-gemiddelde bij degeneraat.
 */
export function areaPolygonCentroid(poly: Point2D[]): Point2D {
  if (poly.length === 0) return { x: 0, y: 0 }
  let area2 = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const cross = a.x * b.y - b.x * a.y
    area2 += cross
    cx += (a.x + b.x) * cross
    cy += (a.y + b.y) * cross
  }
  if (Math.abs(area2) < 1e-9) {
    let sx = 0
    let sy = 0
    for (const p of poly) {
      sx += p.x
      sy += p.y
    }
    const n = poly.length
    return { x: sx / n, y: sy / n }
  }
  const inv = 1 / (3 * area2)
  return { x: cx * inv, y: cy * inv }
}

/** Floorplanner `name_x`/`name_y` = offset t.o.v. centroid (zelfde cm als de poly). */
export function areaLabelAnchorCm(poly: Point2D[], nameX?: number, nameY?: number): Point2D {
  const c = areaPolygonCentroid(poly)
  return {
    x: c.x + (Number.isFinite(nameX) ? (nameX as number) : 0),
    y: c.y + (Number.isFinite(nameY) ? (nameY as number) : 0),
  }
}

export function areaLabelHitHalfExtentsCm(label: string): { hw: number; hh: number } {
  const { width, height } = planLabelBox(label, AREA_LABEL_HEIGHT_CM)
  return { hw: width / 2, hh: height / 2 }
}

function mapTaggedPoly(
  item: FloorArea | FloorSurface,
  toStagePoint: (x: number, y: number) => Point2D,
): RenderArea {
  const polyCm = item.poly.map((p) => ({ x: p.x, y: p.y }))
  const points = polyCm.flatMap((p) => {
    const s = toStagePoint(p.x, p.y)
    return [s.x, s.y]
  })
  const centroidCm = areaPolygonCentroid(polyCm)
  const labelCm = areaLabelAnchorCm(polyCm, item.name_x, item.name_y)
  const labelStage = toStagePoint(labelCm.x, labelCm.y)
  return {
    id: item.id,
    points,
    fill: item.color || '#ffffff',
    label: displayAreaLabel(item),
    labelX: labelStage.x,
    labelY: labelStage.y,
    labelCm,
    centroidCm,
    role: item.role,
    color: item.color,
    customName: item.customName,
    name: item.name,
    showAreaLabel: item.showAreaLabel !== false,
    polyCm,
  }
}

export function buildRenderAreas(
  areas: FloorArea[] | undefined,
  toStagePoint: (x: number, y: number) => Point2D,
): RenderArea[] {
  return (areas ?? []).filter((a) => a.poly.length >= 3).map((a) => mapTaggedPoly(a, toStagePoint))
}

export function buildRenderSurfaces(
  surfaces: FloorSurface[] | undefined,
  toStagePoint: (x: number, y: number) => Point2D,
): RenderSurface[] {
  return (surfaces ?? [])
    .filter((s) => s.poly.length >= 3)
    .map((s) => {
      const mapped = mapTaggedPoly(s, toStagePoint)
      const isRoof = s.isRoof === true || s.extras?.isRoof === true
      const fill = isRoof ? resolveRoofSurfaceColor(s.color) : mapped.fill
      return {
        ...mapped,
        fill,
        color: isRoof ? fill : mapped.color,
        isCutout: s.isCutout,
        isRoof,
      }
    })
}
