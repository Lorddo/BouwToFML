import type { OpenCV } from '../loadOpenCV'
import { getOpenCvCapabilities } from './opencvCapabilities'
import { otsuThresholdFromGray } from './otsu'
import {
  createCanvas,
  hasHtmlImageElement,
  isCanvasLike,
  readRgbaMatFromCanvas,
  type CanvasLike,
} from './canvasEnv'

/** UI-slider midden = geen OpenCV-offset. */
export const UI_BRIGHTNESS_NEUTRAL = 50
export const UI_BRIGHTNESS_MIN = -150
export const UI_BRIGHTNESS_MAX = 250

export function uiBrightnessToOpenCv(uiBrightness: number): number {
  return uiBrightness - UI_BRIGHTNESS_NEUTRAL
}

export interface PreprocessOptions {
  brightness?: number
  contrast?: number
  threshold?: number
  applyThreshold?: boolean
  thresholdMode?: 'fixed' | 'adaptive' | 'otsu' | 'edgeAware'
  useAdaptive?: boolean
  /** Adaptive neighbourhood (must be odd ≥3). Default 11. */
  adaptiveBlockSize?: number
  edgeAwareEdgeBoost?: number
  rotate180?: boolean
  blurSize?: number
}

/** OpenCV adaptiveThreshold C (constant aftrek van lokale mean). */
const ADAPTIVE_THRESHOLD_C = 2
/** Klassieke default block size — schaalgevoelig t.o.v. stroke op 4k. */
export const DEFAULT_ADAPTIVE_BLOCK_SIZE = 11
export const MIN_ADAPTIVE_BLOCK_SIZE = 3
export const MAX_ADAPTIVE_BLOCK_SIZE = 51
/** Standaard vaste voor-B/W vóór adaptive/otsu/… */
export const DEFAULT_PRE_BINARIZE_THRESHOLD = 150

/** Forceer oneven block size in [3, 51] voor OpenCV. */
export function clampAdaptiveBlockSize(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_ADAPTIVE_BLOCK_SIZE
  let n = Math.round(value)
  if (n % 2 === 0) n += 1
  return Math.max(MIN_ADAPTIVE_BLOCK_SIZE, Math.min(MAX_ADAPTIVE_BLOCK_SIZE, n))
}

const DEFAULTS: Required<PreprocessOptions> = {
  brightness: 0,
  contrast: 1.0,
  threshold: 128,
  applyThreshold: true,
  thresholdMode: 'fixed',
  useAdaptive: false,
  adaptiveBlockSize: DEFAULT_ADAPTIVE_BLOCK_SIZE,
  edgeAwareEdgeBoost: 0,
  rotate180: true,
  blurSize: 3,
}

const THRESHOLD_MODES = ['fixed', 'adaptive', 'otsu', 'edgeAware'] as const

function resolveThresholdMode(opts: PreprocessOptions): (typeof THRESHOLD_MODES)[number] {
  const mode = opts.thresholdMode
  if (mode && (THRESHOLD_MODES as readonly string[]).includes(mode)) return mode
  return opts.useAdaptive ? 'adaptive' : 'fixed'
}

function thresholdByOtsu(cv: OpenCV, src: OpenCV['Mat'], out: OpenCV['Mat']): void {
  const caps = getOpenCvCapabilities(cv)
  if (caps.otsuSupported) {
    cv.threshold(src, out, 0, 255, cv.THRESH_BINARY | caps.otsuFlag)
    return
  }
  const threshold = otsuThresholdFromGray(src.data)
  cv.threshold(src, out, threshold, 255, cv.THRESH_BINARY)
}

/**
 * Edge-aware B/W: vaste drempel op grijs dat nabij randen donkerder is gemaakt.
 * boost 0 ≈ vast; hogere boost trekt grijze lijnen/contrastranden harder mee als inkt.
 */
function thresholdEdgeAware(
  cv: OpenCV,
  src: OpenCV['Mat'],
  out: OpenCV['Mat'],
  threshold: number,
  edgeBoost: number,
): void {
  const blurred = new cv.Mat()
  const edgeBoostClamped = Math.max(0, Math.min(12, Math.round(edgeBoost)))

  try {
    cv.GaussianBlur(src, blurred, new cv.Size(3, 3), 0)
    if (edgeBoostClamped <= 0) {
      cv.threshold(blurred, out, threshold, 255, cv.THRESH_BINARY)
      return
    }

    const gradX = new cv.Mat()
    const gradY = new cv.Mat()
    const absX = new cv.Mat()
    const absY = new cv.Mat()
    const edges = new cv.Mat()
    const enhanced = new cv.Mat()
    // Max ~10 gray-levels per boost-stap (0…120) van de randmagnitude aftrekken.
    const edgeWeight = edgeBoostClamped * (10 / 255)
    try {
      cv.Sobel(blurred, gradX, cv.CV_16S, 1, 0, 3)
      cv.Sobel(blurred, gradY, cv.CV_16S, 0, 1, 3)
      cv.convertScaleAbs(gradX, absX)
      cv.convertScaleAbs(gradY, absY)
      cv.addWeighted(absX, 0.5, absY, 0.5, 0, edges)
      // enhanced = blurred - edgeWeight * edges → randen worden donkerder → eerder inkt.
      cv.addWeighted(blurred, 1, edges, -edgeWeight, 0, enhanced)
      cv.threshold(enhanced, out, threshold, 255, cv.THRESH_BINARY)
    } finally {
      enhanced.delete()
      edges.delete()
      absY.delete()
      absX.delete()
      gradY.delete()
      gradX.delete()
    }
  } finally {
    blurred.delete()
  }
}

