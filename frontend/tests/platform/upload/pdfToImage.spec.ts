import { describe, expect, it } from 'vitest'
import {
  computePreviewScale,
  computeRenderScale,
  formatPdfPageImageName,
  isPdfFile,
} from '@/platform/upload/pdfUploadUtils'

describe('computeRenderScale', () => {
  it('keeps scale 1 when page already meets target max-edge', () => {
    expect(computeRenderScale(4000, 3000, 4000)).toBe(1)
    expect(computeRenderScale(5000, 3500, 4000)).toBe(1)
  })

  it('scales up small pages to reach target max-edge', () => {
    expect(computeRenderScale(1000, 800, 4000)).toBe(4)
    expect(computeRenderScale(500, 400, 4000)).toBe(8)
  })

  it('caps extremely large pages for canvas safety', () => {
    expect(computeRenderScale(12000, 8000, 4000, 8192)).toBeCloseTo(8192 / 12000)
  })

  it('handles zero-sized viewports safely', () => {
    expect(computeRenderScale(0, 0, 4000)).toBe(4000)
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
    expect(formatPdfPageImageName('plattegrond.pdf', 3, 12)).toBe('plattegrond.pdf (pagina 3)')
  })
})
