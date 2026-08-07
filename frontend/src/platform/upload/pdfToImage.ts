import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { pdfJsDocumentOptions } from './pdfJsAssets'
import {
  DEFAULT_MIN_MAX_EDGE,
  DEFAULT_PREVIEW_MAX_EDGE,
  compositeRgbaOntoWhiteInPlace,
  computePreviewScale,
  computeRenderScale,
  type PdfRect,
} from './pdfUploadUtils'

export { formatPdfPageImageName, isPdfFile, pdfLoadErrorMessage } from './pdfUploadUtils'
export type { PdfUnderlaySource, PdfRect, RasterRect } from './pdfUploadUtils'
export {
  computeRoiRenderScale,
  pdfRoiDensityFactor,
  rasterRectToPdfRect,
  shouldReRenderPdfRoi,
  DEFAULT_MIN_MAX_EDGE,
  MAX_PDF_RENDER_MAX_EDGE,
  PDF_ROI_MAX_EDGE_RATIO,
} from './pdfUploadUtils'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

let cachedFileKey: string | null = null
let cachedPdf: PDFDocumentProxy | null = null

function fileSessionKey(file: File): string {
  return `${file.name}\0${file.size}\0${file.lastModified}`
}

async function ensurePdfForFile(file: File): Promise<PDFDocumentProxy> {
  const key = fileSessionKey(file)
  if (cachedPdf && cachedFileKey === key) {
    return cachedPdf
  }
  await closePdfSession()
  const bytes = new Uint8Array(await file.arrayBuffer())
  cachedPdf = await getDocument(pdfJsDocumentOptions(bytes)).promise
  cachedFileKey = key
  return cachedPdf
}

async function buildVisibleOptionalContentConfig(pdf: PDFDocumentProxy) {
  try {
    const config = await pdf.getOptionalContentConfig({ intent: 'any' })
    for (const [id] of config) {
      config.setVisibility(id, true)
    }
    return config
  } catch {
    return null
  }
}

export interface OpenPdfDocumentResult {
  numPages: number
  fileName: string
}

export async function openPdfDocument(file: File): Promise<OpenPdfDocumentResult> {
  const pdf = await ensurePdfForFile(file)
  return {
    numPages: pdf.numPages,
    fileName: file.name,
  }
}

export type RenderPdfPageResult = {
  blobUrl: string
  pageRenderScale: number
  pageWidthPx: number
  pageHeightPx: number
}

/**
 * PDF pages often have no page-white fill. Empty canvas pixels stay rgba(0,0,0,0);
 * UI shows them as "transparent/light blue", B/W (RGBA→gray) sees black = wall.
 * Paint white first, then flatten leftover alpha onto white after render.
 */
function fillCanvasWhite(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.globalCompositeOperation = 'source-over'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.restore()
}

function flattenCanvasAlphaOntoWhite(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const image = context.getImageData(0, 0, width, height)
  compositeRgbaOntoWhiteInPlace(image.data)
  context.putImageData(image, 0, 0)
}

async function renderPageToCanvas(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  const width = Math.max(1, Math.round(viewport.width))
  const height = Math.max(1, Math.round(viewport.height))
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Kon PDF-canvas niet maken.')
  }

  fillCanvasWhite(context, width, height)

  const optionalContentConfig = await buildVisibleOptionalContentConfig(pdf)
  const renderParams: Parameters<typeof page.render>[0] = {
    canvas,
    canvasContext: context,
    viewport,
    intent: 'any',
  }
  if (optionalContentConfig) {
    renderParams.optionalContentConfigPromise = Promise.resolve(optionalContentConfig)
  }

  await page.render(renderParams).promise
  flattenCanvasAlphaOntoWhite(context, width, height)
  return canvas
}

function canvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Kon PDF niet omzetten naar afbeelding.'))
        return
      }
      resolve(URL.createObjectURL(blob))
    }, 'image/png')
  })
}

async function renderPageToBlobUrl(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
): Promise<string> {
  const canvas = await renderPageToCanvas(pdf, pageNumber, scale)
  return canvasToBlobUrl(canvas)
}

export async function renderPdfPagePreviewForFile(
  file: File,
  pageNumber: number,
  maxPreviewEdge = DEFAULT_PREVIEW_MAX_EDGE,
): Promise<string> {
  const pdf = await ensurePdfForFile(file)
  const page = await pdf.getPage(pageNumber)
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = computePreviewScale(baseViewport.width, baseViewport.height, maxPreviewEdge)
  return renderPageToBlobUrl(pdf, pageNumber, scale)
}

export async function renderPdfPageToBlobUrlForFile(
  file: File,
  pageNumber: number,
  minMaxEdge = DEFAULT_MIN_MAX_EDGE,
): Promise<RenderPdfPageResult> {
  const pdf = await ensurePdfForFile(file)
  const page = await pdf.getPage(pageNumber)
  const baseViewport = page.getViewport({ scale: 1 })
  const pageRenderScale = computeRenderScale(baseViewport.width, baseViewport.height, minMaxEdge)
  const canvas = await renderPageToCanvas(pdf, pageNumber, pageRenderScale)
  const blobUrl = await canvasToBlobUrl(canvas)
  return {
    blobUrl,
    pageRenderScale,
    pageWidthPx: canvas.width,
    pageHeightPx: canvas.height,
  }
}

/**
 * Re-raster a PDF page crop at `scale` (PDF user units × scale → pixels).
 * Canvas is sized to the ROI; full-page content is translated so the crop is at (0,0).
 */
export async function renderPdfPageRoiToCanvas(params: {
  bytes: Uint8Array
  pageNumber: number
  pdfRect: PdfRect
  scale: number
}): Promise<HTMLCanvasElement> {
  const { bytes, pageNumber, pdfRect, scale } = params
  const pdf = await getDocument(pdfJsDocumentOptions(bytes)).promise
  try {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale })
    const width = Math.max(1, Math.round(pdfRect.width * scale))
    const height = Math.max(1, Math.round(pdfRect.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Kon PDF-ROI-canvas niet maken.')
    }

    // White in canvas space (before ROI translate) so empty PDF areas stay opaque.
    fillCanvasWhite(context, width, height)

    context.save()
    context.translate(-pdfRect.x * scale, -pdfRect.y * scale)

    const optionalContentConfig = await buildVisibleOptionalContentConfig(pdf)
    const renderParams: Parameters<typeof page.render>[0] = {
      canvas,
      canvasContext: context,
      viewport,
      intent: 'any',
    }
    if (optionalContentConfig) {
      renderParams.optionalContentConfigPromise = Promise.resolve(optionalContentConfig)
    }

    await page.render(renderParams).promise
    context.restore()
    flattenCanvasAlphaOntoWhite(context, width, height)
    return canvas
  } finally {
    await pdf.cleanup()
  }
}

export async function closePdfSession(): Promise<void> {
  if (!cachedPdf) return
  await cachedPdf.cleanup()
  cachedPdf = null
  cachedFileKey = null
}
