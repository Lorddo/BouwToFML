import type { OpenCV } from '@/cv/loadOpenCV'

export interface OpenCvCapabilities {
  lsd: boolean
  otsuConstant: boolean
  otsuSupported: boolean
  otsuFlag: number
}

const FALLBACK_THRESH_OTSU = 8
const cache = new WeakMap<object, OpenCvCapabilities>()

function probeOtsuSupport(cv: OpenCV, otsuFlag: number): boolean {
  if (typeof cv.threshold !== 'function') return false
  const src = new cv.Mat(2, 2, cv.CV_8UC1)
  const dst = new cv.Mat()
  try {
    src.setTo(new cv.Scalar(128))
    cv.threshold(src, dst, 0, 255, cv.THRESH_BINARY | otsuFlag)
    return true
  } catch {
    return false
  } finally {
    dst.delete()
    src.delete()
  }
}

export function getOpenCvCapabilities(cv: OpenCV): OpenCvCapabilities {
  const key = cv as object
  const hit = cache.get(key)
  if (hit) return hit

  const otsuConstant = typeof cv.THRESH_OTSU === 'number'
  const otsuFlag = otsuConstant ? cv.THRESH_OTSU : FALLBACK_THRESH_OTSU
  const caps: OpenCvCapabilities = {
    lsd: typeof cv.createLineSegmentDetector === 'function',
    otsuConstant,
    otsuSupported: probeOtsuSupport(cv, otsuFlag),
    otsuFlag,
  }
  cache.set(key, caps)
  return caps
}
