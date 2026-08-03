/**
 * Wall-B/W compose: baseBw → OCR force-white → ink overlay (inkt wint).
 * Inkt-tools schrijven op inkOverlay (NONE/BLACK/WHITE), niet op de kleur-onderlegger.
 */
import type { PreprocessConfig } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import { createCanvas, type CanvasLike } from '@/cv/port/canvasEnv'
import { runPreprocessLayer } from '@/cv/layers/preprocess-layer'
import type { LayerContext } from '@/cv/layers/types'
import { resolveLayerPreprocess } from '@/cv/preprocess/layer-preprocess'
import { maskHasInk } from '@/cv/tools/polygon'
import type { InkRectBounds, InkStrokePoint } from '@/cv/tools/inkEdit'

export const INK_OVERLAY_NONE = 0 as const
export const INK_OVERLAY_BLACK = 1 as const
export const INK_OVERLAY_WHITE = 2 as const

export type InkOverlayCode =
  typeof INK_OVERLAY_NONE | typeof INK_OVERLAY_BLACK | typeof INK_OVERLAY_WHITE

/** Zwarte inkt op muur-B/W (OpenCV-conventie: 0 = inkt, 255 = wit). */
export const WALL_BW_INK = 0
export const WALL_BW_WHITE = 255

export function createInkOverlay(width: number, height: number): Uint8Array {
  return new Uint8Array(Math.max(0, width * height))
}

export function inkOverlayHasEdits(overlay: Uint8Array | null | undefined): boolean {
  if (!overlay || overlay.length === 0) return false
  for (let i = 0; i < overlay.length; i += 1) {
    if ((overlay[i] ?? 0) !== INK_OVERLAY_NONE) return true
  }
  return false
}

export function composeWallBw(params: {
  baseBw: Uint8Array
  ocrMask?: Uint8Array | null
  inkOverlay?: Uint8Array | null
}): Uint8Array {
  const { baseBw } = params
  const out = new Uint8Array(baseBw)
  const ocr = params.ocrMask
  if (ocr && ocr.length === baseBw.length && maskHasInk(ocr)) {
    for (let i = 0; i < out.length; i += 1) {
      if ((ocr[i] ?? 0) > 0) out[i] = WALL_BW_WHITE
    }
  }
  const ink = params.inkOverlay
  if (ink && ink.length === baseBw.length) {
    for (let i = 0; i < out.length; i += 1) {
      const code = ink[i] ?? INK_OVERLAY_NONE
      if (code === INK_OVERLAY_BLACK) out[i] = WALL_BW_INK
      else if (code === INK_OVERLAY_WHITE) out[i] = WALL_BW_WHITE
    }
  }
  return out
}

/**
 * Bake OCR mask into ink overlay as WHITE (in-place). Does not clear the OCR mask.
 * @returns true if any pixels were written.
 */
export function bakeOcrMaskIntoInkOverlay(ocrMask: Uint8Array, inkOverlay: Uint8Array): boolean {
  if (ocrMask.length !== inkOverlay.length) return false
  let changed = false
  for (let i = 0; i < ocrMask.length; i += 1) {
    if ((ocrMask[i] ?? 0) > 0) {
      inkOverlay[i] = INK_OVERLAY_WHITE
      changed = true
    }
  }
  return changed
}

/**
 * Bake live inkOverlay into baseBw (in-place). Clears baked pixels on overlay to NONE.
 * OCR blijft een aparte compose-laag — niet meebakken (gebruik bakeOcrMaskIntoInkOverlay).
 * @returns true als er pixels zijn gebakken.
 */
export function bakeInkOverlayIntoBaseBw(baseBw: Uint8Array, inkOverlay: Uint8Array): boolean {
  if (inkOverlay.length !== baseBw.length) return false
  let changed = false
  for (let i = 0; i < baseBw.length; i += 1) {
    const code = inkOverlay[i] ?? INK_OVERLAY_NONE
    if (code === INK_OVERLAY_NONE) continue
    if (code === INK_OVERLAY_BLACK) baseBw[i] = WALL_BW_INK
    else if (code === INK_OVERLAY_WHITE) baseBw[i] = WALL_BW_WHITE
    inkOverlay[i] = INK_OVERLAY_NONE
    changed = true
  }
  return changed
}

/** Merge source overlay into target: non-NONE source pixels overwrite target. */
export function mergeInkOverlayInto(target: Uint8Array, source: Uint8Array): void {
  if (target.length !== source.length) return
  for (let i = 0; i < target.length; i += 1) {
    const code = source[i] ?? INK_OVERLAY_NONE
    if (code !== INK_OVERLAY_NONE) target[i] = code
  }
}

