import { describe, expect, it } from 'vitest'
import { scaleMinPixels } from '@/cv/port/despeckle'

describe('scaleMinPixels', () => {
  it('houdt minimum gelijk op referentie-resolutie', () => {
    expect(scaleMinPixels(20, 1000, 800)).toBe(20)
  })

  it('schaalt omhoog op hogere resolutie', () => {
    const scaled = scaleMinPixels(20, 2000, 1600)
    expect(scaled).toBeGreaterThan(20)
    expect(scaled).toBe(80)
  })

  it('geeft 0 terug voor niet-positieve input', () => {
    expect(scaleMinPixels(0, 4000, 3000)).toBe(0)
    expect(scaleMinPixels(undefined, 4000, 3000)).toBe(0)
  })
})
