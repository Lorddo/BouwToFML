import type { FloorDimension, FloorLabel, FloorLine } from '@/core/fml/types'
import {
  DEFAULT_SCALE_INPUT_UNIT,
  formatScaleInputLabel,
  type ScaleInputUnit,
} from '@/ui/composables/settings/scale-input-unit'
import { measureDistanceCm } from './fml-preview-measure'
import { AREA_LABEL_HEIGHT_CM, planLabelBox } from './fml-preview-render-areas'
import type { RenderDimension, RenderLabel, RenderLine } from './fml-preview-render-types'

type ToStage = (x: number, y: number) => { x: number; y: number }

/** Floorplanner line thickness is screen-pixels (niet cm). */
export const LINE_THICKNESS_FALLBACK_PX = 1
export const DEFAULT_LINE_COLOR = '#000000'
export const DEFAULT_LINE_THICKNESS_PX = 2
export const DEFAULT_LABEL_FONT_SIZE_PX = 16
export const DEFAULT_LABEL_FONT_COLOR = '#000000'
export const LABEL_FONT_SIZE_MIN_PX = 1
export const LABEL_FONT_SIZE_MAX_PX = 200

export function clampLabelFontSize(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_LABEL_FONT_SIZE_PX
  return Math.min(LABEL_FONT_SIZE_MAX_PX, Math.max(LABEL_FONT_SIZE_MIN_PX, Math.round(raw)))
}

/**
 * Floorplanner `fontSize` (px bij 1:1) → wereldhoogte.
 * 16 px = dezelfde cm-hoogte als een kamerbenaming.
 */
export function commentLabelHeightCm(fontSizePx: number): number {
  return AREA_LABEL_HEIGHT_CM * (clampLabelFontSize(fontSizePx) / DEFAULT_LABEL_FONT_SIZE_PX)
}

export function commentLabelFontSizeStage(fontSizePx: number, layoutScale: number): number {
  return commentLabelHeightCm(fontSizePx) * Math.max(0, layoutScale)
}

export function labelHitBoxCm(label: {
  text: string
  fontSize: number
  align?: 'left' | 'center' | 'right'
}): { minX: number; maxX: number; hh: number } {
  const { width, height } = planLabelBox(label.text, commentLabelHeightCm(label.fontSize))
  const hh = height / 2
  if (label.align === 'left') return { minX: 0, maxX: width, hh }
  if (label.align === 'right') return { minX: -width, maxX: 0, hh }
  return { minX: -width / 2, maxX: width / 2, hh }
}

export function labelKonvaFontStyle(bold?: boolean, italic?: boolean): string {
  if (bold && italic) return 'bold italic'
  if (bold) return 'bold'
  if (italic) return 'italic'
  return 'normal'
}

export function lineStrokeColor(color: number | string): string {
  if (typeof color === 'number') {
    if (color === 0) return '#111827'
    const hex = color.toString(16).padStart(6, '0')
    return `#${hex}`
  }
  return color || '#111827'
}

export function lineDash(type: FloorLine['type']): number[] | undefined {
  if (type === 'dashed_line') return [8, 6]
  if (type === 'dotted_line') return [2, 4]
  if (type === 'dashdotted_line') return [8, 4, 2, 4]
  return undefined
}

export function buildRenderLabels(
  labels: FloorLabel[] | undefined,
  toStagePoint: ToStage,
): RenderLabel[] {
  if (!labels || labels.length === 0) return []
  return labels.map((label) => {
    const stage = toStagePoint(label.x, label.y)
    return {
      id: label.id,
      x: stage.x,
      y: stage.y,
      text: label.text,
      fontFamily: label.fontFamily,
      /** Floorplanner `fontSize` (px bij 1:1); Stage gebruikt wereld-cm zoals kamerbenaming. */
      fontSize: clampLabelFontSize(label.fontSize),
      fontColor: label.fontColor,
      backgroundColor: label.backgroundColor,
      align: label.align,
      rotation: label.rotation,
      outline: label.outline === true,
      bold: label.bold === true,
      italic: label.italic === true,
      cmX: label.x,
      cmY: label.y,
    }
  })
}

export function buildRenderLines(
  lines: FloorLine[] | undefined,
  toStagePoint: ToStage,
): RenderLine[] {
  if (!lines || lines.length === 0) return []
  return lines.map((line) => {
    const a = toStagePoint(line.a.x, line.a.y)
    const b = toStagePoint(line.b.x, line.b.y)
    const thickness =
      Number.isFinite(line.thickness) && line.thickness > 0
        ? line.thickness
        : LINE_THICKNESS_FALLBACK_PX
    return {
      id: line.id,
      points: [a.x, a.y, b.x, b.y],
      stroke: lineStrokeColor(line.color),
      /** Schermpixels; Stage zet strokeScaleEnabled=false. */
      strokeWidth: Math.max(LINE_THICKNESS_FALLBACK_PX, thickness),
      dash: lineDash(line.type),
      aCm: { x: line.a.x, y: line.a.y },
      bCm: { x: line.b.x, y: line.b.y },
    }
  })
}

/** Eindstreep maatlijn: totaal in wereld-cm, gecentreerd op de lijn. */
export const DIM_TICK_TOTAL_CM = 40
/** Helft per zijde van de maatlijn (los van de muur). */
export const DIM_TICK_HALF_CM = DIM_TICK_TOTAL_CM / 2

export function buildRenderDimensions(
  dimensions: FloorDimension[] | undefined,
  toStagePoint: ToStage,
  tickHalfCm = DIM_TICK_HALF_CM,
  unit: ScaleInputUnit = DEFAULT_SCALE_INPUT_UNIT,
): RenderDimension[] {
  if (!dimensions || dimensions.length === 0) return []
  return dimensions.map((dim) => {
    const a = toStagePoint(dim.a.x, dim.a.y)
    const b = toStagePoint(dim.b.x, dim.b.y)
    const dxCm = dim.b.x - dim.a.x
    const dyCm = dim.b.y - dim.a.y
    const lenCm = Math.hypot(dxCm, dyCm) || 1
    const nxCm = (-dyCm / lenCm) * tickHalfCm
    const nyCm = (dxCm / lenCm) * tickHalfCm
    const tickA0 = toStagePoint(dim.a.x - nxCm, dim.a.y - nyCm)
    const tickA1 = toStagePoint(dim.a.x + nxCm, dim.a.y + nyCm)
    const tickB0 = toStagePoint(dim.b.x - nxCm, dim.b.y - nyCm)
    const tickB1 = toStagePoint(dim.b.x + nxCm, dim.b.y + nyCm)
    return {
      id: dim.id,
      points: [a.x, a.y, b.x, b.y],
      tickA: [tickA0.x, tickA0.y, tickA1.x, tickA1.y],
      tickB: [tickB0.x, tickB0.y, tickB1.x, tickB1.y],
      labelX: (a.x + b.x) / 2,
      labelY: (a.y + b.y) / 2,
      label: formatScaleInputLabel(measureDistanceCm(dim.a, dim.b), unit),
    }
  })
}
