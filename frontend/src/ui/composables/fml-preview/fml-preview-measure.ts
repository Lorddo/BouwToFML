import type { Point2D } from '@/core/fml/types'

export interface MeasureLine {
  id: string
  a: Point2D
  b: Point2D
}

export function measureDistanceCm(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function formatMeasureDistanceCm(cm: number): string {
  if (cm >= 100) {
    return `${(cm / 100).toFixed(2)} m`
  }
  return `${cm.toFixed(1)} cm`
}

export interface MeasureLineScreen {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  tickAx1: number
  tickAy1: number
  tickAx2: number
  tickAy2: number
  tickBx1: number
  tickBy1: number
  tickBx2: number
  tickBy2: number
  labelX: number
  labelY: number
  label: string
}

export function buildMeasureLineScreen(
  line: MeasureLine,
  toScreen: (x: number, y: number) => { x: number; y: number },
  tickLen = 6,
): MeasureLineScreen {
  const p1 = toScreen(line.a.x, line.a.y)
  const p2 = toScreen(line.b.x, line.b.y)
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * tickLen
  const ny = (dx / len) * tickLen
  const distanceCm = measureDistanceCm(line.a, line.b)

  return {
    id: line.id,
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y,
    tickAx1: p1.x - nx,
    tickAy1: p1.y - ny,
    tickAx2: p1.x + nx,
    tickAy2: p1.y + ny,
    tickBx1: p2.x - nx,
    tickBy1: p2.y - ny,
    tickBx2: p2.x + nx,
    tickBy2: p2.y + ny,
    labelX: (p1.x + p2.x) / 2,
    labelY: (p1.y + p2.y) / 2,
    label: formatMeasureDistanceCm(distanceCm),
  }
}
