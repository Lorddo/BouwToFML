import { describe, expect, it } from 'vitest'
import { copyPdfBytes, pdfJsDocumentOptions } from '@/platform/upload/pdfJsAssets'
import {
  compositeRgbaOntoWhiteInPlace,
  computePreviewScale,
  computeRenderScale,
  computeRoiRenderScale,
  formatPdfPageImageName,
  isPdfFile,
  pdfRoiDensityFactor,
  rasterRectToPdfRect,
  shouldReRenderPdfRoi,
} from '@/platform/upload/pdfUploadUtils'

describe('computeRenderScale', () => {
  it('keeps scale 1 when page already meets target max-edge', () => {
    expect(computeRenderScale(3000, 2000, 3000)).toBe(1)
    expect(computeRenderScale(4000, 3000, 4000)).toBe(1)
  })

  it('scales up small pages to reach target max-edge', () => {
    expect(computeRenderScale(1000, 800, 3000)).toBe(3)
    expect(computeRenderScale(500, 400, 4000)).toBe(8)
  })

  it('downscales large pages to werk-max-edge (vloer+plafond)', () => {
    expect(computeRenderScale(4000, 3444, 3000)).toBeCloseTo(3000 / 4000)
    expect(computeRenderScale(5000, 3500, 3000)).toBeCloseTo(3000 / 5000)
  })

  it('caps extremely large pages for canvas safety', () => {
    expect(computeRenderScale(12000, 8000, 3000, 8192)).toBeCloseTo(3000 / 12000)
    expect(computeRenderScale(12000, 8000, 9000, 8192)).toBeCloseTo(8192 / 12000)
  })

  it('handles zero-sized viewports safely', () => {
    expect(computeRenderScale(0, 0, 3000)).toBe(3000)
  })
})

describe('computeRoiRenderScale', () => {
  it('matches full-page policy on ROI pdf-point size', () => {
    expect(computeRoiRenderScale(1000, 800, 3000)).toBe(3)
    expect(computeRoiRenderScale(5000, 3000, 3000)).toBeCloseTo(3000 / 5000)
  })
})

describe('rasterRectToPdfRect', () => {
  it('divides raster AABB by page render scale', () => {
    expect(rasterRectToPdfRect({ left: 200, top: 100, width: 400, height: 300 }, 2)).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 150,
    })
  })
})

describe('pdfRoiDensityFactor', () => {
  it('is roiScale / pageRenderScale', () => {
    expect(pdfRoiDensityFactor(4, 1)).toBe(4)
    expect(pdfRoiDensityFactor(2, 2)).toBe(1)
  })
})

describe('compositeRgbaOntoWhiteInPlace', () => {
  it('turns fully transparent black into opaque white', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 0])
    compositeRgbaOntoWhiteInPlace(data)
    expect([...data]).toEqual([255, 255, 255, 255])
  })

  it('composites partial alpha onto white', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 128])
    compositeRgbaOntoWhiteInPlace(data)
    // 0*(128/255) + 255*(127/255) → 127
    expect(data[0]).toBe(127)
    expect(data[1]).toBe(127)
    expect(data[2]).toBe(127)
    expect(data[3]).toBe(255)
  })

  it('leaves opaque pixels unchanged', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255])
    compositeRgbaOntoWhiteInPlace(data)
    expect([...data]).toEqual([10, 20, 30, 255])
  })
})

describe('shouldReRenderPdfRoi', () => {
  it('skips when content still covers most of the page', () => {
    expect(shouldReRenderPdfRoi({ left: 0, top: 0, width: 3800, height: 2800 }, 4000, 3000)).toBe(
      false,
    )
  })

  it('triggers for a small apartment crop on a full sheet', () => {
    expect(shouldReRenderPdfRoi({ left: 100, top: 200, width: 900, height: 700 }, 4000, 3000)).toBe(
      true,
    )
  })

  it('triggers for a full-width floor strip (max-edge still equals the page)', () => {
    expect(shouldReRenderPdfRoi({ left: 0, top: 400, width: 4000, height: 800 }, 4000, 3000)).toBe(
      true,
    )
  })
})

describe('computePreviewScale', () => {
  it('keeps scale 1 when page already fits preview edge', () => {
    expect(computePreviewScale(600, 400, 800)).toBe(1)
  })

  it('downscales large pages for preview', () => {
    expect(computePreviewScale(4000, 2000, 800)).toBe(0.2)
  })
})

describe('isPdfFile', () => {
  it('detects application/pdf mime type', () => {
    expect(isPdfFile(new File(['x'], 'drawing.pdf', { type: 'application/pdf' }))).toBe(true)
  })

  it('detects .pdf extension when mime is empty', () => {
    expect(isPdfFile(new File(['x'], 'drawing.pdf', { type: '' }))).toBe(true)
  })

  it('rejects non-pdf files', () => {
    expect(isPdfFile(new File(['x'], 'drawing.png', { type: 'image/png' }))).toBe(false)
  })
})

describe('formatPdfPageImageName', () => {
  it('keeps original name for single-page pdf', () => {
    expect(formatPdfPageImageName('plattegrond.pdf', 1, 1)).toBe('plattegrond.pdf')
  })

  it('appends page number for multi-page pdf', () => {
    expect(formatPdfPageImageName('plattegrond.pdf', 3, 12)).toBe('plattegrond.pdf (page 3)')
  })
})

describe('pdfJsDocumentOptions', () => {
  it('geeft pdf.js een kopie zodat de store-buffer blijft staan', () => {
    const bytes = new Uint8Array([10, 20, 30])
    const options = pdfJsDocumentOptions(bytes)
    expect(options.data).not.toBe(bytes)
    expect(options.data.buffer).not.toBe(bytes.buffer)
    options.data.fill(0)
    expect([...bytes]).toEqual([10, 20, 30])
    expect([...copyPdfBytes(bytes)]).toEqual([10, 20, 30])
  })
})
