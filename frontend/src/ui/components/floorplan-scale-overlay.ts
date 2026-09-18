import type { HScaleState } from '@/platform/calibration'

export type ScaleOverlayHandle = keyof HScaleState

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Stap-1 liniaal: H-grepen alleen X, V-grepen alleen Y, geclamped op het beeld.
 * Voorkomt dat Konva-drag + zoom de punten van de lijn aftrekt.
 */
export function scaleOverlayHandleValue(
  handle: ScaleOverlayHandle,
  point: { x: number; y: number },
  bounds: { width: number; height: number },
): number {
  if (handle === 'xLeft' || handle === 'xRight' || handle === 'yGuideX') {
    return clamp(point.x, 0, Math.max(0, bounds.width))
  }
  return clamp(point.y, 0, Math.max(0, bounds.height))
}
