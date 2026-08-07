/** Target longest edge for PDF rasterization (vector source → higher than PNG upload floor). */
import { tGlobal } from '@/ui/i18n'

export const DEFAULT_MIN_MAX_EDGE = 4000
/** Browser canvas safety cap (never exceed on longest edge). */
export const MAX_PDF_RENDER_MAX_EDGE = 8192
export const DEFAULT_PREVIEW_MAX_EDGE = 800

/** Crop is "meaningful" when content max-edge is below this fraction of the full-page raster. */
export const PDF_ROI_MAX_EDGE_RATIO = 0.9

/** In-memory PDF source for ROI re-render at input commit (not IndexedDB). */
export type PdfUnderlaySource = {
  bytes: Uint8Array
  pageNumber: number
  fileName: string
  /** Scale used for the full-page workspace raster. */
  pageRenderScale: number
  pageWidthPx: number
  pageHeightPx: number
}

export type PdfRect = {
  x: number
  y: number
  width: number
  height: number
}

export type RasterRect = {
  left: number
  top: number
  width: number
  height: number
}

export function isPdfFile(file: File): boolean {
  if (file.type === 'application/pdf') return true
  return file.name.toLowerCase().endsWith('.pdf')
}

/**
 * PDF render scale — same idea as PNG `buildOptimizationBase`:
 * keep native when already at/above target; upscale smaller pages only.
 * Very large page sizes are capped for canvas limits.
 */
export function computeRenderScale(
  viewportWidth: number,
  viewportHeight: number,
  targetMaxEdge = DEFAULT_MIN_MAX_EDGE,
  maxRenderMaxEdge = MAX_PDF_RENDER_MAX_EDGE,
): number {
  const maxEdge = Math.max(viewportWidth, viewportHeight, 1)
  const scale = maxEdge >= targetMaxEdge ? 1 : targetMaxEdge / maxEdge
  const renderedMax = maxEdge * scale
  if (renderedMax > maxRenderMaxEdge) {
    return maxRenderMaxEdge / maxEdge
  }
  return scale
}

/** ROI scale from PDF-point size of the crop (same policy as full-page). */
export function computeRoiRenderScale(
  roiPdfWidth: number,
  roiPdfHeight: number,
  targetMaxEdge = DEFAULT_MIN_MAX_EDGE,
  maxRenderMaxEdge = MAX_PDF_RENDER_MAX_EDGE,
): number {
  return computeRenderScale(roiPdfWidth, roiPdfHeight, targetMaxEdge, maxRenderMaxEdge)
}

export function computePreviewScale(
  viewportWidth: number,
  viewportHeight: number,
  maxPreviewEdge = DEFAULT_PREVIEW_MAX_EDGE,
): number {
  const maxEdge = Math.max(viewportWidth, viewportHeight, 1)
  if (maxEdge <= maxPreviewEdge) return 1
  return maxPreviewEdge / maxEdge
}

/** Map a raster AABB (full-page PNG space) back to PDF user-space units. */
export function rasterRectToPdfRect(rect: RasterRect, pageRenderScale: number): PdfRect {
  const scale = Math.max(pageRenderScale, 1e-9)
  return {
    x: rect.left / scale,
    y: rect.top / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  }
}

/** px/mm multiplier when replacing full-page raster with ROI at `roiScale`. */
export function pdfRoiDensityFactor(roiScale: number, pageRenderScale: number): number {
  const base = Math.max(pageRenderScale, 1e-9)
  return roiScale / base
}

/**
 * In-place: composite RGBA onto white and force opaque.
 * Transparent PDF leftovers are otherwise rgb(0,0,0) → B/W wall ink.
 */
export function compositeRgbaOntoWhiteInPlace(data: Uint8ClampedArray | Uint8Array): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a >= 255) continue
    if (a <= 0) {
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = 255
      continue
    }
    const alpha = a / 255
    const inv = 1 - alpha
    data[i] = Math.round(data[i] * alpha + 255 * inv)
    data[i + 1] = Math.round(data[i + 1] * alpha + 255 * inv)
    data[i + 2] = Math.round(data[i + 2] * alpha + 255 * inv)
    data[i + 3] = 255
  }
}

export function shouldReRenderPdfRoi(
  bounds: RasterRect,
  pageWidthPx: number,
  pageHeightPx: number,
  maxEdgeRatio = PDF_ROI_MAX_EDGE_RATIO,
): boolean {
  const pageMax = Math.max(pageWidthPx, pageHeightPx, 1)
  const contentMax = Math.max(bounds.width, bounds.height, 1)
  if (contentMax >= pageMax * maxEdgeRatio) return false
  if (bounds.width >= pageWidthPx * maxEdgeRatio && bounds.height >= pageHeightPx * maxEdgeRatio) {
    return false
  }
  return true
}

export function formatPdfPageImageName(
  fileName: string,
  pageNumber: number,
  numPages: number,
): string {
  if (numPages <= 1) return fileName
  return tGlobal('input.pdf.pageImageName', { fileName, pageNumber })
}

export function pdfLoadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/password/i.test(message)) {
    return tGlobal('input.pdf.passwordProtected')
  }
  if (import.meta.env.DEV && message) {
    return tGlobal('input.pdf.loadFailedWithMessage', { message })
  }
  return tGlobal('input.pdf.loadFailed')
}
