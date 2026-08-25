import { describe, expect, it } from 'vitest'
import { buildOpeningFromPreset } from '@/core/fml/opening-from-preset'

describe('buildOpeningFromPreset', () => {
  it('zet deur-dorpel uit sillZCm (niet hard 0)', () => {
    const opening = buildOpeningFromPreset({
      type: 'door',
      doorSubtype: 'standard',
      windowSubtype: 'single',
      widthCm: 90,
      heightCm: 220,
      sillZCm: 15,
      t: 0.5,
    })
    expect(opening.z).toBe(15)
    expect(opening.z_height).toBe(220)
  })

  it('zet raam-dorpel uit sillZCm', () => {
    const opening = buildOpeningFromPreset({
      type: 'window',
      doorSubtype: 'standard',
      windowSubtype: 'single',
      widthCm: 100,
      heightCm: 150,
      sillZCm: 70,
      t: 0.4,
    })
    expect(opening.z).toBe(70)
    expect(opening.z_height).toBe(150)
  })
})
