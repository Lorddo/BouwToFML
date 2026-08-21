/**
 * Stempelset ↔ nulpunt: FML (0,0) op de scan, en inject-offset na stap-4 sleep.
 *
 * injectCm = donorFml + bakeNulpuntImageCm − currentNulpuntImageCm
 */
import { cmPointToImagePx } from './measure-underlay-wall-thickness'
import type { Point2D } from './types'
import { transformPointByBounds, type StampBounds } from '@/cv/preprocess/wall-stamp-raster'

/** Image-px → scant-cm (origin = FML+layout; hier bare image-cm vanaf scan-hoek). */
export function imagePxToScantCm(px: Point2D, pxPerMmX: number, pxPerMmY: number): Point2D {
  const sx = pxPerMmX > 0 ? pxPerMmX * 10 : 0
  const sy = pxPerMmY > 0 ? pxPerMmY * 10 : 0
  return {
    x: sx > 0 ? px.x / sx : 0,
    y: sy > 0 ? px.y / sy : 0,
  }
}

/**
 * Waar FML (0,0) op de doel-scan ligt na stempel-align (scant-cm).
 * `originCm` = donor FML-origin bij cm→px (workspace meestal {0,0}).
 */
export function resolveBakeNulpuntImageCm(params: {
  originCm: Point2D
  baseBounds: StampBounds
  bounds: StampBounds
  pxPerMmX: number
  pxPerMmY: number
}): Point2D {
  const fmlZeroBasePx = cmPointToImagePx(
    { x: 0, y: 0 },
    params.originCm,
    params.pxPerMmX,
    params.pxPerMmY,
  )
  const fmlZeroLivePx = transformPointByBounds(fmlZeroBasePx, params.baseBounds, params.bounds)
  return imagePxToScantCm(fmlZeroLivePx, params.pxPerMmX, params.pxPerMmY)
}

/**
 * Offset om donor-FML-cm te plaatsen t.o.v. current nulpunt,
 * zodat muren op dezelfde scan-pixels blijven na nulpunt-sleep.
 */
export function resolveStampInjectOffsetCm(
  bakeNulpuntImageCm: Point2D,
  currentNulpuntImageCm: Point2D,
): Point2D {
  return {
    x: bakeNulpuntImageCm.x - currentNulpuntImageCm.x,
    y: bakeNulpuntImageCm.y - currentNulpuntImageCm.y,
  }
}

export function translatePointByOffset(point: Point2D, offset: Point2D): Point2D {
  return { x: point.x + offset.x, y: point.y + offset.y }
}
