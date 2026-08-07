import { describe, expect, it } from 'vitest'
import { cropAndScaleMask } from '@/cv/tools/polygon'

describe('cropAndScaleMask', () => {
  it('crops AABB then nearest-neighbour scales', () => {
    // 4x4 mask: only bottom-right 2x2 is ink
    const mask = new Uint8Array(16)
    mask[2 * 4 + 2] = 255
    mask[2 * 4 + 3] = 255
    mask[3 * 4 + 2] = 255
    mask[3 * 4 + 3] = 255

    const out = cropAndScaleMask(mask, 4, 4, { left: 2, top: 2, width: 2, height: 2 }, 4, 4)
    expect(out.length).toBe(16)
    expect(out.every((v) => v === 255)).toBe(true)
  })
})
