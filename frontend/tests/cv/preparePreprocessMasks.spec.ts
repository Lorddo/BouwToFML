import { describe, expect, it } from 'vitest'
import { preparePreprocessMasks } from '@/cv/tools/preparePreprocessMasks'

describe('preparePreprocessMasks', () => {
  it('sluit ocrMask uit van previews (includeOcrMask false)', () => {
    const eraserMask = new Uint8Array([1, 0])
    const ocrMask = new Uint8Array([0, 1])

    const preview = preparePreprocessMasks({
      eraserMask,
      ocrMask,
      includeOcrMask: false,
      srcWidth: 2,
      srcHeight: 1,
      dstWidth: 2,
      dstHeight: 1,
    })

    expect(preview.eraserMask).toEqual(eraserMask)
  })

  it('voegt ocrMask samen met eraser voor detectie', () => {
    const eraserMask = new Uint8Array([1, 0])
    const ocrMask = new Uint8Array([0, 1])

    const geometry = preparePreprocessMasks({
      eraserMask,
      ocrMask,
      includeOcrMask: true,
      srcWidth: 2,
      srcHeight: 1,
      dstWidth: 2,
      dstHeight: 1,
    })

    expect(geometry.eraserMask).toEqual(new Uint8Array([1, 255]))
  })
})
