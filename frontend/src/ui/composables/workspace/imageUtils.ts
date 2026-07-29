import type { HScaleState } from '@/platform/calibration'
import { ROTATION_EPS_DEG, uiRotationToCvDegrees } from '@/cv/tools/rotateMat'
import type { CanvasLike } from '@/cv/port/canvasEnv'
import { OPTIMIZATION_BASE_DIMENSION } from './constants'

export interface PixelBounds {
  left: number
  top: number
  width: number
  height: number
}

export interface WorkingCanvasNormalizeResult {
  canvas: HTMLCanvasElement
  cropOffset: { x: number; y: number }
  scale: number
}

const CONTENT_WHITE_THRESHOLD = 250
const CONTENT_BOUNDS_PADDING_PX = 50
const MIN_CONTENT_EDGE_PX = 12

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isContentPixel(r: number, g: number, b: number, threshold = CONTENT_WHITE_THRESHOLD): boolean {
  return r < threshold || g < threshold || b < threshold
}

function findContentBounds(
  canvas: HTMLCanvasElement,
  options?: { threshold?: number; padding?: number },
): PixelBounds | null {
  const width = canvas.width
  const height = canvas.height
  if (width <= 0 || height <= 0) return null

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  const threshold = options?.threshold ?? CONTENT_WHITE_THRESHOLD
  const padding = options?.padding ?? CONTENT_BOUNDS_PADDING_PX
  const { data } = ctx.getImageData(0, 0, width, height)

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      const offset = (row + x) * 4
      if (!isContentPixel(data[offset], data[offset + 1], data[offset + 2], threshold)) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < minX || maxY < minY) return null

  const left = clamp(minX - padding, 0, width - 1)
  const top = clamp(minY - padding, 0, height - 1)
  const right = clamp(maxX + padding, 0, width - 1)
  const bottom = clamp(maxY + padding, 0, height - 1)
  const boundsWidth = right - left + 1
  const boundsHeight = bottom - top + 1
  if (boundsWidth < MIN_CONTENT_EDGE_PX || boundsHeight < MIN_CONTENT_EDGE_PX) return null

  return { left, top, width: boundsWidth, height: boundsHeight }
}

function cropCanvasToBounds(canvas: HTMLCanvasElement, bounds: PixelBounds): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = bounds.width
  out.height = bounds.height
  const ctx = out.getContext('2d')
  if (!ctx) return out
  ctx.drawImage(canvas, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height)
  return out
}

/**
 * Upscale naar min. langste zijde (`OPTIMIZATION_BASE_DIMENSION` = 3000).
 * High-quality smoothing (bicubic-achtig) i.p.v. nearest-neighbor — schonere
 * randen voor adaptive B/W. Geen downscale als max-edge al ≥ floor.
 */
function upscaleCanvasToMinMaxEdge(
  canvas: HTMLCanvasElement,
  minMaxEdge = OPTIMIZATION_BASE_DIMENSION,
): { canvas: HTMLCanvasElement; scale: number } {
  const maxEdge = Math.max(canvas.width, canvas.height, 1)
  if (maxEdge >= minMaxEdge) {
    return { canvas, scale: 1 }
  }

  const scale = minMaxEdge / maxEdge
  const width = Math.max(1, Math.round(canvas.width * scale))
  const height = Math.max(1, Math.round(canvas.height * scale))
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')
  if (!ctx) {
    return { canvas, scale: 1 }
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, width, height)
  return { canvas: out, scale }
}

/** Snijd witte randen weg en schaal op tot minimaal `minMaxEdge` (default 3000px). */
export function normalizeWorkingCanvas(
  canvas: HTMLCanvasElement,
  options?: { minMaxEdge?: number; trimWhitespace?: boolean },
): WorkingCanvasNormalizeResult {
  const trimWhitespace = options?.trimWhitespace ?? true
  const minMaxEdge = options?.minMaxEdge ?? OPTIMIZATION_BASE_DIMENSION

  let working = canvas
  let cropOffset = { x: 0, y: 0 }

  if (trimWhitespace) {
    const bounds = findContentBounds(canvas)
    if (bounds && (bounds.left > 0 || bounds.top > 0 || bounds.width < canvas.width || bounds.height < canvas.height)) {
      working = cropCanvasToBounds(canvas, bounds)
      cropOffset = { x: bounds.left, y: bounds.top }
    }
  }

  const upscaled = upscaleCanvasToMinMaxEdge(working, minMaxEdge)
  return {
    canvas: upscaled.canvas,
    cropOffset,
    scale: upscaled.scale,
  }
}

