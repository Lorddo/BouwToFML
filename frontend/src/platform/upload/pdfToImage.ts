import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { pdfJsDocumentOptions } from './pdfJsAssets'
import {
  DEFAULT_MIN_MAX_EDGE,
  DEFAULT_PREVIEW_MAX_EDGE,
  computePreviewScale,
  computeRenderScale,
} from './pdfUploadUtils'

export { formatPdfPageImageName, isPdfFile, pdfLoadErrorMessage } from './pdfUploadUtils'

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

async function renderPageToBlobUrl(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
): Promise<string> {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(viewport.width))
  canvas.height = Math.max(1, Math.round(viewport.height))
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Kon PDF-canvas niet maken.')
  }

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
): Promise<string> {
  const pdf = await ensurePdfForFile(file)
  const page = await pdf.getPage(pageNumber)
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = computeRenderScale(baseViewport.width, baseViewport.height, minMaxEdge)
  return renderPageToBlobUrl(pdf, pageNumber, scale)
}

export async function closePdfSession(): Promise<void> {
  if (!cachedPdf) return
  await cachedPdf.cleanup()
  cachedPdf = null
  cachedFileKey = null
}
