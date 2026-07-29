import { describe, expect, it } from 'vitest'
import {
  buildDoorSwingSymbol,
  buildMirrored,
  resolveHingeAtStart,
  resolveSwingSign,
} from '@/core/fml/door-swing-symbol'

describe('door-swing-symbol', () => {
  it('roundtrip mirrored blijft consistent', () => {
    const cases = [
      { hingeAtStart: true, swingRight: false, tuple: [0, 0] as [number, number] },
      { hingeAtStart: true, swingRight: true, tuple: [0, 1] as [number, number] },
      { hingeAtStart: false, swingRight: false, tuple: [1, 0] as [number, number] },
      { hingeAtStart: false, swingRight: true, tuple: [1, 1] as [number, number] },
    ]
    for (const row of cases) {
      expect(buildMirrored(row.hingeAtStart, row.swingRight)).toEqual(row.tuple)
      expect(resolveHingeAtStart(row.tuple)).toBe(row.hingeAtStart)
      expect(resolveSwingSign(row.tuple)).toBe(row.swingRight ? 1 : -1)
    }
  })

  it('single en closet45 leveren blad + boog', () => {
    const base = {
      start: { x: 10, y: 10 },
      end: { x: 100, y: 10 },
      wallUnit: { x: 1, y: 0 },
      width: 90,
      mirrored: [0, 1] as [number, number],
    }
    const single = buildDoorSwingSymbol({
      ...base,
      kind: 'single',
    })
    const closet45 = buildDoorSwingSymbol({
      ...base,
      kind: 'closet45',
    })
    expect(single.leafLines).toHaveLength(1)
    expect(single.arcPoints).toHaveLength(1)
    expect(closet45.leafLines).toHaveLength(1)
    expect(closet45.arcPoints).toHaveLength(1)
  })

  it('double_wide/sliding/passage/garage gebruiken correcte symboliek', () => {
    const base = {
      start: { x: 10, y: 10 },
      end: { x: 160, y: 10 },
      wallUnit: { x: 1, y: 0 },
      width: 150,
      mirrored: [0, 1] as [number, number],
    }
    const doubleWide = buildDoorSwingSymbol({ ...base, kind: 'double_wide' })
    const sliding = buildDoorSwingSymbol({ ...base, kind: 'sliding' })
    const pocket = buildDoorSwingSymbol({ ...base, kind: 'sliding_pocket' })
    const slidingSingle = buildDoorSwingSymbol({ ...base, kind: 'sliding_single' })
    const garage = buildDoorSwingSymbol({ ...base, kind: 'garage' })
    const passage = buildDoorSwingSymbol({ ...base, kind: 'passage' })
    expect(doubleWide.leafLines).toHaveLength(2)
    expect(doubleWide.arcPoints).toHaveLength(2)
    expect(sliding.leafLines).toHaveLength(1)
    expect(sliding.arcPoints).toHaveLength(0)
    expect(sliding.arrowPoints).toHaveLength(2)
    expect(pocket.arrowPoints).toHaveLength(1)
    expect(pocket.leafLines).toHaveLength(0)
    expect(slidingSingle.leafLines).toHaveLength(1)
    expect(slidingSingle.arrowPoints).toHaveLength(1)
    expect(garage.leafLines).toHaveLength(3)
    expect(garage.arcPoints).toHaveLength(0)
    expect(garage.arrowPoints).toHaveLength(0)
    expect(passage.leafLines).toHaveLength(0)
    expect(passage.arcPoints).toHaveLength(0)
    expect(passage.arrowPoints).toHaveLength(0)
  })
})
