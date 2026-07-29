import type { OpenCV } from '@/cv/loadOpenCV'

export type BinaryForeground = 'ink' | 'white'

function oddKernelFromRadius(radiusPx: number): number {
  const radius = Math.max(0, Math.round(radiusPx))
  return radius * 2 + 1
}

export function kernelFromPixelRadius(radiusPx: number, minKernelPx = 1): number {
  const kernelPx = oddKernelFromRadius(radiusPx)
  return Math.max(minKernelPx, kernelPx)
}

function morphologyDirectionalClose(
  cv: OpenCV,
  src: OpenCV['Mat'],
  kernelPx: number,
): OpenCV['Mat'] {
  const horizontalKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelPx, 1))
  const verticalKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, kernelPx))
  const horizontalClosed = new cv.Mat()
  const verticalClosed = new cv.Mat()
  cv.morphologyEx(src, horizontalClosed, cv.MORPH_CLOSE, horizontalKernel)
  cv.morphologyEx(horizontalClosed, verticalClosed, cv.MORPH_CLOSE, verticalKernel)
  horizontalKernel.delete()
  verticalKernel.delete()
  horizontalClosed.delete()
  return verticalClosed
}

function withBinaryForeground(
  cv: OpenCV,
  src: OpenCV['Mat'],
  foreground: BinaryForeground,
  fn: (foregroundMat: OpenCV['Mat']) => OpenCV['Mat'],
): OpenCV['Mat'] {
  if (foreground === 'white') return fn(src)

  const inv = new cv.Mat()
  cv.bitwise_not(src, inv)
  const morphed = fn(inv)
  inv.delete()

  const out = new cv.Mat()
  cv.bitwise_not(morphed, out)
  morphed.delete()
  return out
}

export function morphBinaryInPlace(
  cv: OpenCV,
  mat: OpenCV['Mat'],
  op: number,
  kernel: OpenCV['Mat'],
  foreground: BinaryForeground,
): void {
  const out = withBinaryForeground(cv, mat, foreground, (foregroundMat) => {
    const morphed = new cv.Mat()
    cv.morphologyEx(foregroundMat, morphed, op, kernel)
    return morphed
  })
  out.copyTo(mat)
  out.delete()
}

/** Directional close met expliciete foreground. `kernelPx` is OpenCV-kernellengte, geen radius. */
export function directionalCloseForeground(
  cv: OpenCV,
  src: OpenCV['Mat'],
  kernelPx: number,
  foreground: BinaryForeground,
): OpenCV['Mat'] {
  const resolvedKernelPx = Math.max(1, Math.round(kernelPx))
  return withBinaryForeground(cv, src, foreground, (foregroundMat) =>
    morphologyDirectionalClose(cv, foregroundMat, resolvedKernelPx),
  )
}

/** Sluit zwarte inktbanden langs X en Y. */
export function directionalClose(cv: OpenCV, src: OpenCV['Mat'], kernelPx: number): OpenCV['Mat'] {
  return directionalCloseForeground(cv, src, kernelPx, 'ink')
}
