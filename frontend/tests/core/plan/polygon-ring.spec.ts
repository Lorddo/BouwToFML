import { describe, expect, it } from 'vitest'
import {
  ringAreaAbs,
  ringAreaSigned,
  toClipRing,
} from '@/core/plan/polygon-ring'

describe('polygon-ring', () => {
  const ccw = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 4 },
    { x: 0, y: 4 },
  ]
  const cw = [...ccw].reverse()

  it('ringAreaSigned is positive for CCW and negative for CW', () => {
    expect(ringAreaSigned(ccw)).toBeCloseTo(40, 6)
    expect(ringAreaSigned(cw)).toBeCloseTo(-40, 6)
  })

  it('ringAreaAbs equals |signed| for both windings', () => {
    expect(ringAreaAbs(ccw)).toBeCloseTo(40, 6)
    expect(ringAreaAbs(cw)).toBeCloseTo(40, 6)
  })

  it('toClipRing closes an open ring', () => {
    const closed = toClipRing(ccw)
    expect(closed).toHaveLength(5)
    expect(closed[0]).toEqual([0, 0])
    expect(closed[4]).toEqual([0, 0])
  })

  it('toClipRing leaves an already-closed ring unchanged in length', () => {
    const already = [...ccw, { x: 0, y: 0 }]
    expect(toClipRing(already)).toHaveLength(5)
  })
})
