import type { PdfUnderlaySource } from '@/platform/upload'

/** Persisted PDF page identity (no bytes). */
export type PdfUnderlayMeta = {
  pageNumber: number
  fileName: string
  pageRenderScale: number
  pageWidthPx: number
  pageHeightPx: number
}

export function pdfMetaFromSource(source: PdfUnderlaySource): PdfUnderlayMeta {
  return {
    pageNumber: source.pageNumber,
    fileName: source.fileName,
    pageRenderScale: source.pageRenderScale,
    pageWidthPx: source.pageWidthPx,
    pageHeightPx: source.pageHeightPx,
  }
}

function pdfBytesUsable(source?: PdfUnderlaySource | null): source is PdfUnderlaySource {
  if (!source) return false
  try {
    return source.bytes.byteLength > 0
  } catch {
    return false
  }
}

export function resolveReusePdfBytes(params: {
  sessionPdf?: PdfUnderlaySource | null
  donorPdf?: PdfUnderlaySource | null
  projectPdf?: PdfUnderlaySource | null
}): PdfUnderlaySource | null {
  if (pdfBytesUsable(params.sessionPdf)) return params.sessionPdf
  if (pdfBytesUsable(params.donorPdf)) return params.donorPdf
  if (pdfBytesUsable(params.projectPdf)) return params.projectPdf
  return null
}
