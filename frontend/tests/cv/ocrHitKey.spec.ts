import { describe, expect, it } from 'vitest'
import { ocrHitKey } from '@/cv/port/ocrHitKey'

describe('ocrHitKey', () => {
  it('is stabiel voor dezelfde bbox en tekst', () => {
    const a = { text: 'Keuken', x: 10.2, y: 20.4, width: 40.1, height: 12.4 }
    const b = { text: 'Keuken', x: 10.4, y: 20.4, width: 40.1, height: 12.4 }
    expect(ocrHitKey(a)).toBe(ocrHitKey(b))
  })

  it('onderscheidt verschillende woorden op dezelfde plek', () => {
    const base = { x: 10, y: 20, width: 40, height: 12 }
    expect(ocrHitKey({ ...base, text: 'A' })).not.toBe(ocrHitKey({ ...base, text: 'B' }))
  })
})
