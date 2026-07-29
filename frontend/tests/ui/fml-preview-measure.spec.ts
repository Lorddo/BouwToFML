import { describe, expect, it } from 'vitest'
import {
  buildMeasureLineScreen,
  formatMeasureDistanceCm,
  measureDistanceCm,
} from '@/ui/composables/fml-preview/fml-preview-measure'

describe('fml-preview-measure', () => {
  it('meet afstand in cm', () => {
    expect(measureDistanceCm({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('formatteert cm en meters', () => {
    expect(formatMeasureDistanceCm(45.3)).toBe('45.3 cm')
    expect(formatMeasureDistanceCm(250)).toBe('2.50 m')
  })

  it('bouwt schermgeometrie met tickmarks en label', () => {
    const screen = buildMeasureLineScreen(
      { id: 'm1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      (x, y) => ({ x, y }),
    )
    expect(screen.label).toBe('1.00 m')
    expect(screen.labelX).toBe(50)
    expect(screen.labelY).toBe(0)
    expect(screen.tickAy1).toBe(-6)
    expect(screen.tickAy2).toBe(6)
  })
})
