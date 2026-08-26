import { copyPdfBytes } from './pdfJsAssets'
import type { PdfUnderlaySource } from './pdfUploadUtils'

function pdfBytesUsable(bytes: Uint8Array): boolean {
  try {
    return bytes.byteLength > 0
  } catch {
    return false
  }
}

/** Survives Vue floor-switch / persist; only replace on a new file upload. */
let stored: PdfUnderlaySource | null = null

export function clonePdfUnderlaySource(source: PdfUnderlaySource): PdfUnderlaySource | null {
  if (!pdfBytesUsable(source.bytes)) return null
  return {
    ...source,
    bytes: copyPdfBytes(source.bytes),
  }
}

export function setProjectPdfStore(source: PdfUnderlaySource | null): void {
  stored = source ? clonePdfUnderlaySource(source) : null
}

export function getProjectPdfStore(): PdfUnderlaySource | null {
  if (!stored || !pdfBytesUsable(stored.bytes)) return null
  return stored
}

export function pdfStoreMatchesRaster(width: number, height: number): PdfUnderlaySource | null {
  const current = getProjectPdfStore()
  if (!current) return null
  if (Math.abs(current.pageWidthPx - width) > 2) return null
  if (Math.abs(current.pageHeightPx - height) > 2) return null
  return current
}
