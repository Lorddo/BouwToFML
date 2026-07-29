import { describe, expect, it } from 'vitest'
import {
  getTesseractWorkerOptions,
  OCR_DEFAULT_LANGUAGE,
  resolveOcrLanguage,
} from '@/cv/port/ocrWorker'

describe('ocrWorker', () => {
  it('resolveOcrLanguage valt terug op eng+nld', () => {
    expect(resolveOcrLanguage(undefined)).toBe(OCR_DEFAULT_LANGUAGE)
    expect(resolveOcrLanguage('  ')).toBe(OCR_DEFAULT_LANGUAGE)
    expect(resolveOcrLanguage('nld')).toBe('nld')
  })

  it('getTesseractWorkerOptions wijst naar same-origin assets', () => {
    const opts = getTesseractWorkerOptions()
    expect(opts.workerPath).toBe('/tesseract/worker.min.js')
    expect(opts.corePath).toBe('/tesseract/core')
    expect(opts.langPath).toBe('/tesseract/lang')
    expect(opts.workerBlobURL).toBe(false)
    expect(opts.gzip).toBe(true)
  })
})
