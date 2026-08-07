import { bakeMaskIntoCanvas } from '@/cv/tools/maskImage'
import { cropAndScaleMask, maskHasInk } from '@/cv/tools/polygon'
import {
  computeRoiRenderScale,
  pdfRoiDensityFactor,
  rasterRectToPdfRect,
  renderPdfPageRoiToCanvas,
  shouldReRenderPdfRoi,
  type PdfUnderlaySource,
  type RasterRect,
} from '@/platform/upload'

export type PdfRoiCommitResult = {
  canvas: HTMLCanvasElement
  /** Raster AABB in full-page source space used for the ROI. */
  bounds: RasterRect
  /** px/mm multiplier vs the full-page workspace raster. */
  densityFactor: number
  roiScale: number
}

/**
 * Re-raster PDF crop at high DPI and re-apply eraser within the AABB.
 * Returns null when ROI is not warranted or render fails (caller uses legacy path).
 */
export async function tryBuildPdfRoiCanvas(params: {
  pdfSource: PdfUnderlaySource
  bounds: RasterRect
  sourceWidth: number
  sourceHeight: number
  eraserMask: Uint8Array | null
}): Promise<PdfRoiCommitResult | null> {
  const { pdfSource, bounds, sourceWidth, sourceHeight, eraserMask } = params
  if (!shouldReRenderPdfRoi(bounds, sourceWidth, sourceHeight)) {
    return null
  }

  const pdfRect = rasterRectToPdfRect(bounds, pdfSource.pageRenderScale)
  if (!(pdfRect.width > 0) || !(pdfRect.height > 0)) return null

  const roiScale = computeRoiRenderScale(pdfRect.width, pdfRect.height)
  const densityFactor = pdfRoiDensityFactor(roiScale, pdfSource.pageRenderScale)
  if (!(densityFactor > 1.01)) {
    // No quality gain vs full-page raster density.
    return null
  }

  let canvas = await renderPdfPageRoiToCanvas({
    bytes: pdfSource.bytes,
    pageNumber: pdfSource.pageNumber,
    pdfRect,
    scale: roiScale,
  })

  if (eraserMask && eraserMask.length === sourceWidth * sourceHeight && maskHasInk(eraserMask)) {
    const roiMask = cropAndScaleMask(
      eraserMask,
      sourceWidth,
      sourceHeight,
      bounds,
      canvas.width,
      canvas.height,
    )
    canvas = bakeMaskIntoCanvas(canvas, roiMask)
  }

  return { canvas, bounds, densityFactor, roiScale }
}
