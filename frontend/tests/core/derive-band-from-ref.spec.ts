import { describe, expect, it } from 'vitest'
import {
  classifyThicknessBand,
  deriveBandBoundariesCmFromRefPx,
  deriveBandBoundariesFromCatalogExtrema,
  THICKNESS_BAND_MAX_RATIO,
  THICKNESS_BAND_MID_RATIO,
  THICKNESS_CATALOG_MAX_FOOTROOM,
  THICKNESS_CATALOG_MIN_HEADROOM,
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

  it('faalt hard zonder geldige ref of schaal (geen stille 12/23)', () => {
    expect(() => deriveBandBoundariesCmFromRefPx(0, 0.2, 0.2)).toThrow(/referentie|schaal/i)
    expect(() => deriveBandBoundariesCmFromRefPx(60, 0, 0)).toThrow(/referentie|schaal/i)
  })
})

describe('deriveBandBoundariesFromCatalogExtrema', () => {
  it('zet min tot kleinste+20% en max vanaf grootste−20% (10/20/51)', () => {
    const bounds = deriveBandBoundariesFromCatalogExtrema({
      smallestCm: 10,
      largestCm: 51,
    })
    expect(bounds.midBoundaryCm).toBeCloseTo(10 * THICKNESS_CATALOG_MIN_HEADROOM, 5)
    expect(bounds.maxBoundaryCm).toBeCloseTo(51 * THICKNESS_CATALOG_MAX_FOOTROOM, 5)
    expect(classifyThicknessBand(10, bounds)).toBe('min')
    expect(classifyThicknessBand(20, bounds)).toBe('mid')
    expect(classifyThicknessBand(51, bounds)).toBe('max')
  })

  it('is gelijk aan 40/80 van 30 bij factory 10/30', () => {
    const extrema = deriveBandBoundariesFromCatalogExtrema({
      smallestCm: 10,
      largestCm: 30,
    })
    expect(extrema.midBoundaryCm).toBeCloseTo(30 * THICKNESS_BAND_MID_RATIO, 5)
    expect(extrema.maxBoundaryCm).toBeCloseTo(30 * THICKNESS_BAND_MAX_RATIO, 5)
  })

  it('valt terug op 40/80 van de grootste als drempels overlappen', () => {
    const bounds = deriveBandBoundariesFromCatalogExtrema({
      smallestCm: 20,
      largestCm: 22,
    })
    expect(bounds.midBoundaryCm).toBeCloseTo(22 * THICKNESS_BAND_MID_RATIO, 5)
    expect(bounds.maxBoundaryCm).toBeCloseTo(22 * THICKNESS_BAND_MAX_RATIO, 5)
  })

  it('faalt zonder positieve extremen', () => {
    expect(() =>
      deriveBandBoundariesFromCatalogExtrema({ smallestCm: 0, largestCm: 30 }),
    ).toThrow(/catalogus|extremen/i)
  })
})