export function transformHScaleState(
  state: HScaleState,
  transform: { offsetX: number; offsetY: number; scale: number },
  width: number,
  height: number,
): HScaleState {
  const mapX = (value: number) => clamp(Math.round((value - transform.offsetX) * transform.scale), 0, width)
  const mapY = (value: number) => clamp(Math.round((value - transform.offsetY) * transform.scale), 0, height)
  return {
    xLeft: mapX(state.xLeft),
    xRight: mapX(state.xRight),
    xGuideY: mapY(state.xGuideY),
    yTop: mapY(state.yTop),
    yBottom: mapY(state.yBottom),
    yGuideX: mapX(state.yGuideX),
  }
}

export function transformHScaleStateRotate180(state: HScaleState, width: number, height: number): HScaleState {
  return {
    xLeft: width - state.xRight,
    xRight: width - state.xLeft,
    xGuideY: height - state.xGuideY,
    yTop: height - state.yBottom,
    yBottom: height - state.yTop,
    yGuideX: width - state.yGuideX,
  }
}

/** Map a point through the same UI→CV affine used at underlay bake (expanded bounds). */
export function mapPointAfterUiRotation(
  x: number,
  y: number,
  width: number,
  height: number,
  uiDegrees: number,
  outWidth: number,
  outHeight: number,
): { x: number; y: number } {
  const cvDeg = uiRotationToCvDegrees(uiDegrees)
  const rad = (cvDeg * Math.PI) / 180
  const alpha = Math.cos(rad)
  const beta = Math.sin(rad)
  const cx = width / 2
  const cy = height / 2
  const tx = (1 - alpha) * cx - beta * cy + (outWidth - width) / 2
  const ty = beta * cx + (1 - alpha) * cy + (outHeight - height) / 2
  return {
    x: clamp(Math.round(alpha * x + beta * y + tx), 0, outWidth),
    y: clamp(Math.round(-beta * x + alpha * y + ty), 0, outHeight),
  }
}

export function transformHScaleStateRotation(
  state: HScaleState,
  width: number,
  height: number,
  uiDegrees: number,
  outWidth: number,
  outHeight: number,
): HScaleState {
  const map = (px: number, py: number) =>
    mapPointAfterUiRotation(px, py, width, height, uiDegrees, outWidth, outHeight)

  const xLeft = map(state.xLeft, state.xGuideY)
  const xRight = map(state.xRight, state.xGuideY)
  const yTop = map(state.yGuideX, state.yTop)
  const yBottom = map(state.yGuideX, state.yBottom)
  const xGuide = map(state.yGuideX, state.xGuideY)

  return {
    xLeft: Math.min(xLeft.x, xRight.x),
    xRight: Math.max(xLeft.x, xRight.x),
    xGuideY: xGuide.y,
    yTop: Math.min(yTop.y, yBottom.y),
    yBottom: Math.max(yTop.y, yBottom.y),
    yGuideX: xGuide.x,
  }
}

export type SelectionRectBounds = { x: number; y: number; width: number; height: number }

function mapPointRotate180(x: number, y: number, width: number, height: number): { x: number; y: number } {
  return { x: width - x, y: height - y }
}

function boundsFromCorners(
  corners: Array<{ x: number; y: number }>,
  maxWidth: number,
  maxHeight: number,
): SelectionRectBounds {
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  const x0 = clamp(Math.min(...xs), 0, maxWidth)
  const y0 = clamp(Math.min(...ys), 0, maxHeight)
  const x1 = clamp(Math.max(...xs), 0, maxWidth)
  const y1 = clamp(Math.max(...ys), 0, maxHeight)
  return {
    x: x0,
    y: y0,
    width: Math.max(1, x1 - x0),
    height: Math.max(1, y1 - y0),
  }
}

