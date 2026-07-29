import type { OpenCV } from '@/cv/loadOpenCV'
import { measureInkBandInBox } from '@/cv/port/wallKernel'

export type ReferenceWallRect = {
  x: number
  y: number
  width: number
  height: number
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

  const mat = cv.matFromArray(baseBw.height, baseBw.width, cv.CV_8UC1, baseBw.data)
  try {
    const orientation = rect.width >= rect.height ? 'horizontal' : 'vertical'
    const measure = measureInkBandInBox(mat, rect, orientation)
    if (!measure || !(measure.thicknessPx > 0)) return null
    return Math.max(1, Math.round(measure.thicknessPx))
  } finally {
    mat.delete()
  }
}
