import { displayAreaLabel } from '@/core/fml/roomtype-catalog'
import { resolveRoofSurfaceColor } from '@/core/fml/roof-planes'
import type { FloorArea, FloorSurface, Point2D } from '@/core/fml/types'
import type { RenderArea, RenderSurface } from './fml-preview-render-types'

/**
 * Labelhoogte in FML-cm (wereldmaat). Stage-px = heightCm × layout.scale;
 * daarna schaalt viewScale mee zoals muren (~8px op een ~20 m appartement na fit).
 */
export const AREA_LABEL_HEIGHT_CM = 20

/** Minimale schermhoogte (px) om een label te mounten — LOD bij uitzoomen. */
export const AREA_LABEL_LOD_MIN_SCREEN_PX = 6

export function areaLabelFontSizeStage(layoutScale: number): number {
  return AREA_LABEL_HEIGHT_CM * Math.max(0, layoutScale)
}

/** true als fontSizeStage × viewScale groot genoeg is om te tekenen. */
export function areaLabelVisibleOnScreen(fontSizeStage: number, viewScale: number): boolean {
  return fontSizeStage * viewScale >= AREA_LABEL_LOD_MIN_SCREEN_PX
}

export function areaLabelKonvaConfig(
  label: string,
  x: number,
  y: number,
  fill = '#1f2937',
  fontSizeStage: number,
): Record<string, unknown> {
  const fontSize = Math.max(0.01, fontSizeStage)
  const width = Math.max(fontSize * 4, label.length * fontSize * 0.62)
  return {
    x,
    y,
    text: label,
    width,
    fontSize,
    fontFamily: 'Inter, system-ui, sans-serif',
    fill,
    align: 'center',
    verticalAlign: 'middle',
    offsetX: width / 2,
    offsetY: fontSize / 2,
    listening: false,
    perfectDrawEnabled: false,
  }
}

/**
 * Oppervlakte-gewogen middenpunt (shoelace). Stabieler dan vertex-gemiddelde
 * bij L-/T-vormige ruimtes. Fallback = vertex-gemiddelde bij degeneraat.
 */
function polyCentroid(poly: Point2D[]): Point2D {
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

function mapTaggedPoly(
  item: FloorArea | FloorSurface,
  toStagePoint: (x: number, y: number) => Point2D,
): RenderArea {
  const polyCm = item.poly.map((p) => ({ x: p.x, y: p.y }))
  const points = polyCm.flatMap((p) => {
    const s = toStagePoint(p.x, p.y)
    return [s.x, s.y]
  })
  // Label altijd op polygoon-midden; name_x/y blijven in FML maar sturen viewer niet.
  const c = polyCentroid(polyCm)
  const labelStage = toStagePoint(c.x, c.y)
  return {
    id: item.id,
    points,
    fill: item.color || '#ffffff',
    label: displayAreaLabel(item),
    labelX: labelStage.x,
    labelY: labelStage.y,
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
