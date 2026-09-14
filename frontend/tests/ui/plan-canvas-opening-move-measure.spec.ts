import { describe, expect, it } from 'vitest'
import {
  buildOpeningMoveMeasureLines,
  OPENING_MOVE_MEASURE_INSET_CM,
  openingMoveMeasureLengthsCm,
} from '@/ui/composables/plan-canvas/plan-canvas-opening-move-measure'
import {
  formatMeasureDistanceCm,
  measureDistanceCm,
} from '@/ui/composables/plan-canvas/plan-canvas-measure'
import type { Wall } from '@/core/plan/types'

const wall400 = {
  a: { x: 0, y: 0 },
  b: { x: 400, y: 0 },
  thickness: 20,
}

describe('plan-canvas-opening-move-measure', () => {
  it('vrijstaand: muur 400 cm, opening 80 cm op t=0.5 → links 160, rechts 160', () => {
    const lengths = openingMoveMeasureLengthsCm(wall400, { t: 0.5, width: 80 })
    expect(lengths).not.toBeNull()
    expect(lengths!.leftCm).toBeCloseTo(160, 6)
    expect(lengths!.rightCm).toBeCloseTo(160, 6)
  })

  it('t naar de A-kant → links korter, rechts langer', () => {
    // center at 80 cm: left edge = 40, right edge = 120
    const lengths = openingMoveMeasureLengthsCm(wall400, { t: 80 / 400, width: 80 })
    expect(lengths).not.toBeNull()
    expect(lengths!.leftCm).toBeCloseTo(40, 6)
    expect(lengths!.rightCm).toBeCloseTo(280, 6)
  })

  it('binnenmaat: loodrechte buren korten de restmaten in (dikte/2)', () => {
    // U-vorm: west + oost stubs 20 cm dik → inset 10 aan beide kanten
    const host: Wall = {
      id: 'host',
      a: { x: 0, y: 0 },
      b: { x: 400, y: 0 },
      thickness: 20,
      openings: [],
    }
    const west: Wall = {
      id: 'west',
      a: { x: 0, y: 0 },
      b: { x: 0, y: 200 },
      thickness: 20,
      openings: [],
    }
    const east: Wall = {
      id: 'east',
      a: { x: 400, y: 0 },
      b: { x: 400, y: 200 },
      thickness: 20,
      openings: [],
    }
    const lengths = openingMoveMeasureLengthsCm(host, { t: 0.5, width: 80 }, [host, west, east])
    expect(lengths).not.toBeNull()
    // Hart-rest 160 − 10 inset = 150
    expect(lengths!.leftCm).toBeCloseTo(150, 6)
    expect(lengths!.rightCm).toBeCloseTo(150, 6)
  })

  it('offset staat loodrecht op de as', () => {
    const lines = buildOpeningMoveMeasureLines(wall400, { t: 0.5, width: 80 })
    expect(lines).toHaveLength(2)
    const expectedOffset = wall400.thickness / 2 + OPENING_MOVE_MEASURE_INSET_CM
    // Horizontal wall → left normal is (0, 1); all points shifted by +Y
    for (const line of lines) {
      expect(line.a.y).toBeCloseTo(expectedOffset, 6)
      expect(line.b.y).toBeCloseTo(expectedOffset, 6)
      expect(line.a.x).toBeLessThanOrEqual(line.b.x + 1e-9)
    }
    expect(measureDistanceCm(lines[0].a, lines[0].b)).toBeCloseTo(160, 6)
  })

  it('ft-in label volgt dezelfde formatter als tape', () => {
    expect(formatMeasureDistanceCm(160, 'ft-in')).toBe(formatMeasureDistanceCm(160, 'ft-in'))
    expect(formatMeasureDistanceCm(160, 'ft-in')).toMatch(/'|"/)
  })

  it('degeneraat segment → geen lijnen', () => {
    expect(
      buildOpeningMoveMeasureLines(
        { a: { x: 1, y: 1 }, b: { x: 1, y: 1 }, thickness: 10 },
        {
          t: 0.5,
          width: 80,
        },
      ),
    ).toEqual([])
  })
})
