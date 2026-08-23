import { describe, expect, it } from 'vitest'
import {
  CM_PER_INCH,
  cmToFeetInchParts,
  cmToScaleInput,
  feetInchPartsToCm,
  formatFeetInch,
  formatScaleInputLabel,
  formatScaleInputValue,
  mmToScaleInput,
  normalizeScaleInputUnit,
  normalizeUnitSystem,
  parseFeetInchToCm,
  parseScaleInput,
  parseScaleInputToMm,
  scaleInputDecimals,
  scaleInputStep,
  scaleInputToCm,
  scaleInputToMm,
} from '@/ui/composables/settings/scale-input-unit'

describe('scale-input-unit', () => {
  it('normalizeScaleInputUnit falls back to mm; accepts ft-in', () => {
    expect(normalizeScaleInputUnit(undefined)).toBe('mm')
    expect(normalizeScaleInputUnit('inch')).toBe('mm')
    expect(normalizeScaleInputUnit('cm')).toBe('cm')
    expect(normalizeScaleInputUnit('m')).toBe('m')
    expect(normalizeScaleInputUnit('ft-in')).toBe('ft-in')
  })

  it('normalizeUnitSystem falls back to metric', () => {
    expect(normalizeUnitSystem(undefined)).toBe('metric')
    expect(normalizeUnitSystem('foo')).toBe('metric')
    expect(normalizeUnitSystem('imperial')).toBe('imperial')
    expect(normalizeUnitSystem('metric')).toBe('metric')
  })

  it('converts mm ↔ cm/m roundtrip', () => {
    expect(mmToScaleInput(3000, 'mm')).toBe(3000)
    expect(mmToScaleInput(3000, 'cm')).toBe(300)
    expect(mmToScaleInput(3000, 'm')).toBe(3)

    expect(scaleInputToMm(3000, 'mm')).toBe(3000)
    expect(scaleInputToMm(300, 'cm')).toBe(3000)
    expect(scaleInputToMm(3, 'm')).toBe(3000)
    expect(scaleInputToMm(3.25, 'm')).toBe(3250)
  })

  it('converts ft-in as total inches ↔ cm/mm', () => {
    expect(cmToScaleInput(CM_PER_INCH, 'ft-in')).toBeCloseTo(1)
    expect(scaleInputToCm(1, 'ft-in')).toBeCloseTo(CM_PER_INCH)
    expect(mmToScaleInput(25.4, 'ft-in')).toBeCloseTo(1)
    expect(scaleInputToMm(12, 'ft-in')).toBeCloseTo(304.8)
  })

  it('scaleInputStep matches unit precision', () => {
    expect(scaleInputStep('mm')).toBe(1)
    expect(scaleInputStep('cm')).toBe(0.1)
    expect(scaleInputStep('m')).toBe(0.001)
    expect(scaleInputStep('ft-in')).toBe(1 / 32)
  })

  it('converts cm ↔ display unit', () => {
    expect(cmToScaleInput(99.6, 'cm')).toBeCloseTo(99.6)
    expect(cmToScaleInput(0.4, 'm')).toBeCloseTo(0.004)
    expect(cmToScaleInput(0.4, 'mm')).toBeCloseTo(4)
    expect(scaleInputToCm(0.4, 'cm')).toBeCloseTo(0.4)
    expect(scaleInputToCm(0.004, 'm')).toBeCloseTo(0.4)
    expect(scaleInputToCm(4, 'mm')).toBeCloseTo(0.4)
  })

  it('scaleInputDecimals matches step', () => {
    expect(scaleInputDecimals('m')).toBe(3)
    expect(scaleInputDecimals('cm')).toBe(1)
    expect(scaleInputDecimals('mm')).toBe(0)
    expect(scaleInputDecimals('ft-in')).toBe(0)
  })

  it('formatScaleInputLabel volgt de liniaal-eenheid', () => {
    expect(formatScaleInputLabel(250, 'm')).toBe('2.5 m')
    expect(formatScaleInputLabel(250, 'cm')).toBe('250 cm')
    expect(formatScaleInputLabel(250, 'mm')).toBe('2500 mm')
    expect(formatScaleInputLabel(45.3, 'm')).toBe('0.453 m')
    expect(formatScaleInputLabel(45.3, 'cm')).toBe('45.3 cm')
    expect(formatScaleInputLabel(45.3, 'mm')).toBe('453 mm')
  })

  it('cmToFeetInchParts rounds to 1/32 and simplifies', () => {
    // 5' 6 5/32" = 66 + 5/32 inches
    const inches = 66 + 5 / 32
    const cm = inches * CM_PER_INCH
    const parts = cmToFeetInchParts(cm)
    expect(parts).toEqual({
      sign: 1,
      feet: 5,
      wholeInches: 6,
      numerator: 5,
      denominator: 32,
    })
    expect(feetInchPartsToCm(parts)).toBeCloseTo(cm, 10)

    // 16/32 → 1/2
    const half = cmToFeetInchParts(0.5 * CM_PER_INCH)
    expect(half).toEqual({ sign: 1, feet: 0, wholeInches: 0, numerator: 1, denominator: 2 })
  })

  it('formatFeetInch uses architectural rules', () => {
    expect(formatFeetInch(0)).toBe('0"')
    expect(formatFeetInch(5 * 12 * CM_PER_INCH)).toBe("5'")
    expect(formatFeetInch(6.5 * CM_PER_INCH)).toBe('6 1/2"')
    expect(formatFeetInch((5 * 12 + 5 / 32) * CM_PER_INCH)).toBe('5\' 5/32"')
    expect(formatFeetInch((5 * 12 + 6 + 5 / 32) * CM_PER_INCH)).toBe('5\' 6 5/32"')
    expect(formatFeetInch(-CM_PER_INCH)).toBe('-1"')
  })

  it('formatScaleInputLabel for ft-in has no unit suffix', () => {
    expect(formatScaleInputLabel((5 * 12 + 6) * CM_PER_INCH, 'ft-in')).toBe('5\' 6"')
    expect(formatScaleInputValue(0, 'ft-in')).toBe('0"')
  })

  it('parseFeetInchToCm accepts common forms', () => {
    expect(parseFeetInchToCm("5'")).toBeCloseTo(5 * 12 * CM_PER_INCH)
    expect(parseFeetInchToCm('5\'6"')).toBeCloseTo((5 * 12 + 6) * CM_PER_INCH)
    expect(parseFeetInchToCm('5\' 6 5/32"')).toBeCloseTo((5 * 12 + 6 + 5 / 32) * CM_PER_INCH)
    expect(parseFeetInchToCm('5\' 5/32"')).toBeCloseTo((5 * 12 + 5 / 32) * CM_PER_INCH)
    expect(parseFeetInchToCm('6 5/32"')).toBeCloseTo((6 + 5 / 32) * CM_PER_INCH)
    expect(parseFeetInchToCm('66.5"')).toBeCloseTo(66.5 * CM_PER_INCH)
    expect(parseFeetInchToCm('-1"')).toBeCloseTo(-CM_PER_INCH)
  })

  it('format → parse roundtrip within half of 1/32"', () => {
    const samplesCm = [0, 2.54, 10, 100, 167.64, 250, 304.8, 999.9]
    const tolCm = (0.5 / 32) * CM_PER_INCH
    for (const cm of samplesCm) {
      const formatted = formatScaleInputValue(cm, 'ft-in')
      const parsed = parseScaleInput(formatted, 'ft-in')
      expect(parsed).not.toBeNull()
      expect(Math.abs(parsed! - feetInchPartsToCm(cmToFeetInchParts(cm)))).toBeLessThanOrEqual(
        tolCm + 1e-9,
      )
    }
  })

  it('parseScaleInput metric uses chosen unit', () => {
    expect(parseScaleInput('3', 'm')).toBeCloseTo(300)
    expect(parseScaleInput('3,25', 'm')).toBeCloseTo(325)
    expect(parseScaleInput('40', 'cm')).toBeCloseTo(40)
    expect(parseScaleInput('40', 'mm')).toBeCloseTo(4)
  })

  it('parseScaleInput: explicit unit wins over default', () => {
    expect(parseScaleInput('1\' 5"', 'm')).toBeCloseTo((12 + 5) * CM_PER_INCH)
    expect(parseScaleInput('66"', 'cm')).toBeCloseTo(66 * CM_PER_INCH)
    expect(parseScaleInput('3000mm', 'ft-in')).toBeCloseTo(300)
    expect(parseScaleInput('3m', 'ft-in')).toBeCloseTo(300)
    expect(parseScaleInput('250cm', 'ft-in')).toBeCloseTo(250)
  })

  it('parseScaleInputToMm rejects non-positive', () => {
    expect(parseScaleInputToMm('0', 'm')).toBeNull()
    expect(parseScaleInputToMm('-1', 'm')).toBeNull()
    expect(parseScaleInputToMm('1m', 'mm')).toBeCloseTo(1000)
  })
})
