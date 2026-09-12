/**
 * Stempel bbox + punt-transform (puur geometrie, geen OpenCV).
 * Woont in `core/fml` zodat embed-entries (`fml-editor` / `fml-inspect`)
 * niet via `stamp-nulpunt` → `cv/preprocess` de OpenCV-graaf intrekken.
 */
import type { Point2D } from './types'

export type StampBounds = { x: number; y: number; width: number; height: number }

/** Schaal/offset een punt van `baseBounds` naar `bounds` (zelfde as-align). */
export function transformPointByBounds(
  point: Point2D,
  baseBounds: StampBounds,
  bounds: StampBounds,
): Point2D {
  const sx = baseBounds.width > 1e-6 ? bounds.width / baseBounds.width : 1
  const sy = baseBounds.height > 1e-6 ? bounds.height / baseBounds.height : 1
  return {
    x: bounds.x + (point.x - baseBounds.x) * sx,
    y: bounds.y + (point.y - baseBounds.y) * sy,
  }
}
