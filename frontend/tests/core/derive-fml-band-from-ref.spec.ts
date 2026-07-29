import { describe, expect, it } from 'vitest'
import {
  classifyFmlThicknessBand,
  deriveFmlBandBoundariesCmFromRefPx,
  FML_BAND_MAX_RATIO,
  FML_BAND_MID_RATIO,
} from '@/core/fml/fml-wall-thickness-tiers'

describe('deriveFmlBandBoundariesCmFromRefPx', () => {
  it('leidt 40% en 85% bandgrenzen af uit referentie px + schaal', () => {
    const boundaries = deriveFmlBandBoundariesCmFromRefPx(60, 0.2, 0.2)
    expect(boundaries.midBoundaryCm).toBe(12)
    expect(boundaries.maxBoundaryCm).toBe(25.5)
  })

  it('classificeert ratio-banden rond referentie-muur', () => {
    const refPx = 60
    const pxPerMm = 0.2
    const boundaries = deriveFmlBandBoundariesCmFromRefPx(refPx, pxPerMm, pxPerMm)
    const refCm = refPx / pxPerMm / 10

    expect(classifyFmlThicknessBand(refCm * 0.3, boundaries)).toBe('min')
    expect(classifyFmlThicknessBand(refCm * FML_BAND_MID_RATIO, boundaries)).toBe('mid')
    expect(classifyFmlThicknessBand(refCm * 0.7, boundaries)).toBe('mid')
    expect(classifyFmlThicknessBand(refCm * FML_BAND_MAX_RATIO, boundaries)).toBe('mid')
    expect(classifyFmlThicknessBand(refCm * 0.86, boundaries)).toBe('max')
    expect(classifyFmlThicknessBand(refCm, boundaries)).toBe('max')
  })
})
