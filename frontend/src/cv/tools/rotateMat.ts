import type { OpenCV } from '@/cv/loadOpenCV'

/** Near-zero UI/CV rotation — skip bake/warp when |deg| below this. */
export const ROTATION_EPS_DEG = 0.001

/** UI: + = klokwijs, − = tegenklokwijs. OpenCV gebruikt wiskundige hoek (teken omkeren). */
export function uiRotationToCvDegrees(uiDegrees: number): number {
  return -uiDegrees
}

export function expandedSizeForRotation(
  width: number,
  height: number,
  uiDegrees: number,
): { width: number; height: number } {
  const rad = (uiRotationToCvDegrees(uiDegrees) * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  return {
    width: Math.max(1, Math.ceil(width * cos + height * sin)),
    height: Math.max(1, Math.ceil(width * sin + height * cos)),
  }
}

function warpRotateMat(
  cv: OpenCV,
  src: OpenCV['Mat'],
  uiDegrees: number,
  outCols: number,
  outRows: number,
  offsetCols: number,
  offsetRows: number,
): OpenCV['Mat'] {
  const cvDeg = uiRotationToCvDegrees(uiDegrees)
  const center = new cv.Point(src.cols / 2, src.rows / 2)
  const matrix = cv.getRotationMatrix2D(center, cvDeg, 1.0)
  matrix.data64F[2] += offsetCols
  matrix.data64F[5] += offsetRows
  const out = new cv.Mat()
  cv.warpAffine(
    src,
    out,
    matrix,
    new cv.Size(outCols, outRows),
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar(255, 255, 255, 255),
  )
  matrix.delete()
  return out
}

/** Rotatie met uitgebreid canvas zodat hoeken niet worden afgesneden. */
export function rotateMatExpandBounds(
  cv: OpenCV,
  src: OpenCV['Mat'],
  uiDegrees: number,
): OpenCV['Mat'] {
  if (Math.abs(uiDegrees) < ROTATION_EPS_DEG) return src

  const expanded = expandedSizeForRotation(src.cols, src.rows, uiDegrees)
  const offsetCols = (expanded.width - src.cols) / 2
  const offsetRows = (expanded.height - src.rows) / 2
  const out = warpRotateMat(
    cv,
    src,
    uiDegrees,
    expanded.width,
    expanded.height,
    offsetCols,
    offsetRows,
  )
  src.delete()
  return out
}
