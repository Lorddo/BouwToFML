import type { PreprocessConfig } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import {
  createCanvas,
  canvasToDataUrlAsync,
  readRgbaMatFromCanvas,
  type CanvasLike,
} from '@/cv/port/canvasEnv'
import { measureBorderWhiteRatio } from '@/cv/port/binaryPolarity'
import { matToCanvas } from '@/cv/port/preprocess'
import {
  buildWallLayerBwMat,
  bwBytesToCanvas,
  WALL_BW_WHITE,
} from '@/cv/preprocess/compose-wall-bw'
import { rotateMatExpandBounds } from '@/cv/tools/rotateMat'
import { estimateRefAxisCorrectionDeg } from './ref-axis-align'
import type { RefRect } from './types'

/**
 * Full-image muur-B/W (wallLayer-tune). Owner: compose-wall-bw.
 * Fallback wanneer geen UI-`baseBw`; canonieke bron na bake = `baseBw`.
 * Caller moet `mat.delete()` aanroepen.
 */
export { buildWallLayerBwMat }

/** @deprecated Lokaal Otsu/adaptive is vervangen door wallLayer; blijft voor legacy result-velden. */
export type RefBwMode = 'otsu' | 'adaptive' | 'wallLayer'

export type RefCropBwResult = {
  originalCanvas: CanvasLike
  bwMat: OpenCV['Mat']
  width: number
  height: number
  bwData: Uint8Array
  polarityInverted: boolean
  /** Toegepaste as-align correctie (UI-graden) */
  skewCorrectedDeg: number
  bwMode: RefBwMode
}

function clampRect(
  rect: RefRect,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const x0 = Math.max(0, Math.floor(rect.x))
  const y0 = Math.max(0, Math.floor(rect.y))
  const x1 = Math.min(imageWidth, Math.ceil(rect.x + rect.width))
  const y1 = Math.min(imageHeight, Math.ceil(rect.y + rect.height))
  return {
    x: x0,
    y: y0,
    width: Math.max(1, x1 - x0),
    height: Math.max(1, y1 - y0),
  }
}

function imageSize(image: HTMLImageElement | HTMLCanvasElement): { width: number; height: number } {
  if (image instanceof HTMLCanvasElement) {
    return { width: image.width, height: image.height }
  }
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  }
}

/** Legacy helper — wallLayer-crops skip invert; tests/HTML-export mogen dit nog gebruiken. */
export function shouldInvertRefCropPolarity(
  data: Uint8Array,
  width: number,
  height: number,
): boolean {
  return measureBorderWhiteRatio(data, width, height) < 0.45
}

function canvasFromRgbaMat(cv: OpenCV, mat: OpenCV['Mat']): CanvasLike {
  return matToCanvas(cv, mat)
}

function syncBwData(bw: OpenCV['Mat']): Uint8Array {
  const bwData = new Uint8Array(bw.rows * bw.cols)
  bwData.set(bw.data as Uint8Array)
  return bwData
}

function cropColorCanvas(
  image: HTMLImageElement | HTMLCanvasElement,
  box: { x: number; y: number; width: number; height: number },
): CanvasLike {
  const originalCanvas = createCanvas(box.width, box.height)
  const ctx = originalCanvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context niet beschikbaar voor ref-crop')
  ctx.drawImage(image, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height)
  return originalCanvas
}

function cropBwRegionFromMat(
  cv: OpenCV,
  fullBw: OpenCV['Mat'],
  box: { x: number; y: number; width: number; height: number },
): { bwMat: OpenCV['Mat']; bwData: Uint8Array } {
  const fullW = fullBw.cols
  const fullH = fullBw.rows
  const fullData = fullBw.data as Uint8Array
  const bwData = new Uint8Array(box.width * box.height)
  for (let y = 0; y < box.height; y += 1) {
    const srcY = box.y + y
    for (let x = 0; x < box.width; x += 1) {
      const srcX = box.x + x
      const v =
        srcY >= 0 && srcY < fullH && srcX >= 0 && srcX < fullW
          ? (fullData[srcY * fullW + srcX] ?? 255)
          : 255
      bwData[y * box.width + x] = v
    }
  }
  const bwMat = new cv.Mat(box.height, box.width, cv.CV_8UC1)
  bwMat.data.set(bwData)
  return { bwMat, bwData }
}

/** Gray `Uint8Array` → OpenCV Mat (CV_8UC1). Caller owns `mat.delete()`. */
export function grayMatFromBwBytes(
  cv: OpenCV,
  bw: Uint8Array,
  width: number,
  height: number,
): OpenCV['Mat'] {
  if (bw.length !== width * height) {
    throw new Error(`grayMatFromBwBytes: length ${bw.length} ≠ ${width}×${height}`)
  }
  const mat = new cv.Mat(height, width, cv.CV_8UC1)
  mat.data.set(bw)
  return mat
}

