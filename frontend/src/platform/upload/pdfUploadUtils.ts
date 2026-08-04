/** Target longest edge for PDF rasterization (vector source → higher than PNG upload floor). */
import { tGlobal } from '@/ui/i18n'

export const DEFAULT_MIN_MAX_EDGE = 4000
/** Browser canvas safety cap (never exceed on longest edge). */
const MAX_PDF_RENDER_MAX_EDGE = 8192
export const DEFAULT_PREVIEW_MAX_EDGE = 800

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

export function computePreviewScale(
  viewportWidth: number,
  viewportHeight: number,
  maxPreviewEdge = DEFAULT_PREVIEW_MAX_EDGE,
): number {
  const maxEdge = Math.max(viewportWidth, viewportHeight, 1)
  if (maxEdge <= maxPreviewEdge) return 1
  return maxPreviewEdge / maxEdge
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
