import { afterEach, describe, expect, it } from 'vitest'
import {
  getProjectPdfStore,
  pdfStoreMatchesRaster,
  setProjectPdfStore,
} from '@/platform/upload/project-pdf-store'

afterEach(() => {
  setProjectPdfStore(null)
})

describe('project-pdf-store', () => {
  it('houdt bytes vast tot een nieuwe upload', () => {
    setProjectPdfStore({
      bytes: new Uint8Array([1, 2]),
      pageNumber: 2,
      fileName: 'plan.pdf',
      pageRenderScale: 1.5,
      pageWidthPx: 3000,
      pageHeightPx: 2000,
    })
    expect(getProjectPdfStore()?.pageNumber).toBe(2)
    expect(pdfStoreMatchesRaster(3000, 2000)?.fileName).toBe('plan.pdf')
    expect(pdfStoreMatchesRaster(1200, 800)).toBeNull()
  })

  it('negeert een lege bron', () => {
    setProjectPdfStore({
      bytes: new Uint8Array(),
      pageNumber: 1,
      fileName: 'empty.pdf',
      pageRenderScale: 1,
      pageWidthPx: 1,
      pageHeightPx: 1,
    })
    expect(getProjectPdfStore()).toBeNull()
  })

  it('bewaart een eigen kopie zodat pdf.js de store niet leegt', () => {
    const bytes = new Uint8Array([1, 2, 3])
    setProjectPdfStore({
      bytes,
      pageNumber: 1,
      fileName: 'plan.pdf',
      pageRenderScale: 1,
      pageWidthPx: 3000,
      pageHeightPx: 2000,
    })
    bytes.fill(0)
    expect([...getProjectPdfStore()!.bytes]).toEqual([1, 2, 3])
  })
})
