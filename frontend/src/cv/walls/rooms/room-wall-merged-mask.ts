import type { OpenCV } from '@/cv/loadOpenCV'
import { createCanvas, type CanvasLike } from '@/cv/port/canvasEnv'
import { kernelFromPixelRadius, morphBinaryInPlace } from '@/cv/port/morphClose'
import { resolveMergedWallCloseRadiusPx } from './room-wall-close-radius'

function morphCloseMergedWallMask(
  cv: OpenCV,
  mergedMask: OpenCV['Mat'],
  radiusPx: number,
): OpenCV['Mat'] {
  const closed = mergedMask.clone()
  const kernelPx = kernelFromPixelRadius(radiusPx)
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelPx, kernelPx))
  morphBinaryInPlace(cv, closed, cv.MORPH_CLOSE, kernel, 'white')
  kernel.delete()
  return closed
}

export function closeWallMaskMat(params: {
  cv: OpenCV
  mask: OpenCV['Mat']
  wallStyle?: 'solid' | 'open'
  referenceWallThicknessPx?: number
  preprocessThickenPx?: number
}): OpenCV['Mat'] {
  const radiusPx = resolveMergedWallCloseRadiusPx({
    wallStyle: params.wallStyle,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    preprocessThickenPx: params.preprocessThickenPx,
  })
  return morphCloseMergedWallMask(params.cv, params.mask, radiusPx)
}

/** Debug: gesloten muur-union semi-transparant over classificatie-mask. */
export function renderMergedWallCloseOverlay(params: {
  base: CanvasLike
  closedMask: OpenCV['Mat']
}): CanvasLike {
  const canvas = createCanvas(params.base.width, params.base.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(params.base as unknown as CanvasImageSource, 0, 0)

  const { width, height } = params.base
  const maskData = params.closedMask.data as Uint8Array
  const overlay = ctx.createImageData(width, height)
  for (let idx = 0; idx < width * height; idx += 1) {
    if ((maskData[idx] ?? 0) < 128) continue
    const px = idx * 4
    overlay.data[px] = 34
    overlay.data[px + 1] = 197
    overlay.data[px + 2] = 94
    overlay.data[px + 3] = 140
  }
  ctx.putImageData(overlay, 0, 0)
  return canvas
}
