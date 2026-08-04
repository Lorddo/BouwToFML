import { describe, expect, it } from 'vitest'
import {
  mmToScaleInput,
  normalizeScaleInputUnit,
  scaleInputStep,
  scaleInputToMm,
} from '@/ui/composables/settings/scale-input-unit'

describe('scale-input-unit', () => {
  it('normalizeScaleInputUnit falls back to mm', () => {
    expect(normalizeScaleInputUnit(undefined)).toBe('mm')
    expect(normalizeScaleInputUnit('inch')).toBe('mm')
    expect(normalizeScaleInputUnit('cm')).toBe('cm')
    expect(normalizeScaleInputUnit('m')).toBe('m')
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

  it('scaleInputStep matches unit precision', () => {
    expect(scaleInputStep('mm')).toBe(1)
    expect(scaleInputStep('cm')).toBe(0.1)
    expect(scaleInputStep('m')).toBe(0.001)
  })
})
