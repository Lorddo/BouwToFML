import { describe, expect, it } from 'vitest'
import type { BtfSlice } from '@/core/fml/btf-slices'
import {
  DEFAULT_SLICER_OFFSET_SNAP_CM,
  slicePlaceStripAxis,
  snapCoordAwayFromStrips,
  snapSlicerPPoint,
} from '@/core/fml/slice-offset-snap'

describe('slice-offset-snap (stroken)', () => {
  it('slicePlaceStripAxis: X-offset → verticale place', () => {
    expect(slicePlaceStripAxis({ m: { x: 0, y: 10 }, p: { x: 50, y: 10 } })).toBe('x')
    expect(slicePlaceStripAxis({ m: { x: 5, y: 0 }, p: { x: 5, y: 40 } })).toBe('y')
  })

  it('verbiedt hele X-strook: zelfde X andere Y → wegduwen', () => {
    const slices: BtfSlice[] = [{ m: { x: 0, y: 0 }, p: { x: 100, y: 0 } }]
    // Zelfde X, ver weg in Y — oude punt-snap liet dit toe
    const out = snapSlicerPPoint({
      point: { x: 102, y: 800 },
      slices,
      preferredCm: 50,
      forceAxis: 'x',
    })
    expect(out.x).toBeCloseTo(150, 5)
    expect(out.y).toBe(800)
  })

  it('snapt naar strookrand ±preferred', () => {
    expect(snapCoordAwayFromStrips(48, [0], 50, 15)).toBeCloseTo(50, 5)
    expect(snapCoordAwayFromStrips(10, [0], 50, 15)).toBeCloseTo(50, 5)
    expect(snapCoordAwayFromStrips(80, [0], 50, 15)).toBe(80)
  })

  it('laat parallelle place-lijnen op zelfde Y toe als X genoeg offset heeft', () => {
    const slices: BtfSlice[] = [{ m: { x: 0, y: 50 }, p: { x: 0, y: 50 } }]
    const out = snapSlicerPPoint({
      point: { x: 50, y: 50 },
      slices,
      preferredCm: DEFAULT_SLICER_OFFSET_SNAP_CM,
      forceAxis: 'x',
    })
    expect(out.x).toBeCloseTo(50, 5)
    expect(out.y).toBe(50)
  })

  it('Y-strook canvas-breed bij horizontale place', () => {
    const slices: BtfSlice[] = [{ m: { x: 0, y: 0 }, p: { x: 0, y: 100 } }]
    const out = snapSlicerPPoint({
      point: { x: 900, y: 105 },
      slices,
      preferredCm: 50,
      forceAxis: 'y',
    })
    expect(out.x).toBe(900)
    expect(out.y).toBeCloseTo(150, 5)
  })
})
