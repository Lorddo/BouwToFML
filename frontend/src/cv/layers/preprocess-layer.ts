import type { LayerContext, PreprocessResult } from './types'
import type { OpenCV } from '@/cv/loadOpenCV'
import { ensureBlackInkOnWhiteBackground } from '@/cv/port/binaryPolarity'
import {
  binarizeMat,
  matToCanvas,
  toGrayscaleMat,
  uiBrightnessToOpenCv,
} from '@/cv/port/preprocess'
import { despeckleByMinArea } from '@/cv/port/despeckle'
import { maskHasInk } from '@/cv/tools/polygon'
import { rotateMatExpandBounds } from '@/cv/tools/rotateMat'
import {
  applyNegative,
  fillHolesByMaxArea,
  openWhiteDetails,
  smoothBinaryLines,
  thickenLines,
  thinLines,
} from '@/cv/port/cleanBinary'
import { isColorThresholdEnabled } from '@/cv/preprocess/layer-preprocess'
import { directionalClose, kernelFromPixelRadius } from '@/cv/port/morphClose'

function applyEraserMask(cv: OpenCV, mat: OpenCV['Mat'], mask?: Uint8Array): void {
  if (!mask || mask.length !== mat.cols * mat.rows || !maskHasInk(mask)) return
  const maskMat = new cv.Mat(mat.rows, mat.cols, cv.CV_8UC1)
  maskMat.data.set(mask)
  mat.setTo(new cv.Scalar(255), maskMat)
  maskMat.delete()
}

function applyBrightnessContrast(
  cv: OpenCV,
  mat: OpenCV['Mat'],
  brightness: number,
  contrast: number,
): OpenCV['Mat'] {
  if (brightness === 0 && contrast === 1) return mat
  const out = new cv.Mat()
  mat.convertTo(out, -1, contrast, brightness)
  mat.delete()
  return out
}

/** Gedeelde grijswaarden-stap (rotatie/helderheid) — hergebruik voor muur + referentie-preprocess. */
export function buildGrayscalePreMat(ctx: LayerContext): OpenCV['Mat'] {
  const { cv, image, preprocess } = ctx
  const brightnessContrastEnabled = preprocess.adjustBrightnessContrastEnabled ?? false

  let mat = toGrayscaleMat(cv, image, {
    brightness: 0,
    contrast: 1,
    rotate180: preprocess.rotate180,
    blurSize: 1,
  })

  if (preprocess.adjustNegativeEnabled ?? false) applyNegative(cv, mat)
  mat = applyBrightnessContrast(
    cv,
    mat,
    brightnessContrastEnabled ? uiBrightnessToOpenCv(preprocess.brightness) : 0,
    brightnessContrastEnabled ? preprocess.contrast : 1,
  )

  const totalRotation = (preprocess.autoRotationDeg ?? 0) + (preprocess.rotationDeg ?? 0)
  return rotateMatExpandBounds(cv, mat, totalRotation)
}

