import { describe, expect, it } from 'vitest'
import {
  demoteOversizedFacesByRefCap,
  isOpeningRefFaceForCap,
  OPENING_REF_FACE_SIZE_MULTIPLIER,
} from '@/cv/gaps/ref-face-size-cap'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'

describe('ref-face-size-cap', () => {
  it('isOpeningRefFaceForCap: head/interior/unknown wel, outside niet', () => {
    expect(isOpeningRefFaceForCap({ role: 'interior' } as never, null, 'horizontal')).toBe(true)
    expect(isOpeningRefFaceForCap({ role: 'head' } as never, null, 'horizontal')).toBe(true)
    expect(isOpeningRefFaceForCap({ role: 'unknown' } as never, null, 'horizontal')).toBe(true)
    expect(
      isOpeningRefFaceForCap({ role: 'outside', centroid: { x: 50, y: 10 } } as never, null, 'horizontal'),
    ).toBe(false)
  })

  it('isOpeningRefFaceForCap: kopeinde-zone telt als head ook bij outside-rol', () => {
    const heads = {
      startHead: { start: 2, end: 8 },
      endHead: { start: 92, end: 98 },
    }
    expect(
      isOpeningRefFaceForCap(
        { role: 'outside', centroid: { x: 5, y: 12 } } as never,
        heads,
        'horizontal',
      ),
    ).toBe(true)
    expect(
      isOpeningRefFaceForCap(
        { role: 'outside', centroid: { x: 50, y: 12 } } as never,
        heads,
        'horizontal',
      ),
    ).toBe(false)
  })

  it('demote vlakken groter dan 3× ref-face naar outside', () => {
    const components: RasterRoomComponent[] = [
      {
        label: 1,
        areaPx: 500,
        bbox: { x: 0, y: 0, width: 20, height: 25 },
        touchesBorder: false,
      },
      {
        label: 2,
        areaPx: 5000,
        bbox: { x: 30, y: 0, width: 70, height: 70 },
        touchesBorder: false,
      },
      {
        label: 3,
        areaPx: 800,
        bbox: { x: 0, y: 40, width: 25, height: 32 },
        touchesBorder: false,
      },
    ]
    const classificationByLabel = new Map<number, 'surface' | 'outside'>([
      [1, 'surface'],
      [2, 'surface'],
      [3, 'outside'],
    ])
    const parentMap = new Map<number, number>()

    const result = demoteOversizedFacesByRefCap({
      classificationByLabel,
      components,
      parentMap,
      maxRefFaceAreaPx: 400,
    })

    expect(result.areaCapPx).toBe(400 * OPENING_REF_FACE_SIZE_MULTIPLIER)
    expect(result.oversizedDemotedCount).toBe(1)
    expect(classificationByLabel.get(1)).toBe('surface')
    expect(classificationByLabel.get(2)).toBe('outside')
    expect(classificationByLabel.get(3)).toBe('outside')
  })

  it('aggregeert child-labels via parentMap', () => {
    const components: RasterRoomComponent[] = [
      {
        label: 10,
        areaPx: 600,
        bbox: { x: 0, y: 0, width: 20, height: 30 },
        touchesBorder: false,
      },
      {
        label: 11,
        areaPx: 600,
        bbox: { x: 0, y: 30, width: 20, height: 30 },
        touchesBorder: false,
      },
    ]
    const classificationByLabel = new Map<number, 'surface'>([[5, 'surface']])
    const parentMap = new Map<number, number>([
      [10, 5],
      [11, 5],
    ])

    const result = demoteOversizedFacesByRefCap({
      classificationByLabel,
      components,
      parentMap,
      maxRefFaceAreaPx: 300,
    })

    expect(result.oversizedDemotedCount).toBe(1)
    expect(classificationByLabel.get(5)).toBe('outside')
  })
})
