import { describe, expect, it } from 'vitest'
import {
  buildFaceBBoxIndex,
  rebuildFaceBBoxInk,
  unionLabelsBBox,
} from '@/cv/walls/rooms/face-bbox-index'

describe('face-bbox-index', () => {
  it('bouwt white en ink sides uit label buffers', () => {
    const width = 4
    const height = 2
    const raw = new Int32Array([1, 1, 0, 2, 1, 1, 0, 2])
    const ink = new Int32Array([1, 1, 1, 2, 1, 1, 1, 2])
    const index = buildFaceBBoxIndex({
      rawLabelsData: raw,
      labelsData: ink,
      width,
      height,
    })
    expect(index.whiteByLabel.get(1)?.bbox).toEqual({ x: 0, y: 0, width: 2, height: 2 })
    expect(index.whiteByLabel.get(2)?.bbox).toEqual({ x: 3, y: 0, width: 1, height: 2 })
    // Ink-side: label 1 eet middelste kolom → bredere bbox
    expect(index.inkByLabel.get(1)?.bbox.width).toBeGreaterThan(
      index.whiteByLabel.get(1)!.bbox.width,
    )
  })

  it('unionLabelsBBox root-aware unieert child onder parent', () => {
    const width = 4
    const height = 2
    const labels = new Int32Array([1, 1, 2, 2, 1, 1, 2, 2])
    const index = buildFaceBBoxIndex({
      labelsData: labels,
      width,
      height,
    })
    const parentMap = new Map([[2, 1]])
    const bounds = unionLabelsBBox(index, [1], {
      source: 'ink',
      width,
      height,
      parentMap,
    })
    expect(bounds).toEqual({ x0: 0, y0: 0, x1: 3, y1: 1 })
  })

  it('rebuildFaceBBoxInk vernieuwt alleen ink-side', () => {
    const width = 3
    const height = 1
    const raw = new Int32Array([1, 0, 2])
    const ink1 = new Int32Array([1, 0, 2])
    const index = buildFaceBBoxIndex({
      rawLabelsData: raw,
      labelsData: ink1,
      width,
      height,
    })
    const whiteBefore = index.whiteByLabel.get(1)!.bbox
    const ink2 = new Int32Array([1, 1, 2])
    const next = rebuildFaceBBoxInk(index, ink2, width, height)
    expect(next.whiteByLabel.get(1)!.bbox).toEqual(whiteBefore)
    expect(next.inkByLabel.get(1)!.bbox.width).toBe(2)
  })
})
