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

const PROVISIONAL_RULER_SPAN_RATIO = 0.35
const PROVISIONAL_RULER_MM = 3000

export type DrawingFromImageScaleParams = {
  imageWidthPx: number
  imageHeightPx: number
  pxPerMmX: number
  pxPerMmY: number
  origin?: { x: number; y: number }
  url?: string
  alpha?: number
  rotation?: number
}

/**
 * Inverse van `previewUnderlayLayoutFromDrawing`: px/mm + origin → Floorplanner drawing.
 * Origin = FML (0,0) in image-cm; drawing.x/y = midden van de ongeroteerde plaat.
 */
export function drawingFromImageScale(params: DrawingFromImageScaleParams): DrawingMeta | null {
  const { imageWidthPx, imageHeightPx, pxPerMmX, pxPerMmY } = params
  if (!(imageWidthPx > 0) || !(imageHeightPx > 0)) return null
  if (!(pxPerMmX > 0) || !(pxPerMmY > 0)) return null
  if (!Number.isFinite(pxPerMmX) || !Number.isFinite(pxPerMmY)) return null

  const width = imageWidthPx / (pxPerMmX * 10)
  const height = imageHeightPx / (pxPerMmY * 10)
  if (!(width > 0) || !(height > 0)) return null

  const origin = params.origin ?? { x: 0, y: 0 }
  const drawing: DrawingMeta = {
    width,
    height,
    x: width / 2 - origin.x,
    y: height / 2 - origin.y,
    rotation: params.rotation ?? 0,
  }
  if (params.url != null) drawing.url = params.url
  if (params.alpha != null && Number.isFinite(params.alpha)) drawing.alpha = params.alpha
  return drawing
}

/** Startschaal na upload: 35% van de scan = 3000 mm (zelfde default als stap-1 linialen). */
export function provisionalDrawingFromImage(
  imageSizePx: { width: number; height: number },
  extras?: { url?: string; alpha?: number },
): DrawingMeta | null {
  const spanX = imageSizePx.width * PROVISIONAL_RULER_SPAN_RATIO
  const spanY = imageSizePx.height * PROVISIONAL_RULER_SPAN_RATIO
  if (!(spanX > 3) || !(spanY > 3)) return null
  return drawingFromImageScale({
    imageWidthPx: imageSizePx.width,
    imageHeightPx: imageSizePx.height,
    pxPerMmX: spanX / PROVISIONAL_RULER_MM,
    pxPerMmY: spanY / PROVISIONAL_RULER_MM,
    origin: { x: 0, y: 0 },
    url: extras?.url,
    alpha: extras?.alpha,
  })
}

/**
 * Liniaal in huidige FML-cm + echte mm → nieuwe px/mm (plaat stretchen, muren niet).
 * rulerPx = measuredCm × 10 × currentPxPerMm.
 */
export function resolveUnderlayPxPerMmFromRulers(params: {
  measuredCmX: number
  measuredCmY: number
  currentPxPerMmX: number
  currentPxPerMmY: number
  trueMmX: number
  trueMmY: number
}): { pxPerMmX: number; pxPerMmY: number } | null {
  const { measuredCmX, measuredCmY, currentPxPerMmX, currentPxPerMmY, trueMmX, trueMmY } = params
  if (!(measuredCmX > 0) || !(measuredCmY > 0)) return null
  if (!(currentPxPerMmX > 0) || !(currentPxPerMmY > 0)) return null
  if (!(trueMmX > 0) || !(trueMmY > 0)) return null
  const pxX = measuredCmX * 10 * currentPxPerMmX
  const pxY = measuredCmY * 10 * currentPxPerMmY
  if (!(pxX > 3) || !(pxY > 3)) return null
  return { pxPerMmX: pxX / trueMmX, pxPerMmY: pxY / trueMmY }
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
