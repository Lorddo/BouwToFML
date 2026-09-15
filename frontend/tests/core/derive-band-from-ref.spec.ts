import { describe, expect, it } from 'vitest'
import {
  classifyThicknessBand,
  deriveBandBoundariesCmFromRefPx,
  deriveBandBoundariesFromCatalogExtrema,
  THICKNESS_BAND_MAX_RATIO,
  THICKNESS_BAND_MID_RATIO,
  THICKNESS_CATALOG_MAX_FOOTROOM,
  THICKNESS_CATALOG_MIN_FROM_MAX,
} from '@/core/plan/wall-thickness-tiers'

describe('deriveBandBoundariesCmFromRefPx', () => {
  it('leidt bandgrenzen af uit referentie px + schaal', () => {
    // 60px / 0.2 px-per-mm = 300mm = 30cm referentie-muur.
    const boundaries = deriveBandBoundariesCmFromRefPx(60, 0.2, 0.2)
    expect(boundaries.midBoundaryCm).toBe(30 * THICKNESS_BAND_MID_RATIO)
    expect(boundaries.maxBoundaryCm).toBe(30 * THICKNESS_BAND_MAX_RATIO)
  })

  it('classificeert ratio-banden rond referentie-muur', () => {
    const refPx = 60
    const pxPerMm = 0.2
    const boundaries = deriveBandBoundariesCmFromRefPx(refPx, pxPerMm, pxPerMm)
    const refCm = refPx / pxPerMm / 10

    expect(classifyThicknessBand(refCm * 0.3, boundaries)).toBe('min')
    expect(classifyThicknessBand(refCm * THICKNESS_BAND_MID_RATIO, boundaries)).toBe('mid')
    expect(classifyThicknessBand(refCm * 0.7, boundaries)).toBe('mid')
    expect(classifyThicknessBand(refCm * THICKNESS_BAND_MAX_RATIO, boundaries)).toBe('mid')
    expect(classifyThicknessBand(refCm * 0.86, boundaries)).toBe('max')
    expect(classifyThicknessBand(refCm, boundaries)).toBe('max')
  })

  it('faalt hard zonder geldige ref of schaal (geen stille default)', () => {
    expect(() => deriveBandBoundariesCmFromRefPx(0, 0.2, 0.2)).toThrow(/referentie|schaal/i)
    expect(() => deriveBandBoundariesCmFromRefPx(60, 0, 0)).toThrow(/referentie|schaal/i)
  })
})

describe('deriveBandBoundariesFromCatalogExtrema', () => {
  it('min = max(kleinste×1,2, grootste×0,25); max = grootste×0,9 (10/20/51)', () => {
    const bounds = deriveBandBoundariesFromCatalogExtrema({
      smallestCm: 10,
      largestCm: 51,
    })
    // 51×0,25 = 12,75 → afgerond 12,8; 51×0,9 = 45,9
    expect(bounds.midBoundaryCm).toBe(12.8)
    expect(bounds.maxBoundaryCm).toBe(45.9)
    expect(classifyThicknessBand(10, bounds)).toBe('min')
    expect(classifyThicknessBand(20, bounds)).toBe('mid')
    expect(classifyThicknessBand(51, bounds)).toBe('max')
  })

  it('factory 10/30: min 12, max 27', () => {
    const extrema = deriveBandBoundariesFromCatalogExtrema({
      smallestCm: 10,
      largestCm: 30,
    })
    expect(extrema.midBoundaryCm).toBe(12)
    expect(extrema.maxBoundaryCm).toBe(27)
  })

  it('7/47: min vanuit grootste×0,25 (wint van kleinste×1,2)', () => {
    const bounds = deriveBandBoundariesFromCatalogExtrema({
      smallestCm: 7,
      largestCm: 47,
    })
    // 47×0,25 = 11,75 → 11,8; 7×1,2 = 8,4
    expect(bounds.midBoundaryCm).toBe(11.8)
    expect(bounds.maxBoundaryCm).toBeCloseTo(47 * THICKNESS_CATALOG_MAX_FOOTROOM, 5)
    expect(classifyThicknessBand(7, bounds)).toBe('min')
    expect(classifyThicknessBand(10, bounds)).toBe('min')
  })

  it('valt terug op grootste×0,25 / ×0,9 als drempels overlappen', () => {
    const bounds = deriveBandBoundariesFromCatalogExtrema({
      smallestCm: 20,
      largestCm: 22,
    })
    expect(bounds.midBoundaryCm).toBeCloseTo(22 * THICKNESS_CATALOG_MIN_FROM_MAX, 5)
    expect(bounds.maxBoundaryCm).toBeCloseTo(22 * THICKNESS_CATALOG_MAX_FOOTROOM, 5)
  })

  it('faalt zonder positieve extremen', () => {
    expect(() =>
      deriveBandBoundariesFromCatalogExtrema({ smallestCm: 0, largestCm: 30 }),
    ).toThrow(/catalogus|extremen/i)
  })
})
