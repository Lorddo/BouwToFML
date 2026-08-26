import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createScaleLengthCommitGate,
  formatScaleLengthField,
  parseAndClampScaleLengthCm,
  SCALE_LENGTH_COMMIT_DEBOUNCE_MS,
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

describe('createScaleLengthCommitGate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits immediately when delay is 0', () => {
    const emit = vi.fn()
    const gate = createScaleLengthCommitGate(emit, () => 0)
    gate.schedule(2)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(2)
    expect(gate.peek()).toBeNull()
    gate.dispose()
  })

  it('debounces typing so 2 → 24 → 245 emits once', () => {
    const emit = vi.fn()
    const gate = createScaleLengthCommitGate(emit, () => SCALE_LENGTH_COMMIT_DEBOUNCE_MS)
    gate.schedule(2)
    gate.schedule(24)
    gate.schedule(245)
    expect(emit).not.toHaveBeenCalled()
    expect(gate.peek()).toBe(245)
    vi.advanceTimersByTime(SCALE_LENGTH_COMMIT_DEBOUNCE_MS - 1)
    expect(emit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(245)
    expect(gate.peek()).toBeNull()
    gate.dispose()
  })

  it('flush applies pending immediately (blur / Enter)', () => {
    const emit = vi.fn()
    const gate = createScaleLengthCommitGate(emit, () => SCALE_LENGTH_COMMIT_DEBOUNCE_MS)
    gate.schedule(245)
    gate.flush()
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(245)
    vi.advanceTimersByTime(SCALE_LENGTH_COMMIT_DEBOUNCE_MS)
    expect(emit).toHaveBeenCalledTimes(1)
    gate.dispose()
  })

  it('peek keeps last step so −/+ can stack before emit', () => {
    const emit = vi.fn()
    const gate = createScaleLengthCommitGate(emit, () => SCALE_LENGTH_COMMIT_DEBOUNCE_MS)
    gate.schedule(281)
    gate.schedule(282)
    expect(gate.peek()).toBe(282)
    expect(emit).not.toHaveBeenCalled()
    gate.dispose()
  })
})
