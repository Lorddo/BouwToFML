import type { OpenCV } from '@/cv/loadOpenCV'

export function despeckleByMinArea(
  cv: OpenCV,
  mat: OpenCV['Mat'],
  minPixels: number | undefined,
): number {
  // Ruwe px — werkformaat is 3k; geen verborgen 1000-px beeldmaat-schaal.
  const minArea = Math.max(0, Math.round(minPixels ?? 0))
  if (minArea <= 0) return 0

  const inv = new cv.Mat()
  cv.bitwise_not(mat, inv)
  const labels = new cv.Mat()
  const stats = new cv.Mat()
  const centroids = new cv.Mat()
  const count = cv.connectedComponentsWithStats(inv, labels, stats, centroids, 8, cv.CV_32S)
  let removed = 0

  for (let i = 1; i < count; i += 1) {
    const area = stats.intAt(i, cv.CC_STAT_AREA)
    if (area >= minArea) continue
    const left = stats.intAt(i, cv.CC_STAT_LEFT)
    const top = stats.intAt(i, cv.CC_STAT_TOP)
    const width = stats.intAt(i, cv.CC_STAT_WIDTH)
    const height = stats.intAt(i, cv.CC_STAT_HEIGHT)
    cv.rectangle(
      mat,
      new cv.Point(left, top),
      new cv.Point(left + width, top + height),
      new cv.Scalar(255, 255, 255, 255),
      cv.FILLED,
    )
    removed += 1
  }

  centroids.delete()
  stats.delete()
  labels.delete()
  inv.delete()
  return removed
}
