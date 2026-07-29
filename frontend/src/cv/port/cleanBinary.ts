import type { OpenCV } from '@/cv/loadOpenCV'
import { scaleMinPixels } from '@/cv/port/despeckle'
import {
  directionalCloseForeground,
  kernelFromPixelRadius,
  morphBinaryInPlace,
} from '@/cv/port/morphClose'

export function applyNegative(cv: OpenCV, mat: OpenCV['Mat']): void {
  cv.bitwise_not(mat, mat)
}

function applyDirectionalGrowth(
  mat: OpenCV['Mat'],
  directions: Array<{ dx: number; dy: number }>,
  fillValue: 0 | 255,
  isSourcePixel: (value: number) => boolean,
): void {
  const src = new Uint8Array(mat.data as Uint8Array)
  const out = new Uint8Array(src)
  const cols = mat.cols
  const rows = mat.rows

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!isSourcePixel(src[y * cols + x])) continue
      for (const { dx, dy } of directions) {
        const targetX = x + dx
        const targetY = y + dy
        if (targetX < 0 || targetY < 0 || targetX >= cols || targetY >= rows) continue
        out[targetY * cols + targetX] = fillValue
      }
    }
  }

  ;(mat.data as Uint8Array).set(out)
}

function copyInkDirectional(
  mat: OpenCV['Mat'],
  directions: Array<{ dx: number; dy: number }>,
): void {
  applyDirectionalGrowth(mat, directions, 0, (value) => value < 128)
}

function copyWhiteDirectional(
  mat: OpenCV['Mat'],
  directions: Array<{ dx: number; dy: number }>,
): void {
  applyDirectionalGrowth(mat, directions, 255, (value) => value >= 128)
}

function alternatingDirection(step: number): 1 | -1 {
  return step % 2 === 0 ? 1 : -1
}

function growInkOnePixelBalanced(mat: OpenCV['Mat'], step: number): void {
  const dir = alternatingDirection(step)
  copyInkDirectional(mat, [
    { dx: dir, dy: 0 },
    { dx: 0, dy: dir },
  ])
}

function growWhiteOnePixelBalanced(mat: OpenCV['Mat'], step: number): void {
  const dir = alternatingDirection(step)
  copyWhiteDirectional(mat, [
    { dx: dir, dy: 0 },
    { dx: 0, dy: dir },
  ])
}

/**
 * Glad traptrede-randen via directional close op wit — vult kleine witte inkepingen
 * langs horizontale/verticale randen zonder lijnen te verdikken zoals bridge op inkt.
 */
export function smoothBinaryLines(
  cv: OpenCV,
  mat: OpenCV['Mat'],
  strength: number | undefined,
): void {
  const steps = Math.max(0, Math.round(strength ?? 0))
  if (steps <= 0) return
  const kernelPx = Math.max(2, steps * 2)
  const smoothed = directionalCloseForeground(cv, mat, kernelPx, 'white')
  smoothed.copyTo(mat)
  smoothed.delete()
}

export function thickenLines(cv: OpenCV, mat: OpenCV['Mat'], px: number | undefined): void {
  void cv
  const steps = Math.max(0, Math.round(px ?? 0))
  for (let step = 0; step < steps; step += 1) {
    growInkOnePixelBalanced(mat, step)
  }
}

export function thinLines(cv: OpenCV, mat: OpenCV['Mat'], px: number | undefined): void {
  void cv
  const steps = Math.max(0, Math.round(px ?? 0))
  for (let step = 0; step < steps; step += 1) {
    growWhiteOnePixelBalanced(mat, step)
  }
}

export function openWhiteDetails(cv: OpenCV, mat: OpenCV['Mat'], px: number | undefined): void {
  const radius = Math.max(0, Math.round(px ?? 0))
  if (radius <= 0) return
  const kernelSize = kernelFromPixelRadius(radius, 3)
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelSize, kernelSize))
  morphBinaryInPlace(cv, mat, cv.MORPH_OPEN, kernel, 'white')
  kernel.delete()
}

export function fillHolesByMaxArea(
  cv: OpenCV,
  mat: OpenCV['Mat'],
  maxPixels: number | undefined,
): number {
  const scaledMax = scaleMinPixels(maxPixels, mat.cols, mat.rows)
  if (scaledMax <= 0) return 0

  const labels = new cv.Mat()
  const stats = new cv.Mat()
  const centroids = new cv.Mat()
  const count = cv.connectedComponentsWithStats(mat, labels, stats, centroids, 8, cv.CV_32S)
  let filled = 0

  for (let i = 1; i < count; i += 1) {
    const area = stats.intAt(i, cv.CC_STAT_AREA)
    if (area > scaledMax) continue
    const left = stats.intAt(i, cv.CC_STAT_LEFT)
    const top = stats.intAt(i, cv.CC_STAT_TOP)
    const width = stats.intAt(i, cv.CC_STAT_WIDTH)
    const height = stats.intAt(i, cv.CC_STAT_HEIGHT)
    const touchesBorder =
      left <= 0 || top <= 0 || left + width >= mat.cols - 1 || top + height >= mat.rows - 1
    if (touchesBorder) continue

    for (let y = top; y < top + height; y += 1) {
      for (let x = left; x < left + width; x += 1) {
        if (labels.intAt(y, x) === i) mat.ucharPtr(y, x)[0] = 0
      }
    }
    filled += 1
  }

  centroids.delete()
  stats.delete()
  labels.delete()
  return filled
}
