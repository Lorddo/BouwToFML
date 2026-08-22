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
    const bifold = buildDoorSwingSymbol({ ...base, kind: 'bifold' })
    const bifoldDouble = buildDoorSwingSymbol({ ...base, kind: 'bifold_double' })
    expect(bifold.leafLines).toHaveLength(2)
    expect(bifoldDouble.leafLines).toHaveLength(4)
    expect(bifold.arcPoints).toHaveLength(0)
    expect(bifoldDouble.arcPoints).toHaveLength(0)
  })

  it('sliding-pijlen liggen buiten de muurgap (dikte/2 + marge)', () => {
    const wallThickness = 20
    const base = {
      start: { x: 10, y: 10 },
      end: { x: 160, y: 10 },
      wallUnit: { x: 1, y: 0 },
      width: 150,
      mirrored: [0, 0] as [number, number],
      wallThickness,
    }
    // -normal (mirrored[1]=0) → as-y = 10 - (10 + 10) = -10; gap-rand y=0.
    const gapEdgeY = 10 - wallThickness / 2
    const sliding = buildDoorSwingSymbol({ ...base, kind: 'sliding' })
    const single = buildDoorSwingSymbol({ ...base, kind: 'sliding_single' })
    const pocket = buildDoorSwingSymbol({ ...base, kind: 'sliding_pocket' })
    for (const arrow of [...sliding.arrowPoints, ...single.arrowPoints, ...pocket.arrowPoints]) {
      // As = tail→tip (eerste 4 coords); vleugels mogen iets uitsteken.
      const shaftY = (arrow[1] + arrow[3]) / 2
      expect(shaftY).toBeLessThan(gapEdgeY)
    }
  })

  it('sliding-pijlen springen mee bij spiegelen op muurzijde (mirrored[1])', () => {
    const wallThickness = 20
    const base = {
      start: { x: 10, y: 10 },
      end: { x: 160, y: 10 },
      wallUnit: { x: 1, y: 0 },
      width: 150,
      wallThickness,
    }
    const gapEdgeNeg = 10 - wallThickness / 2
    const gapEdgePos = 10 + wallThickness / 2
    const defaultSide = buildDoorSwingSymbol({
      ...base,
      kind: 'sliding',
      mirrored: [0, 0],
    })
    const flippedSide = buildDoorSwingSymbol({
      ...base,
      kind: 'sliding',
      mirrored: [0, 1],
    })
    const defaultY = (defaultSide.arrowPoints[0][1] + defaultSide.arrowPoints[0][3]) / 2
    const flippedY = (flippedSide.arrowPoints[0][1] + flippedSide.arrowPoints[0][3]) / 2
    expect(defaultY).toBeLessThan(gapEdgeNeg)
    expect(flippedY).toBeGreaterThan(gapEdgePos)
  })

  it('french balcony swings inward and puts the rail on the FML exterior side', () => {
    const base = {
      start: { x: 0, y: 0 },
      end: { x: 80, y: 0 },
      wallUnit: { x: 1, y: 0 },
      width: 80,
      mirrored: [0, 0] as [number, number],
      wallThickness: 20,
    }
    const single = buildDoorSwingSymbol({ ...base, kind: 'single' })
    const french = buildDoorSwingSymbol({ ...base, kind: 'french_balcony' })
    expect(single.leafLines[0][3]).toBeLessThan(0)
    expect(french.leafLines[0][3]).toBeGreaterThan(0)
    expect(french.arcPoints).toHaveLength(1)
    expect(french.leafLines.length).toBeGreaterThan(2)
    const railY = (french.leafLines[1][1] + french.leafLines[1][3]) / 2
    expect(railY).toBeLessThan(-10)
  })
})
