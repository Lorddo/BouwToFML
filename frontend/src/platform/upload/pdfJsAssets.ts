/** Same-origin base URL for pdf.js cmaps, fonts and wasm (required with COEP + CAD PDFs). */
function pdfJsAssetBase(): string {
  const base = import.meta.env.BASE_URL ?? '/'
  return `${base}pdfjs-dist/`
}

export function pdfJsDocumentOptions(data: Uint8Array) {
  const assetBase = pdfJsAssetBase()
  return {
    data,
    cMapUrl: `${assetBase}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetBase}standard_fonts/`,
    wasmUrl: `${assetBase}wasm/`,
    useWasm: true,
  }
}
