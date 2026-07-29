import { describe, expect, it } from 'vitest'
import { decodeMaskRle, encodeMaskRle } from '@/cv/util/binary-mask-rle'

describe('binary-mask-rle', () => {
  it('doet een roundtrip zonder pixelverlies', () => {
    const width = 6
    const height = 3
    const data = new Uint8Array([
      0, 0, 255, 255, 255, 0, 255, 255, 0, 0, 0, 0, 0, 255, 0, 255, 0, 255,
    ])
    const encoded = encodeMaskRle(data, width, height)
    expect(encoded.width).toBe(width)
    expect(encoded.height).toBe(height)
    expect(encoded.runs.length).toBeGreaterThan(0)
    const decoded = decodeMaskRle(encoded)
    expect(Array.from(decoded)).toEqual(Array.from(data))
  })
})
