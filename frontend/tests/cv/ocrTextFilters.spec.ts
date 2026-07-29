import { describe, expect, it } from 'vitest'
import {
  filterAndMergeOcrHits,
  isLineLikeArchitecturalBBox,
  looksLikeTextToken,
  mergeAdjacentWordHits,
  resolveOverlappingHits,
  type OcrWordHit,
} from '@/cv/port/ocrTextFilters'

function hit(
  partial: Partial<OcrWordHit> &
    Pick<OcrWordHit, 'text' | 'x' | 'y' | 'width' | 'height' | 'confidence'>,
): OcrWordHit {
  return {
    pass: 'horizontal',
    ...partial,
  }
}

describe('isLineLikeArchitecturalBBox', () => {
  it('rejects long thin wall-like boxes', () => {
    expect(isLineLikeArchitecturalBBox(180, 12)).toBe(true)
    expect(isLineLikeArchitecturalBBox(12, 200)).toBe(true)
  })

  it('accepts compact room labels', () => {
    expect(isLineLikeArchitecturalBBox(120, 40)).toBe(false)
    expect(isLineLikeArchitecturalBBox(44, 41)).toBe(false)
  })
})

describe('looksLikeTextToken', () => {
  it('rejects horizontal m misread as 3 from vertical pass', () => {
    const misread = hit({
      text: '3',
      x: 539,
      y: 688,
      width: 44,
      height: 41,
      confidence: 89,
      pass: 'vertical',
    })
    expect(looksLikeTextToken(misread, 'general', 'vertical', 85)).toBe(false)
  })

  it('accepts vertical room label on tall bbox', () => {
    const keuken = hit({
      text: 'keuken',
      x: 100,
      y: 200,
      width: 28,
      height: 110,
      confidence: 88,
      pass: 'vertical',
    })
    expect(looksLikeTextToken(keuken, 'general', 'vertical', 85)).toBe(true)
  })

  it('accepts letter fragments when confidence floor is lowered', () => {
    const letter = hit({
      text: 'o',
      x: 520,
      y: 680,
      width: 18,
      height: 38,
      confidence: 58,
      pass: 'horizontal',
    })
    expect(looksLikeTextToken(letter, 'general', 'horizontal', 85)).toBe(false)
    expect(looksLikeTextToken(letter, 'general', 'horizontal', 40)).toBe(true)
  })

  it('rejects tiny low-confidence noise', () => {
    const noise = hit({
      text: 'dl',
      x: 1303,
      y: 1619,
      width: 33,
      height: 12,
      confidence: 24,
      pass: 'horizontal',
    })
    expect(looksLikeTextToken(noise, 'general', 'horizontal', 40)).toBe(false)
  })

  it('rejects wall-line artifact characters', () => {
    const artifact = hit({
      text: 'III',
      x: 0,
      y: 0,
      width: 120,
      height: 14,
      confidence: 95,
      pass: 'horizontal',
    })
    expect(looksLikeTextToken(artifact, 'general', 'horizontal', 85)).toBe(false)
  })
})

describe('resolveOverlappingHits', () => {
  it('prefers longer horizontal word over vertical single digit', () => {
    const horizontal = hit({
      text: 'WC',
      x: 1280,
      y: 1735,
      width: 90,
      height: 49,
      confidence: 94,
      pass: 'horizontal',
    })
    const verticalDigit = hit({
      text: '3',
      x: 1285,
      y: 1740,
      width: 40,
      height: 38,
      confidence: 91,
      pass: 'vertical',
    })
    const resolved = resolveOverlappingHits([verticalDigit, horizontal])
    expect(resolved.some((w) => w.text === 'WC')).toBe(true)
    expect(resolved.some((w) => w.text === '3')).toBe(false)
  })
})

describe('mergeAdjacentWordHits', () => {
  it('merges fragmented horizontal letters into one region', () => {
    const parts: OcrWordHit[] = [
      hit({
        text: 'Woo',
        x: 500,
        y: 680,
        width: 55,
        height: 40,
        confidence: 86,
        pass: 'horizontal',
      }),
      hit({
        text: 'nk',
        x: 560,
        y: 682,
        width: 38,
        height: 38,
        confidence: 85,
        pass: 'horizontal',
      }),
      hit({
        text: 'amer',
        x: 602,
        y: 681,
        width: 72,
        height: 39,
        confidence: 87,
        pass: 'horizontal',
      }),
    ]
    const merged = mergeAdjacentWordHits(parts)
    expect(merged).toHaveLength(1)
    expect(merged[0].text).toContain('Woo')
    expect(merged[0].width).toBeGreaterThan(150)
  })
})

describe('filterAndMergeOcrHits', () => {
  it('keeps real labels and drops architectural false positives at same confidence', () => {
    const words: OcrWordHit[] = [
      hit({ text: 'WC', x: 10, y: 10, width: 50, height: 30, confidence: 90, pass: 'horizontal' }),
      hit({
        text: 'II',
        x: 20,
        y: 200,
        width: 160,
        height: 14,
        confidence: 90,
        pass: 'horizontal',
      }),
      hit({
        text: '3',
        x: 539,
        y: 688,
        width: 44,
        height: 41,
        confidence: 89,
        pass: 'vertical',
      }),
    ]
    const out = filterAndMergeOcrHits(words, { minConfidence: 85, mode: 'general' })
    expect(out.map((w) => w.text)).toEqual(['WC'])
  })

  it('merges fragments before overlap resolution', () => {
    const words: OcrWordHit[] = [
      hit({
        text: 'Woo',
        x: 500,
        y: 680,
        width: 55,
        height: 40,
        confidence: 86,
        pass: 'horizontal',
      }),
      hit({
        text: 'nkamer',
        x: 560,
        y: 681,
        width: 110,
        height: 39,
        confidence: 84,
        pass: 'horizontal',
      }),
      hit({
        text: '3',
        x: 520,
        y: 685,
        width: 30,
        height: 30,
        confidence: 88,
        pass: 'vertical',
      }),
    ]
    const out = filterAndMergeOcrHits(words, { minConfidence: 80, mode: 'general' })
    expect(out.some((w) => w.text.toLowerCase().includes('woo'))).toBe(true)
    expect(out.some((w) => w.text === '3')).toBe(false)
  })
})
