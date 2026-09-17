import { describe, expect, it } from 'vitest'
import { buildOpeningFromPreset } from '@/core/plan/opening-from-preset'

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

  it('schrijft Settings-frame op deur/raam', () => {
    const door = buildOpeningFromPreset({
      type: 'door',
      doorSubtype: 'standard',
      windowSubtype: 'single',
      widthCm: 90,
      heightCm: 220,
      sillZCm: 0,
      t: 0.5,
      frame: { leftCm: 7, rightCm: 7, topCm: 7, bottomCm: 0 },
    })
    expect(door.frame).toEqual({ leftCm: 7, rightCm: 7, topCm: 7, bottomCm: 0 })

    const window = buildOpeningFromPreset({
      type: 'window',
      doorSubtype: 'standard',
      windowSubtype: 'single',
      widthCm: 100,
      heightCm: 150,
      sillZCm: 70,
      t: 0.4,
      frame: { leftCm: 6, rightCm: 6, topCm: 6, bottomCm: 6 },
    })
    expect(window.frame).toEqual({ leftCm: 6, rightCm: 6, topCm: 6, bottomCm: 6 })
  })

  it('passage/boog krijgen geen frame ondanks defaults', () => {
    const passage = buildOpeningFromPreset({
      type: 'door',
      doorSubtype: 'passage',
      windowSubtype: 'single',
      widthCm: 90,
      heightCm: 220,
      sillZCm: 0,
      t: 0.5,
      frame: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 0 },
    })
    expect(passage.frame).toBeUndefined()

    const archway = buildOpeningFromPreset({
      type: 'door',
      doorSubtype: 'archway',
      windowSubtype: 'single',
      widthCm: 90,
      heightCm: 220,
      sillZCm: 0,
      t: 0.5,
      frame: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 0 },
    })
    expect(archway.frame).toBeUndefined()
  })
})