export function toGrayscaleMat(
  cv: OpenCV,
  source: HTMLCanvasElement | HTMLImageElement | OffscreenCanvas,
  options: PreprocessOptions = {},
): OpenCV['Mat'] {
  const opts = { ...DEFAULTS, ...options }
  let src: OpenCV['Mat']
  if (isCanvasLike(source)) {
    src = readRgbaMatFromCanvas(cv, source)
  } else if (hasHtmlImageElement() && source instanceof HTMLImageElement) {
    src = cv.imread(source)
  } else {
    src = cv.imread(source as unknown as HTMLCanvasElement)
  }
  let work = new cv.Mat()

  if (opts.rotate180) {
    cv.rotate(src, work, cv.ROTATE_180)
    src.delete()
    src = work
    work = new cv.Mat()
  }

  cv.cvtColor(src, work, cv.COLOR_RGBA2GRAY, 0)
  src.delete()
  src = work
  work = new cv.Mat()

  if (opts.brightness !== 0 || opts.contrast !== 1) {
    src.convertTo(work, -1, opts.contrast, opts.brightness)
    src.delete()
    src = work
    work = new cv.Mat()
  }

  if (opts.blurSize > 1) {
    const k = opts.blurSize | 1
    cv.GaussianBlur(src, work, new cv.Size(k, k), 0)
    src.delete()
    src = work
    work = new cv.Mat()
  }

  work.delete()
  return src
}

export function binarizeMat(
  cv: OpenCV,
  src: OpenCV['Mat'],
  options: PreprocessOptions = {},
): OpenCV['Mat'] {
  // Geen `...options` over DEFAULTS heen als velden expliciet undefined zijn —
  // dat zou thresholdMode wissen en stil terugvallen op useAdaptive/fixed.
  const opts: Required<PreprocessOptions> = {
    ...DEFAULTS,
    brightness: options.brightness ?? DEFAULTS.brightness,
    contrast: options.contrast ?? DEFAULTS.contrast,
    threshold: options.threshold ?? DEFAULTS.threshold,
    applyThreshold: options.applyThreshold ?? DEFAULTS.applyThreshold,
    thresholdMode: resolveThresholdMode(options),
    useAdaptive: options.useAdaptive ?? DEFAULTS.useAdaptive,
    adaptiveBlockSize: clampAdaptiveBlockSize(options.adaptiveBlockSize),
    edgeAwareEdgeBoost: options.edgeAwareEdgeBoost ?? DEFAULTS.edgeAwareEdgeBoost,
    rotate180: options.rotate180 ?? DEFAULTS.rotate180,
    blurSize: options.blurSize ?? DEFAULTS.blurSize,
  }
  if (!opts.applyThreshold) return src

  const mode = opts.thresholdMode
  const out = new cv.Mat()
  if (mode === 'adaptive') {
    cv.adaptiveThreshold(
      src,
      out,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      opts.adaptiveBlockSize,
      ADAPTIVE_THRESHOLD_C,
    )
  } else if (mode === 'otsu') {
    thresholdByOtsu(cv, src, out)
  } else if (mode === 'edgeAware') {
    thresholdEdgeAware(cv, src, out, opts.threshold, opts.edgeAwareEdgeBoost)
  } else {
    cv.threshold(src, out, opts.threshold, 255, cv.THRESH_BINARY)
  }
  src.delete()
  return out
}

export function matToCanvas(cv: OpenCV, mat: OpenCV['Mat']): CanvasLike {
  const canvas = createCanvas(mat.cols, mat.rows)
  if (mat.channels() === 1) {
    const rgb = new cv.Mat()
    cv.cvtColor(mat, rgb, cv.COLOR_GRAY2RGBA)
    cv.imshow(canvas, rgb)
    rgb.delete()
    return canvas
  }
  cv.imshow(canvas, mat)
  return canvas
}
