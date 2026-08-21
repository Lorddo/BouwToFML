import type { FloorDimension, FloorLabel, FloorLine } from '@/core/fml/types'
import { measureDistanceCm } from './fml-preview-measure'
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

function formatDimensionMeters(cm: number): string {
  const meters = cm / 100
  const rounded = Math.round(meters * 100) / 100
  return `${rounded.toFixed(2)} m`
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
      /** Schermpixels (Floorplanner `fontSize`); Stage deelt door viewScale. */
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

export function buildRenderDimensions(
  dimensions: FloorDimension[] | undefined,
  toStagePoint: ToStage,
  tickLenStage = 6,
): RenderDimension[] {
  if (!dimensions || dimensions.length === 0) return []
  return dimensions.map((dim) => {
    const a = toStagePoint(dim.a.x, dim.a.y)
    const b = toStagePoint(dim.b.x, dim.b.y)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = (-dy / len) * tickLenStage
    const ny = (dx / len) * tickLenStage
    return {
      id: dim.id,
      points: [a.x, a.y, b.x, b.y],
      tickA: [a.x - nx, a.y - ny, a.x + nx, a.y + ny],
      tickB: [b.x - nx, b.y - ny, b.x + nx, b.y + ny],
      labelX: (a.x + b.x) / 2,
      labelY: (a.y + b.y) / 2,
      label: formatDimensionMeters(measureDistanceCm(dim.a, dim.b)),
    }
  })
}