/** Gray bytes → RGBA canvas (R=G=B, A=255). Missing → wit. */
export function bwBytesToCanvas(data: Uint8Array, width: number, height: number): CanvasLike {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const image = ctx.createImageData(width, height)
  for (let i = 0; i < data.length; i += 1) {
    const v = data[i] ?? WALL_BW_WHITE
    const o = i * 4
    image.data[o] = v
    image.data[o + 1] = v
    image.data[o + 2] = v
    image.data[o + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** @deprecated Prefer `bwBytesToCanvas` — alias voor bestaande callers. */
export const effectiveBwToCanvas = bwBytesToCanvas

/**
 * Full-image muur-B/W via wallLayer-tune (geen OCR/inkt).
 * Caller moet `mat.delete()` aanroepen.
 */
export function buildWallLayerBwMat(params: {
  cv: OpenCV
  image: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
}): OpenCV['Mat'] {
  const wallPreprocess = {
    ...resolveLayerPreprocess(params.preprocess, 'walls'),
    // Refs/baseBw liggen op gebakken onderlegger — geen stap-1 rotatie opnieuw.
    rotationDeg: 0,
    autoRotationDeg: 0,
    rotate180: false,
  }
  const layerCtx: LayerContext = {
    cv: params.cv,
    image: params.image,
    examples: [],
    eraserMask: params.eraserMask,
    preprocess: wallPreprocess,
  }
  return runPreprocessLayer(layerCtx).mat
}

/** Full-image muur-B/W zonder OCR/inkt — alleen optionele stap-1 eraser. */
export function buildBaseWallBw(params: {
  cv: OpenCV
  image: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
}): { data: Uint8Array; width: number; height: number; mat: OpenCV['Mat'] } {
  const mat = buildWallLayerBwMat(params)
  const width = mat.cols
  const height = mat.rows
  const data = new Uint8Array(mat.data as Uint8Array)
  return { data, width, height, mat }
}

function snapPoint(point: InkStrokePoint): InkStrokePoint {
  return { x: Math.round(point.x), y: Math.round(point.y) }
}

function stampOverlayFromStrokeCanvas(
  overlay: Uint8Array,
  width: number,
  height: number,
  code: InkOverlayCode,
  paint: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void,
): void {
  if (overlay.length !== width * height || code === INK_OVERLAY_NONE) return
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = false
  paint(ctx)
  const image = ctx.getImageData(0, 0, width, height)
  const px = image.data
  for (let i = 0, p = 0; i < overlay.length; i += 1, p += 4) {
    if ((px[p + 3] ?? 0) > 0) overlay[i] = code
  }
}

function strokePolyline(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: InkStrokePoint[],
  lineWidth: number,
): void {
  if (points.length === 0) return
  const width = Math.max(1, Math.round(lineWidth))
  const snapped = points.map(snapPoint)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(snapped[0].x, snapped[0].y)
  for (let i = 1; i < snapped.length; i += 1) {
    ctx.lineTo(snapped[i].x, snapped[i].y)
  }
  if (snapped.length === 1) {
    ctx.lineTo(snapped[0].x + 0.01, snapped[0].y)
  }
  ctx.stroke()
}

export function applyInkOverlayBrush(
  overlay: Uint8Array,
  width: number,
  height: number,
  points: InkStrokePoint[],
  radius: number,
): void {
  if (points.length === 0) return
  stampOverlayFromStrokeCanvas(overlay, width, height, INK_OVERLAY_BLACK, (ctx) => {
    strokePolyline(ctx, points, radius * 2)
  })
}

export function applyInkOverlayErase(
  overlay: Uint8Array,
  width: number,
  height: number,
  points: InkStrokePoint[],
  radius: number,
): void {
  if (points.length === 0) return
  stampOverlayFromStrokeCanvas(overlay, width, height, INK_OVERLAY_WHITE, (ctx) => {
    strokePolyline(ctx, points, radius * 2)
  })
}

export function applyInkOverlayLine(
  overlay: Uint8Array,
  width: number,
  height: number,
  start: InkStrokePoint,
  end: InkStrokePoint,
  lineWidth: number,
): void {
  stampOverlayFromStrokeCanvas(overlay, width, height, INK_OVERLAY_BLACK, (ctx) => {
    strokePolyline(ctx, [start, end], lineWidth)
  })
}

export function applyInkOverlayRect(
  overlay: Uint8Array,
  width: number,
  height: number,
  bounds: InkRectBounds,
  lineWidth: number,
): void {
  stampOverlayFromStrokeCanvas(overlay, width, height, INK_OVERLAY_BLACK, (ctx) => {
    const thickness = Math.max(1, Math.round(lineWidth))
    const x0 = Math.round(Math.min(bounds.x, bounds.x + bounds.width))
    const y0 = Math.round(Math.min(bounds.y, bounds.y + bounds.height))
    const x1 = Math.round(Math.max(bounds.x, bounds.x + bounds.width))
    const y1 = Math.round(Math.max(bounds.y, bounds.y + bounds.height))
    const w = Math.max(0, x1 - x0)
    const h = Math.max(0, y1 - y0)
    if (w < 1 && h < 1) return
    ctx.fillStyle = '#ffffff'
    if (w <= thickness * 2 || h <= thickness * 2) {
      ctx.fillRect(x0, y0, Math.max(1, w), Math.max(1, h))
      return
    }
    ctx.fillRect(x0, y0, w, thickness)
    ctx.fillRect(x0, y1 - thickness, w, thickness)
    ctx.fillRect(x0, y0, thickness, h)
    ctx.fillRect(x1 - thickness, y0, thickness, h)
  })
}

/** RLE-achtige serialisatie voor dev-session (code, count) paren. */
export function encodeInkOverlayRle(overlay: Uint8Array): number[] {
  const runs: number[] = []
  if (overlay.length === 0) return runs
  let current = overlay[0] ?? INK_OVERLAY_NONE
  let count = 1
  for (let i = 1; i < overlay.length; i += 1) {
    const value = overlay[i] ?? INK_OVERLAY_NONE
    if (value === current) {
      count += 1
      continue
    }
    runs.push(current, count)
    current = value
    count = 1
  }
  runs.push(current, count)
  return runs
}

export function decodeInkOverlayRle(runs: number[], length: number): Uint8Array {
  const out = new Uint8Array(length)
  let offset = 0
  for (let i = 0; i + 1 < runs.length && offset < length; i += 2) {
    const code = (runs[i] ?? INK_OVERLAY_NONE) as InkOverlayCode
    const count = Math.max(0, Math.round(runs[i + 1] ?? 0))
    for (let c = 0; c < count && offset < length; c += 1) {
      out[offset] = code
      offset += 1
    }
  }
  return out
}