function runBinarizedPreprocessFromGray(ctx: LayerContext, gray: OpenCV['Mat']): PreprocessResult {
  const { cv, eraserMask } = ctx
  const preprocess = ctx.preprocess
  const smoothEnabled = preprocess.smoothLinesEnabled ?? false
  const smoothStrength = smoothEnabled ? preprocess.smoothLines : 0
  const thresholdEnabled = isColorThresholdEnabled(preprocess)
  const removeSpeckles = preprocess.removeSpecklesEnabled ?? false
  const removeHoles = preprocess.removeHolesEnabled ?? false
  const thickenEnabled = preprocess.thickenLinesEnabled ?? false
  const bridgeEnabled = preprocess.bridgeGapsEnabled ?? false

  let mat = gray.clone()

  const preBinarize = thresholdEnabled && (preprocess.preBinarizeEnabled ?? false)
  const useAdaptive = thresholdEnabled && (preprocess.useAdaptive ?? false)
  const preThreshold = Math.max(
    0,
    Math.min(255, Math.round(preprocess.preBinarizeThreshold ?? 150)),
  )

  // Stap 1 (optioneel): vaste B/W — geen grijs meer; daarna stap 2 (adaptive).
  if (preBinarize) {
    mat = binarizeMat(cv, mat, {
      applyThreshold: true,
      thresholdMode: 'fixed',
      useAdaptive: false,
      threshold: preThreshold,
    })
  }

  // Stap 2: adaptive alleen als aangezet. Beide uit → vaste drempel (geen grijs naar detectie).
  if (useAdaptive) {
    mat = binarizeMat(cv, mat, {
      threshold: preprocess.threshold,
      applyThreshold: true,
      useAdaptive: true,
      thresholdMode: 'adaptive',
      adaptiveBlockSize: preprocess.adaptiveBlockSize,
      edgeAwareEdgeBoost: preprocess.edgeAwareEdgeBoost ?? 0,
    })
  } else if (thresholdEnabled && !preBinarize) {
    mat = binarizeMat(cv, mat, {
      applyThreshold: true,
      thresholdMode: 'fixed',
      useAdaptive: false,
      threshold: preThreshold,
    })
  }

  if (thresholdEnabled) {
    ensureBlackInkOnWhiteBackground(cv, mat)
  }

  if (removeSpeckles) {
    despeckleByMinArea(cv, mat, preprocess.despeckleMinPx ?? 0)
  }

  const whiteOpenPx = Math.max(0, Math.round(preprocess.despeckleOpen ?? 0))
  if ((removeHoles || removeSpeckles) && whiteOpenPx > 0) {
    openWhiteDetails(cv, mat, whiteOpenPx)
  }

  if (removeHoles) {
    fillHolesByMaxArea(cv, mat, preprocess.removeHolesMaxPx ?? 0)
  }

  const closePx = bridgeEnabled ? Math.max(0, Math.round(preprocess.bridgeGaps ?? 0)) : 0
  if (bridgeEnabled && closePx > 0) {
    const closed = directionalClose(cv, mat, kernelFromPixelRadius(closePx, 3))
    mat.delete()
    mat = closed
  }

  if (smoothEnabled) {
    smoothBinaryLines(cv, mat, smoothStrength)
  }

  if (thickenEnabled) {
    thickenLines(cv, mat, preprocess.thickenLinesPx ?? 0)
  }

  const erodeEnabled = preprocess.erodeLinesEnabled ?? false
  const erodePx = erodeEnabled ? Math.max(0, Math.round(preprocess.erodeLinesPx ?? 0)) : 0
  if (erodePx > 0) {
    thinLines(cv, mat, erodePx)
  }

  if (preprocess.finalNegativeEnabled ?? false) {
    applyNegative(cv, mat)
  }

  applyEraserMask(cv, mat, eraserMask)
  const previewCanvas = matToCanvas(cv, mat)

  return {
    mat,
    previewCanvas,
    config: preprocess,
  }
}

export function runPreprocessLayerFromGrayscale(
  ctx: LayerContext,
  gray: OpenCV['Mat'],
): PreprocessResult {
  return runBinarizedPreprocessFromGray(ctx, gray)
}

export function runPreprocessLayer(ctx: LayerContext): PreprocessResult {
  const gray = buildGrayscalePreMat(ctx)
  try {
    return runBinarizedPreprocessFromGray(ctx, gray)
  } finally {
    gray.delete()
  }
}

/** B/W + grijs voor OCR-scan — één gedeelde grijswaarden-pass (Tesseract op beide). */
export function runOcrScanLayers(ctx: LayerContext): {
  bw: PreprocessResult
  grayscale: PreprocessResult
} {
  const { cv, eraserMask, preprocess } = ctx
  const gray = buildGrayscalePreMat(ctx)
  const grayForOcr = gray.clone()
  applyEraserMask(cv, grayForOcr, eraserMask)
  const bw = runPreprocessLayerFromGrayscale(ctx, gray)
  gray.delete()
  return {
    bw,
    grayscale: {
      mat: grayForOcr,
      previewCanvas: matToCanvas(cv, grayForOcr),
      config: preprocess,
    },
  }
}
