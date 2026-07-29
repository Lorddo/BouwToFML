import type { OpenCV } from '@/cv/loadOpenCV'
import type { Segment } from './wallGraph'

const INK_THRESHOLD = 245

function segmentFromPoints(
  data32S: Int32Array,
  aIdx: number,
  bIdx: number,
): Segment | null {
  const ax = data32S[aIdx * 2]
  const ay = data32S[aIdx * 2 + 1]
  const bx = data32S[bIdx * 2]
  const by = data32S[bIdx * 2 + 1]
  if (ax === bx && ay === by) return null
  return {
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
  }
}

/**
 * Ruwe conversie: alle zwarte pixels uit de B/W-mat naar contour-vectoren.
 *
 * Bewust geen muurkennis, bbox, lengtefilter, Hough, template-signature,
 * snapping of classificatie. Dit is alleen "zwart beeld -> vectorlijnen".
 */
export function traceRawInkVectors(cv: OpenCV, mat: OpenCV['Mat']): Segment[] {
  const inkMask = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  const segments: Segment[] = []

  try {
    cv.threshold(mat, inkMask, INK_THRESHOLD, 255, cv.THRESH_BINARY_INV)
    cv.findContours(inkMask, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)

    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i)
      try {
        const pointCount = contour.rows
        if (pointCount < 2) continue
        const data = contour.data32S
        for (let p = 1; p < pointCount; p += 1) {
          const seg = segmentFromPoints(data, p - 1, p)
          if (seg) segments.push(seg)
        }
        const closing = segmentFromPoints(data, pointCount - 1, 0)
        if (closing) segments.push(closing)
      } finally {
        contour.delete()
      }
    }
  } finally {
    hierarchy.delete()
    contours.delete()
    inkMask.delete()
  }

  return segments
}