/** Transformeer LBE-referentievak mee met bake (rotate180 → rotatie → crop/upscale). */
export function transformSelectionRect(
  rect: SelectionRectBounds,
  params: {
    sourceWidth: number
    sourceHeight: number
    rotate180: boolean
    uiRotationDeg: number
    bakedWidth: number
    bakedHeight: number
    cropOffset: { x: number; y: number }
    scale: number
    outWidth: number
    outHeight: number
  },
): SelectionRectBounds {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ]

  let mapped = corners
  if (params.rotate180) {
    mapped = mapped.map((p) => mapPointRotate180(p.x, p.y, params.sourceWidth, params.sourceHeight))
  }
  if (Math.abs(params.uiRotationDeg) > ROTATION_EPS_DEG) {
    mapped = mapped.map((p) =>
      mapPointAfterUiRotation(
        p.x,
        p.y,
        params.sourceWidth,
        params.sourceHeight,
        params.uiRotationDeg,
        params.bakedWidth,
        params.bakedHeight,
      ),
    )
  }

  const afterBake = boundsFromCorners(mapped, params.bakedWidth, params.bakedHeight)
  const mapX = (value: number) =>
    clamp(Math.round((value - params.cropOffset.x) * params.scale), 0, params.outWidth)
  const mapY = (value: number) =>
    clamp(Math.round((value - params.cropOffset.y) * params.scale), 0, params.outHeight)
  const x0 = mapX(afterBake.x)
  const y0 = mapY(afterBake.y)
  const x1 = mapX(afterBake.x + afterBake.width)
  const y1 = mapY(afterBake.y + afterBake.height)
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.max(1, Math.abs(x1 - x0)),
    height: Math.max(1, Math.abs(y1 - y0)),
  }
}

export function imageSourceToCanvas(source: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  if (source instanceof HTMLCanvasElement) {
    const copy = document.createElement('canvas')
    copy.width = source.width
    copy.height = source.height
    copy.getContext('2d')?.drawImage(source, 0, 0)
    return copy
  }
  const canvas = document.createElement('canvas')
  canvas.width = source.naturalWidth
  canvas.height = source.naturalHeight
  canvas.getContext('2d')?.drawImage(source, 0, 0)
  return canvas
}

export function canvasLikeToHtmlCanvas(canvas: CanvasLike): HTMLCanvasElement {
  if (typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement) {
    return canvas
  }
  const copy = document.createElement('canvas')
  copy.width = canvas.width
  copy.height = canvas.height
  copy.getContext('2d')?.drawImage(canvas as unknown as CanvasImageSource, 0, 0)
  return copy
}

export function imageDimensions(img: HTMLImageElement | HTMLCanvasElement): { width: number; height: number } {
  if (img instanceof HTMLCanvasElement) {
    return { width: img.width, height: img.height }
  }
  return { width: img.naturalWidth, height: img.naturalHeight }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Kon afbeelding niet laden.'))
    img.src = src
  })
}

export interface OptimizationBaseResult {
  src: string
  image: HTMLImageElement
  /** Uniform upscale factor applied to reach min max-edge (1 = unchanged). */
  scale: number
}

export async function buildOptimizationBase(src: string): Promise<OptimizationBaseResult> {
  const original = await loadImage(src)
  const maxEdge = Math.max(original.naturalWidth, original.naturalHeight)

  if (maxEdge >= OPTIMIZATION_BASE_DIMENSION) {
    return { src, image: original, scale: 1 }
  }

  const canvas = document.createElement('canvas')
  canvas.width = original.naturalWidth
  canvas.height = original.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { src, image: original, scale: 1 }
  }
  ctx.drawImage(original, 0, 0)
  const { canvas: upscaled, scale } = upscaleCanvasToMinMaxEdge(canvas, OPTIMIZATION_BASE_DIMENSION)

  const upscaledSrc = upscaled.toDataURL('image/png')
  const upscaledImage = await loadImage(upscaledSrc)
  return { src: upscaledSrc, image: upscaledImage, scale }
}

/** Houd schaallinialen / bevestigde px·mm gelijk na stille upscale (upload-base). */
export function applyPixelScaleFactorToCalibration(
  scale: {
    confirmed: { value: boolean }
    state: { value: HScaleState | null }
    applyUpscaleToConfirmedScale: (factor: number) => void
  },
  factor: number,
  width: number,
  height: number,
): void {
  if (!Number.isFinite(factor) || factor === 1) return
  if (scale.confirmed.value) {
    scale.applyUpscaleToConfirmedScale(factor)
    return
  }
  if (!scale.state.value) return
  scale.state.value = transformHScaleState(
    scale.state.value,
    { offsetX: 0, offsetY: 0, scale: factor },
    width,
    height,
  )
}