/** Crop gray bytes uit full-image B/W (geen preprocess, geen OCR). */
export function cropBwBytesFromRect(params: {
  bw: Uint8Array
  width: number
  height: number
  rect: RefRect
}): { data: Uint8Array; width: number; height: number } {
  const box = clampRect(params.rect, params.width, params.height)
  const data = new Uint8Array(box.width * box.height)
  for (let y = 0; y < box.height; y += 1) {
    const srcY = box.y + y
    for (let x = 0; x < box.width; x += 1) {
      const srcX = box.x + x
      data[y * box.width + x] =
        srcY >= 0 && srcY < params.height && srcX >= 0 && srcX < params.width
          ? (params.bw[srcY * params.width + srcX] ?? WALL_BW_WHITE)
          : WALL_BW_WHITE
    }
  }
  return { data, width: box.width, height: box.height }
}

/**
 * Crop ref-regio uit bestaande full-image wallLayer-B/W (geen lokale Otsu/adaptive).
 */
function cropRectFromWallBw(params: {
  cv: OpenCV
  image: HTMLImageElement | HTMLCanvasElement
  wallBwMat: OpenCV['Mat']
  rect: RefRect
  axisAlign?: boolean
}): RefCropBwResult {
  const { cv, image, wallBwMat, rect } = params
  const axisAlign = params.axisAlign === true
  const size = imageSize(image)
  const box = clampRect(rect, size.width, size.height)

  let originalCanvas = cropColorCanvas(image, box)
  let { bwMat: bw, bwData } = cropBwRegionFromMat(cv, wallBwMat, box)

  let skewCorrectedDeg = 0
  if (axisAlign) {
    const correction = estimateRefAxisCorrectionDeg(cv, bw)
    if (Math.abs(correction) >= 0.25) {
      skewCorrectedDeg = correction
      const rgba = readRgbaMatFromCanvas(cv, originalCanvas)
      const rotatedRgba = rotateMatExpandBounds(cv, rgba, correction)
      originalCanvas = canvasFromRgbaMat(cv, rotatedRgba)
      rotatedRgba.delete()
      rgba.delete()
      const rotatedBw = rotateMatExpandBounds(cv, bw, correction)
      bw.delete()
      bw = rotatedBw
      bwData = syncBwData(bw)
    }
  }

  return {
    originalCanvas,
    bwMat: bw,
    width: bw.cols,
    height: bw.rows,
    bwData,
    polarityInverted: false,
    skewCorrectedDeg,
    bwMode: 'wallLayer',
  }
}

/**
 * Crop → wallLayer-B/W (zelfde tune als plattegrond) → optionele as-align.
 * Prefer `baseBw` / `sharedWallBwMat` (post-bake inkl. inkt); fallback rebuild vanaf kleur.
 * Nooit `effectiveBw` (OCR).
 */
export function cropRectToLocalBw(params: {
  cv: OpenCV
  image: HTMLImageElement | HTMLCanvasElement
  rect: RefRect
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  axisAlign?: boolean
  /** Hergebruik full-image wallLayer-B/W (caller owns lifetime). */
  sharedWallBwMat?: OpenCV['Mat']
  /** Canonieke UI-bron na bake (gebakken inkt mee). */
  baseBw?: { data: Uint8Array; width: number; height: number }
}): RefCropBwResult {
  let owned = false
  let wallBwMat = params.sharedWallBwMat
  if (!wallBwMat && params.baseBw) {
    wallBwMat = grayMatFromBwBytes(
      params.cv,
      params.baseBw.data,
      params.baseBw.width,
      params.baseBw.height,
    )
    owned = true
  }
  if (!wallBwMat) {
    wallBwMat = buildWallLayerBwMat({
      cv: params.cv,
      image: params.image,
      preprocess: params.preprocess,
      eraserMask: params.eraserMask,
    })
    owned = true
  }
  try {
    return cropRectFromWallBw({
      cv: params.cv,
      image: params.image,
      wallBwMat,
      rect: params.rect,
      axisAlign: params.axisAlign,
    })
  } finally {
    if (owned) wallBwMat.delete()
  }
}

export async function canvasToPngDataUrl(canvas: CanvasLike): Promise<string> {
  const url = await canvasToDataUrlAsync(canvas, 'image/png')
  if (url) return url
  if ('toDataURL' in canvas && typeof canvas.toDataURL === 'function') {
    return canvas.toDataURL('image/png')
  }
  throw new Error('Kon canvas niet naar PNG data-URL converteren')
}

export function bwDataToCanvas(data: Uint8Array, width: number, height: number): CanvasLike {
  return bwBytesToCanvas(data, width, height)
}

export function cropRegion(params: {
  bwData: Uint8Array
  width: number
  height: number
  originalCanvas: CanvasLike
  bbox: { x: number; y: number; width: number; height: number }
}): {
  bwData: Uint8Array
  width: number
  height: number
  originalCanvas: CanvasLike
} {
  const x0 = Math.max(0, Math.floor(params.bbox.x))
  const y0 = Math.max(0, Math.floor(params.bbox.y))
  const x1 = Math.min(params.width, Math.ceil(params.bbox.x + params.bbox.width))
  const y1 = Math.min(params.height, Math.ceil(params.bbox.y + params.bbox.height))
  const w = Math.max(1, x1 - x0)
  const h = Math.max(1, y1 - y0)
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      out[y * w + x] = params.bwData[(y0 + y) * params.width + (x0 + x)] ?? 255
    }
  }
  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.drawImage(params.originalCanvas, x0, y0, w, h, 0, 0, w, h)
  }
  return { bwData: out, width: w, height: h, originalCanvas: canvas }
}
