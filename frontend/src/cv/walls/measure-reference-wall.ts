import type { OpenCV } from '@/cv/loadOpenCV'
import { measureInkBandInBox } from '@/cv/port/wallKernel'
import { hasRectRotation, sampleOrientedRectNearest } from '@/platform/selection/oriented-rect'

export type ReferenceWallRect = {
  x: number
  y: number
  width: number
  height: number
  rotationDeg?: number
}

export type ReferenceWallBaseBw = {
  data: Uint8Array
  width: number
  height: number
}

/**
 * Lichtgewicht muurdikte-meting: ink-band in LBE-vak op canonieke muur-B/W.
 * Verwacht `baseBw` ná stap-2 bake (wallLayer + eraser + gebakken inkt; geen OCR).
 * Geen room-classify / pipeline / kleur-rebuild.
 *
 * LBE-rects zijn in image-lokale pixels (zelfde space als baseBw).
 */
export function measureReferenceWallThicknessPx(params: {
  cv: OpenCV
  baseBw: ReferenceWallBaseBw
  rect: ReferenceWallRect
}): number | null {
  const { cv, baseBw, rect } = params
  if (rect.width < 5 || rect.height < 5) return null
  if (baseBw.width <= 0 || baseBw.height <= 0) return null
  if (baseBw.data.length < baseBw.width * baseBw.height) return null

  const oriented = hasRectRotation(rect)
    ? sampleOrientedRectNearest(baseBw.data, baseBw.width, baseBw.height, rect)
    : null
  const src = oriented
    ? { data: oriented.data, width: oriented.width, height: oriented.height }
    : baseBw
  const box = oriented ? { x: 0, y: 0, width: oriented.width, height: oriented.height } : rect
  if (box.width < 5 || box.height < 5) return null

  const mat = cv.matFromArray(src.height, src.width, cv.CV_8UC1, src.data)
  try {
    const orientation = box.width >= box.height ? 'horizontal' : 'vertical'
    const measure = measureInkBandInBox(mat, box, orientation)
    if (!measure || !(measure.thicknessPx > 0)) return null
    return Math.max(1, Math.round(measure.thicknessPx))
  } finally {
    mat.delete()
  }
}

/**
 * Lokale preview-dikte voor Dev-Otsu / download — schrijft geen official state.
 * Neemt de grootste geldige ink-band over alle muur-refs.
 */
export function measurePreviewWallThicknessPx(params: {
  cv: OpenCV
  baseBw: ReferenceWallBaseBw
  wallRects: ReferenceWallRect[]
}): number | null {
  let best: number | null = null
  for (const rect of params.wallRects) {
    const px = measureReferenceWallThicknessPx({
      cv: params.cv,
      baseBw: params.baseBw,
      rect,
    })
    if (px == null || px <= 0) continue
    if (best == null || px > best) best = px
  }
  return best
}
