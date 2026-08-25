import { describe, expect, it } from 'vitest'
import {
  formatScaleLengthField,
  parseAndClampScaleLengthCm,
  scaleLengthStepCm,
  stepScaleLengthCm,
} from '@/ui/composables/settings/scale-length-field'
import { CM_PER_INCH } from '@/ui/composables/settings/scale-input-unit'

describe('scale-length-field', () => {
  it('parseAndClampScaleLengthCm metric + ft-in', () => {
    expect(parseAndClampScaleLengthCm('3', 'm')).toBeCloseTo(300)
    expect(parseAndClampScaleLengthCm('40', 'cm')).toBeCloseTo(40)
    expect(parseAndClampScaleLengthCm("5'", 'ft-in')).toBeCloseTo(5 * 12 * CM_PER_INCH)
    expect(parseAndClampScaleLengthCm('2m', 'ft-in')).toBeCloseTo(200)
  })

  it('rejects non-positive unless allowZero', () => {
    expect(parseAndClampScaleLengthCm('0', 'cm')).toBeNull()
    expect(parseAndClampScaleLengthCm('0', 'cm', { allowZero: true })).toBe(0)
    expect(parseAndClampScaleLengthCm('-1', 'm')).toBeNull()
  })

  it('clamps to min/max in cm', () => {
    expect(parseAndClampScaleLengthCm('5', 'cm', { minCm: 10 })).toBe(10)
    expect(parseAndClampScaleLengthCm('500', 'cm', { maxCm: 400 })).toBe(400)
  })

  it('formatScaleLengthField does not mutate stored cm (display only)', () => {
    const cm = 280
    expect(formatScaleLengthField(cm, 'm')).toBe('2.8')
    expect(formatScaleLengthField(cm, 'cm')).toBe('280')
    expect(formatScaleLengthField(cm, 'mm')).toBe('2800')
    // roundtrip of display string may differ by 1/32" but stored cm is unchanged by format alone
    expect(cm).toBe(280)
  })

  it('step is 1 cm metric and 1/16 inch imperial', () => {
    expect(scaleLengthStepCm('metric')).toBe(1)
    expect(scaleLengthStepCm('imperial')).toBeCloseTo(CM_PER_INCH / 16)
    expect(stepScaleLengthCm(220, 'metric', 1)).toBe(221)
    expect(stepScaleLengthCm(220, 'metric', -1)).toBe(219)
    expect(stepScaleLengthCm(1, 'metric', -1, { minCm: 1 })).toBe(1)
    expect(stepScaleLengthCm(0, 'metric', -1, { allowZero: true, minCm: 0 })).toBe(0)
    expect(stepScaleLengthCm(CM_PER_INCH, 'imperial', 1)).toBeCloseTo(CM_PER_INCH * (17 / 16))
  })

  it('unit switch display: same cm, different format', () => {
    const cm = 90
    expect(formatScaleLengthField(cm, 'cm')).toBe('90')
    expect(formatScaleLengthField(cm, 'm')).toBe('0.9')
    expect(formatScaleLengthField(cm, 'ft-in')).toMatch(/'|"/)
  })
})
