import { describe, expect, it } from 'vitest'
import type { OcrTextOverlay } from '@/platform/canvas'
import { findOcrOverlayAt } from '@/platform/canvas/ocrOverlayHitTest'

function overlay(partial: Partial<OcrTextOverlay> & Pick<OcrTextOverlay, 'x' | 'y' | 'width' | 'height'>): OcrTextOverlay {
  return {
    text: 'test',
    confidence: 90,
    key: 'k',
    ...partial,
  }
}

describe('findOcrOverlayAt', () => {
  it('vindt overlay onder pointer', () => {
    const hits = [overlay({ x: 10, y: 20, width: 40, height: 12, key: 'a' })]
    expect(findOcrOverlayAt({ x: 25, y: 25 }, hits)?.key).toBe('a')
  })

  it('kiest bovenste bij overlap', () => {
    const hits = [
      overlay({ x: 10, y: 20, width: 40, height: 12, key: 'first' }),
      overlay({ x: 12, y: 22, width: 40, height: 12, key: 'second' }),
    ]
    expect(findOcrOverlayAt({ x: 25, y: 25 }, hits)?.key).toBe('second')
  })

  it('retourneert null buiten bbox', () => {
    const hits = [overlay({ x: 10, y: 20, width: 40, height: 12 })]
    expect(findOcrOverlayAt({ x: 0, y: 0 }, hits)).toBeNull()
  })
})
