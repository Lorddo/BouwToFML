import { describe, expect, it } from 'vitest'
import {
  findThicknessAxisForSegment,
  resolveThicknessSampleEnds,
  type ThicknessAxisHint,
} from '@/cv/walls/rooms/thickness-axis-sample'

describe('thickness-axis-sample', () => {
  const axis: ThicknessAxisHint = {
    anchor: { x: 0, y: 0 },
    direction: { x: Math.cos((7 * Math.PI) / 180), y: Math.sin((7 * Math.PI) / 180) },
    tMin: 0,
    tMax: 200,
  }

  it('vindt as voor segment in capture-band', () => {
    const a = { x: 10, y: 2 }
    const b = { x: 110, y: 14 }
    const found = findThicknessAxisForSegment({
      a,
      b,
      axes: [axis],
      captureBandPx: 8,
    })
    expect(found).not.toBeNull()
  })

  it('projecteert trap-einden op de as', () => {
    // Segment parallel-offset naast de as (binnen band), H/V-trap.
    const onAxis = { x: 100 * axis.direction.x, y: 100 * axis.direction.y }
    const a = { x: onAxis.x - axis.direction.y * 4, y: onAxis.y + axis.direction.x * 4 }
    const b = {
      x: onAxis.x + 40 * axis.direction.x - axis.direction.y * 4,
      y: onAxis.y + 40 * axis.direction.y + axis.direction.x * 4,
    }
    const sample = resolveThicknessSampleEnds({
      a,
      b,
      axes: [axis],
      captureBandPx: 8,
    })
    expect(sample.axis).not.toBeNull()
    expect(Math.abs(sample.a.x - a.x) + Math.abs(sample.a.y - a.y)).toBeGreaterThan(0.5)
  })

  it('laat H/V-segment buiten band ongemoeid', () => {
    const a = { x: 0, y: 100 }
    const b = { x: 80, y: 100 }
    const sample = resolveThicknessSampleEnds({
      a,
      b,
      axes: [axis],
      captureBandPx: 5,
    })
    expect(sample.axis).toBeNull()
    expect(sample.a).toEqual(a)
    expect(sample.b).toEqual(b)
  })
})
