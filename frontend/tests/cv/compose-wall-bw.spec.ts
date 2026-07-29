/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import {
  INK_OVERLAY_BLACK,
  INK_OVERLAY_NONE,
  INK_OVERLAY_WHITE,
  WALL_BW_INK,
  WALL_BW_WHITE,
  applyInkOverlayBrush,
  applyInkOverlayErase,
  bakeInkOverlayIntoBaseBw,
  composeWallBw,
  createInkOverlay,
  decodeInkOverlayRle,
  encodeInkOverlayRle,
  inkOverlayHasEdits,
  mergeInkOverlayInto,
} from '@/cv/preprocess/compose-wall-bw'

describe('composeWallBw', () => {
  it('passthrough zonder masks', () => {
    const base = new Uint8Array([0, 255, 0, 255])
    expect(Array.from(composeWallBw({ baseBw: base }))).toEqual([0, 255, 0, 255])
  })

  it('ocrMask forceert wit', () => {
    const base = new Uint8Array([0, 0, 0, 0])
    const ocr = new Uint8Array([0, 255, 0, 0])
    expect(Array.from(composeWallBw({ baseBw: base, ocrMask: ocr }))).toEqual([
      WALL_BW_INK,
      WALL_BW_WHITE,
      WALL_BW_INK,
      WALL_BW_INK,
    ])
  })

  it('ink overlay wint van OCR', () => {
    const base = new Uint8Array([WALL_BW_WHITE, WALL_BW_WHITE])
    const ocr = new Uint8Array([255, 255])
    const ink = new Uint8Array([INK_OVERLAY_BLACK, INK_OVERLAY_NONE])
    expect(Array.from(composeWallBw({ baseBw: base, ocrMask: ocr, inkOverlay: ink }))).toEqual([
      WALL_BW_INK,
      WALL_BW_WHITE,
    ])
  })

  it('ink WHITE wist boven base en OCR', () => {
    const base = new Uint8Array([WALL_BW_INK, WALL_BW_INK])
    const ink = new Uint8Array([INK_OVERLAY_WHITE, INK_OVERLAY_NONE])
    expect(Array.from(composeWallBw({ baseBw: base, inkOverlay: ink }))).toEqual([
      WALL_BW_WHITE,
      WALL_BW_INK,
    ])
  })

  it('bakeInkOverlayIntoBaseBw schrijft in-place en wist overlay', () => {
    const base = new Uint8Array([WALL_BW_WHITE, WALL_BW_INK, WALL_BW_WHITE])
    const ink = new Uint8Array([INK_OVERLAY_BLACK, INK_OVERLAY_WHITE, INK_OVERLAY_NONE])
    expect(bakeInkOverlayIntoBaseBw(base, ink)).toBe(true)
    expect(Array.from(base)).toEqual([WALL_BW_INK, WALL_BW_WHITE, WALL_BW_WHITE])
    expect(Array.from(ink)).toEqual([INK_OVERLAY_NONE, INK_OVERLAY_NONE, INK_OVERLAY_NONE])
  })

  it('bakeInkOverlayIntoBaseBw no-op zonder edits', () => {
    const base = new Uint8Array([WALL_BW_WHITE, WALL_BW_INK])
    const ink = new Uint8Array([INK_OVERLAY_NONE, INK_OVERLAY_NONE])
    expect(bakeInkOverlayIntoBaseBw(base, ink)).toBe(false)
    expect(Array.from(base)).toEqual([WALL_BW_WHITE, WALL_BW_INK])
  })

  it('mergeInkOverlayInto overschrijft alleen non-NONE', () => {
    const target = new Uint8Array([INK_OVERLAY_BLACK, INK_OVERLAY_NONE, INK_OVERLAY_WHITE])
    const source = new Uint8Array([INK_OVERLAY_WHITE, INK_OVERLAY_BLACK, INK_OVERLAY_NONE])
    mergeInkOverlayInto(target, source)
    expect(Array.from(target)).toEqual([
      INK_OVERLAY_WHITE,
      INK_OVERLAY_BLACK,
      INK_OVERLAY_WHITE,
    ])
  })

  it('inkOverlayHasEdits', () => {
    const empty = createInkOverlay(2, 2)
    expect(inkOverlayHasEdits(empty)).toBe(false)
    empty[1] = INK_OVERLAY_BLACK
    expect(inkOverlayHasEdits(empty)).toBe(true)
  })

  it('encode/decode RLE roundtrip', () => {
    const overlay = new Uint8Array([0, 0, 1, 1, 1, 2, 0])
    const runs = encodeInkOverlayRle(overlay)
    expect(decodeInkOverlayRle(runs, overlay.length)).toEqual(overlay)
  })
})

describe('ink overlay strokes', () => {
  it('brush zet BLACK codes', () => {
    const overlay = createInkOverlay(20, 20)
    applyInkOverlayBrush(overlay, 20, 20, [{ x: 10, y: 10 }], 2)
    expect(overlay[10 * 20 + 10]).toBe(INK_OVERLAY_BLACK)
    expect(overlay[0]).toBe(INK_OVERLAY_NONE)
  })

  it('erase zet WHITE en overschrijft brush', () => {
    const overlay = createInkOverlay(20, 20)
    applyInkOverlayBrush(overlay, 20, 20, [{ x: 10, y: 10 }], 3)
    applyInkOverlayErase(overlay, 20, 20, [{ x: 10, y: 10 }], 3)
    expect(overlay[10 * 20 + 10]).toBe(INK_OVERLAY_WHITE)
  })
})
