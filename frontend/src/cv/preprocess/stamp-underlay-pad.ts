/**
 * Wit-pad wanneer een muurstempel buiten de huidige onderlegger valt.
 * Alleen overflow-zijden groeien; bestaande scan-pixels blijven op hun plek + offset.
 */
import { imagePxToScantCm } from '@/core/fml/stamp-nulpunt'
import type { Point2D } from '@/core/fml/types'
import type { StampBounds } from '@/cv/preprocess/wall-stamp-raster'

export type CanvasPad = { left: number; top: number; right: number; bottom: number }

/** Extra wit naast de stempel-bbox (niet flush tegen de canvasrand). */
export const STAMP_UNDERLAY_PAD_MARGIN_PX = 48

/** Hard cap op langste zijde na pad — voorkomt per ongeluk enorme canvassen. */
export const STAMP_UNDERLAY_MAX_EDGE_PX = 12000

export function emptyCanvasPad(): CanvasPad {
  return { left: 0, top: 0, right: 0, bottom: 0 }
}

export function canvasPadIsEmpty(pad: CanvasPad): boolean {
  return pad.left === 0 && pad.top === 0 && pad.right === 0 && pad.bottom === 0
}

export function computeStampOverflowPad(
  bounds: StampBounds,
  imageWidth: number,
  imageHeight: number,
  marginPx = STAMP_UNDERLAY_PAD_MARGIN_PX,
): CanvasPad {
  if (!(imageWidth > 0) || !(imageHeight > 0)) return emptyCanvasPad()
  if (!(bounds.width > 0) || !(bounds.height > 0)) return emptyCanvasPad()
  const margin = Math.max(0, Math.round(marginPx))
  const left = Math.max(0, Math.ceil(-bounds.x))
  const top = Math.max(0, Math.ceil(-bounds.y))
  const right = Math.max(0, Math.ceil(bounds.x + bounds.width - imageWidth))
  const bottom = Math.max(0, Math.ceil(bounds.y + bounds.height - imageHeight))
  return {
    left: left > 0 ? left + margin : 0,
    top: top > 0 ? top + margin : 0,
    right: right > 0 ? right + margin : 0,
    bottom: bottom > 0 ? bottom + margin : 0,
  }
}

export function paddedCanvasSize(
  width: number,
  height: number,
  pad: CanvasPad,
): { width: number; height: number } {
  return {
    width: Math.max(1, width + pad.left + pad.right),
    height: Math.max(1, height + pad.top + pad.bottom),
  }
}

export function paddedSizeExceedsMax(
  width: number,
  height: number,
  pad: CanvasPad,
  maxEdge = STAMP_UNDERLAY_MAX_EDGE_PX,
): boolean {
  const next = paddedCanvasSize(width, height, pad)
  return Math.max(next.width, next.height) > maxEdge
}

export function translateStampBounds(bounds: StampBounds, pad: CanvasPad): StampBounds {
  return {
    x: bounds.x + pad.left,
    y: bounds.y + pad.top,
    width: bounds.width,
    height: bounds.height,
  }
}

export function translateNulpuntImageCm(
  nulpunt: Point2D,
  pad: CanvasPad,
  pxPerMmX: number,
  pxPerMmY: number,
): Point2D {
  const delta = imagePxToScantCm({ x: pad.left, y: pad.top }, pxPerMmX, pxPerMmY)
  return { x: nulpunt.x + delta.x, y: nulpunt.y + delta.y }
}

/** Kopieer een 1-kanaals vlak naar een groter canvas; nieuwe pixels = `fill`. */
export function padUint8Plane(
  src: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  pad: CanvasPad,
  fill = 0,
): Uint8Array {
  const { width, height } = paddedCanvasSize(srcWidth, srcHeight, pad)
  const out = new Uint8Array(width * height)
  if (fill !== 0) out.fill(fill)
  if (src.length !== srcWidth * srcHeight || srcWidth <= 0 || srcHeight <= 0) return out
  for (let y = 0; y < srcHeight; y += 1) {
    const srcRow = y * srcWidth
    const dstRow = (y + pad.top) * width + pad.left
    out.set(src.subarray(srcRow, srcRow + srcWidth), dstRow)
  }
  return out
}

export function padPlaneIfSized(
  src: Uint8Array | null | undefined,
  srcWidth: number,
  srcHeight: number,
  pad: CanvasPad,
  fill: number,
): Uint8Array | null {
  if (!src || src.length !== srcWidth * srcHeight) return src ?? null
  return padUint8Plane(src, srcWidth, srcHeight, pad, fill)
}

export function padHtmlCanvasWhite(
  source: HTMLCanvasElement | HTMLImageElement,
  pad: CanvasPad,
): HTMLCanvasElement {
  const srcW = source instanceof HTMLCanvasElement ? source.width : Math.max(0, source.naturalWidth)
  const srcH =
    source instanceof HTMLCanvasElement ? source.height : Math.max(0, source.naturalHeight)
  const { width, height } = paddedCanvasSize(srcW, srcH, pad)
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')
  if (!ctx) return out
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  if (srcW > 0 && srcH > 0) {
    ctx.drawImage(source, pad.left, pad.top)
  }
  return out
}
