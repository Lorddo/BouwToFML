import { describe, expect, it } from 'vitest'
import { applyThicknessPick } from '@/core/plan/apply-thickness-pick'

const base = {
  limits: { minCm: 10, midCm: 20, maxCm: 30 },
  bandBoundaries: { midBoundaryCm: 12, maxBoundaryCm: 23 },
}

describe('applyThicknessPick', () => {
  it('zet min-bandgrens op gemeten × 1.10, niet export-limieten', () => {
    const result = applyThicknessPick('min', 12.4, base)
    expect(result.limits).toEqual(base.limits)
    expect(result.measuredCm).toBe(12.4)
    expect(result.bandBoundaries.midBoundaryCm).toBeCloseTo(13.6)
    expect(result.bandBoundaries.maxBoundaryCm).toBe(23)
  })

  it('zet max-bandgrens op gemeten × 0.90, niet export-limieten', () => {
    const result = applyThicknessPick('max', 28.4, base)
    expect(result.limits).toEqual(base.limits)
    expect(result.measuredCm).toBe(28.4)
    expect(result.bandBoundaries.midBoundaryCm).toBe(12)
    expect(result.bandBoundaries.maxBoundaryCm).toBeCloseTo(25.6)
  })

  it('ordent grenzen als max-meting onder midBoundary valt', () => {
    const result = applyThicknessPick('max', 10, base)
    expect(result.bandBoundaries.midBoundaryCm).toBeLessThanOrEqual(
      result.bandBoundaries.maxBoundaryCm,
    )
  })
})
