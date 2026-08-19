import type { OpenCV } from '@/cv/loadOpenCV'
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
