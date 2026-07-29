import type { OpenCV } from '../loadOpenCV'

type CvMat = OpenCV['Mat']

/** Zelfde drempel als measureInkBBoxInBox — pixels donkerder dan dit tellen als inkt. */
export const INK_DARK_THRESHOLD = 245

const MIN_INK_PIXELS = 12

export function countInkPixels(mat: CvMat, darkThreshold = INK_DARK_THRESHOLD): number {
  let count = 0
  for (let y = 0; y < mat.rows; y += 1) {
    for (let x = 0; x < mat.cols; x += 1) {
      if (mat.ucharPtr(y, x)[0] < darkThreshold) count += 1
    }
  }
  return count
}

export function hasEnoughInkPixels(mat: CvMat, darkThreshold = INK_DARK_THRESHOLD): boolean {
  return countInkPixels(mat, darkThreshold) >= MIN_INK_PIXELS
}
