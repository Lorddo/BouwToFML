/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import {
  canvasPadIsEmpty,
  computeStampOverflowPad,
  paddedCanvasSize,
  paddedSizeExceedsMax,
  padHtmlCanvasWhite,
  padUint8Plane,
  STAMP_UNDERLAY_MAX_EDGE_PX,
  translateNulpuntImageCm,
  translateStampBounds,
} from '@/cv/preprocess/stamp-underlay-pad'

describe('computeStampOverflowPad', () => {
  it('levert lege pad als de stempel binnen de scan valt', () => {
    const pad = computeStampOverflowPad({ x: 10, y: 10, width: 80, height: 40 }, 100, 80, 48)
    expect(canvasPadIsEmpty(pad)).toBe(true)
  })

  it('groeit alleen overflow-zijden + marge', () => {
    const pad = computeStampOverflowPad({ x: -20, y: 0, width: 140, height: 50 }, 100, 80, 10)
    expect(pad.left).toBe(30)
    expect(pad.right).toBe(30)
    expect(pad.top).toBe(0)
    expect(pad.bottom).toBe(0)
  })

  it('dekt alle vier zijden', () => {
    const pad = computeStampOverflowPad({ x: -5, y: -8, width: 120, height: 100 }, 100, 80, 4)
    expect(pad).toEqual({ left: 9, top: 12, right: 19, bottom: 16 })
  })
})

describe('padUint8Plane + translate', () => {
  it('kopieert pixels met offset en vult nieuwe randen', () => {
    const src = new Uint8Array([1, 2, 3, 4])
    const out = padUint8Plane(src, 2, 2, { left: 1, top: 1, right: 1, bottom: 0 }, 9)
    expect(out).toHaveLength(4 * 3)
    expect(Array.from(out)).toEqual([9, 9, 9, 9, 9, 1, 2, 9, 9, 3, 4, 9])
  })

  it('verschuift stamp-bounds en nulpunt in scant-cm', () => {
    const bounds = translateStampBounds(
      { x: -20, y: 5, width: 50, height: 10 },
      {
        left: 30,
        top: 0,
        right: 0,
        bottom: 0,
      },
    )
    expect(bounds).toEqual({ x: 10, y: 5, width: 50, height: 10 })

    const nulpunt = translateNulpuntImageCm(
      { x: 10, y: 20 },
      { left: 20, top: 10, right: 0, bottom: 0 },
      1,
      1,
    )
    expect(nulpunt).toEqual({ x: 12, y: 21 })
  })
})

describe('padded size cap', () => {
  it('weiger te grote pad', () => {
    const pad = { left: STAMP_UNDERLAY_MAX_EDGE_PX, top: 0, right: 0, bottom: 0 }
    expect(paddedSizeExceedsMax(100, 80, pad)).toBe(true)
    expect(paddedCanvasSize(100, 80, { left: 10, top: 5, right: 2, bottom: 3 })).toEqual({
      width: 112,
      height: 88,
    })
  })
})

describe('padHtmlCanvasWhite', () => {
  it('tekent de bron op wit canvas met offset', () => {
    const src = document.createElement('canvas')
    src.width = 2
    src.height = 1
    const ctx = src.getContext('2d')
    expect(ctx).toBeTruthy()
    if (!ctx) return
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, 2, 1)

    const out = padHtmlCanvasWhite(src, { left: 1, top: 0, right: 1, bottom: 0 })
    expect(out.width).toBe(4)
    expect(out.height).toBe(1)
    const data = out.getContext('2d')?.getImageData(0, 0, 4, 1).data
    expect(data?.[0]).toBe(255)
    expect(data?.[4]).toBe(0)
    expect(data?.[8]).toBe(0)
    expect(data?.[12]).toBe(255)
  })
})
