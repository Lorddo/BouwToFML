import type { DrawingMeta } from './types'
import type { UnderlayOriginLayout } from './translate-floor-plan'

/** Zelfde orde als ROTATION_EPS_DEG — geen cv-import in core. */
const ROTATION_EPS_DEG = 0.001

/**
 * Floorplanner `drawing.x/y` = midden van de ongeroteerde tekening in FML-cm.
 * Ongeroteerde top-left = (x − width/2, y − height/2).
 * PreviewUnderlayLayout.origin: FML (0,0) in image-cm van die ongeroteerde scan.
 */
export function previewUnderlayLayoutFromDrawing(
  drawing: DrawingMeta,
  imageSizePx: { width: number; height: number },
): UnderlayOriginLayout | null {
  if (!(drawing.width > 0) || !(drawing.height > 0)) return null
  if (!(imageSizePx.width > 0) || !(imageSizePx.height > 0)) return null

  const topLeftX = drawing.x - drawing.width / 2
  const topLeftY = drawing.y - drawing.height / 2
  const layout: UnderlayOriginLayout = {
    origin: { x: -topLeftX, y: -topLeftY },
    pxPerMmX: imageSizePx.width / (drawing.width * 10),
    pxPerMmY: imageSizePx.height / (drawing.height * 10),
  }
  if (Math.abs(drawing.rotation) >= ROTATION_EPS_DEG) {
    layout.rotationDeg = drawing.rotation
  }
  return layout
}

/** Kopieert origin + schaal + optionele rotationDeg/flipX (additief; geen drop). */
export function cloneUnderlayOriginLayout<T extends UnderlayOriginLayout>(layout: T): T {
  return {
    ...layout,
    origin: { ...layout.origin },
    ...(layout.rotationDeg != null ? { rotationDeg: layout.rotationDeg } : {}),
    ...(layout.flipX != null ? { flipX: layout.flipX } : {}),
  }
}

/** Behoud display-orient (rot/flip) bij verse generate/nulpunt-origin. */
export function copyUnderlayDisplayOrient<T extends UnderlayOriginLayout>(
  target: T,
  source: UnderlayOriginLayout | null | undefined,
): T {
  if (!source) return target
  const next: T = { ...target, origin: { ...target.origin } }
  if (source.rotationDeg != null) next.rotationDeg = source.rotationDeg
  else delete next.rotationDeg
  if (source.flipX != null) next.flipX = source.flipX
  else delete next.flipX
  return next
}
