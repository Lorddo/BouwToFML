import { describe, expect, it } from 'vitest'
import type { BtfSlice } from '@/core/fml/btf-slices'
import {
  collectSliceOffsetTargetsCm,
  DEFAULT_SLICER_OFFSET_SNAP_CM,
  snapPointToOffsetDistance,
  snapPointToOtherPCoords,
  snapSlicerOffsetPoint,
} from '@/core/fml/slice-offset-snap'

describe('slice-offset-snap', () => {
  it('collecteert voorkeur + andere slice-offsets', () => {
    const slices: BtfSlice[] = [
      { m: { x: 0, y: 0 }, p: { x: 50, y: 0 } },
      { m: { x: 0, y: 100 }, p: { x: 80, y: 100 } },
    ]
    expect(collectSliceOffsetTargetsCm(slices, 50, -1)).toEqual([50, 80])
    expect(collectSliceOffsetTargetsCm(slices, 50, 0)).toEqual([50, 80])
    expect(collectSliceOffsetTargetsCm(slices, DEFAULT_SLICER_OFFSET_SNAP_CM, 1)).toEqual([50])
  })

  it('snapt afstand naar dichtstbijzijnde target', () => {
    const anchor = { x: 0, y: 0 }
    const near = snapPointToOffsetDistance(anchor, { x: 48, y: 0 }, [50], 15)
    expect(near.x).toBeCloseTo(50, 5)
    expect(near.y).toBe(0)
    const far = snapPointToOffsetDistance(anchor, { x: 70, y: 0 }, [50], 15)
    expect(far.x).toBe(70)
  })

  it('snapt X/Y naar andere P-punten', () => {
    const hit = snapPointToOtherPCoords({ x: 52, y: 10 }, [{ x: 50, y: 200 }], 15)
    expect(hit.x).toBe(50)
    expect(hit.y).toBe(10)
  })

  it('snapSlicerOffsetPoint combineert afstand + P-align', () => {
    const slices: BtfSlice[] = [{ m: { x: 0, y: 0 }, p: { x: 50, y: 0 } }]
    const out = snapSlicerOffsetPoint({
      anchor: { x: 0, y: 100 },
      point: { x: 48, y: 100 },
      slices,
      preferredCm: 50,
      excludeIndex: -1,
      snapPCoords: true,
    })
    expect(out.x).toBeCloseTo(50, 5)
    expect(out.y).toBe(100)
  })
})
