/** Viewport-fixed guide grid — visual only, never baked into export/detect. */

export type CanvasGridSurface = 'input' | 'workspaceScan' | 'fml' | 'elevation'

/** Pitch in CSS/screen pixels (constant under zoom). */
export const CANVAS_GUIDE_GRID_PITCH_PX = 32

/** Very light slate stroke. */
export const CANVAS_GUIDE_GRID_STROKE = 'rgba(15, 23, 42, 0.07)'

/**
 * Scan vs grid stacking.
 * - `under`: underlay/scan below grid (stap 1, editor, gevel) — grid helps align.
 * - `over`: scan above grid (stap 2/3/B/W) — grid only in white margins.
 * Flip here if a client wants the grid faintly through B/W.
 */
export function canvasGridScanSlot(surface: CanvasGridSurface): 'under' | 'over' {
  return surface === 'workspaceScan' ? 'over' : 'under'
}

export type ViewportTransform = {
  x: number
  y: number
  scale: number
}

/**
 * Cancel parent pan/zoom so the grid stays screen-aligned (ruitjespapier behind glass).
 * Parent may be Stage (workspace) or content-group (FML/elevation).
 */
export function canvasGuideGridInverseConfig(parent: ViewportTransform): {
  x: number
  y: number
  scaleX: number
  scaleY: number
  listening: false
} {
  const scale = Math.max(0.01, parent.scale)
  return {
    x: -parent.x / scale || 0,
    y: -parent.y / scale || 0,
    scaleX: 1 / scale,
    scaleY: 1 / scale,
    listening: false,
  }
}

export function readStageViewport(stage: {
  x: () => number
  y: () => number
  scaleX: () => number
}): ViewportTransform {
  return {
    x: stage.x(),
    y: stage.y(),
    scale: Math.max(0.01, stage.scaleX()),
  }
}
