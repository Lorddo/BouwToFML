import { describe, expect, it } from 'vitest'
import { CONCEPT_WINDOW_REFID, type Opening } from '@/core/fml/types'
import { computeOpeningDraftState } from '@/ui/composables/fml-preview/fml-preview-opening-draft'

const door = (overrides: Partial<Opening> = {}): Opening => ({
  refid: '0434246537840a3326e305dbe7b9c355743e6e93',
  t: 0.5,
  width: 90,
  type: 'door',
  z_height: 220,
  ...overrides,
})

const windowOpening = (overrides: Partial<Opening> = {}): Opening => ({
  refid: CONCEPT_WINDOW_REFID,
  t: 0.5,
  width: 120,
  type: 'window',
  z: 70,
  z_height: 150,
  ...overrides,
})

describe('computeOpeningDraftState — bovenlicht measures', () => {
  it('toont vloerdefault zonder override', () => {
    const draft = computeOpeningDraftState([door()], {
      bovenlichtHeightCm: 35,
      bovenlichtGapCm: 8,
    })
    expect(draft?.bovenlichtHeightCm).toBe(35)
    expect(draft?.bovenlichtHeightMixed).toBe(false)
    expect(draft?.bovenlichtGapCm).toBe(8)
    expect(draft?.bovenlichtGapMixed).toBe(false)
  })

  it('mixed als één opening een maat-override heeft', () => {
    const draft = computeOpeningDraftState(
      [door(), door({ bovenlichtHeightCm: 25, bovenlichtGapCm: 5 })],
      { bovenlichtHeightCm: 40, bovenlichtGapCm: 10 },
    )
    expect(draft?.bovenlichtHeightMixed).toBe(true)
    expect(draft?.bovenlichtGapMixed).toBe(true)
    expect(draft?.bovenlichtHeightCm).toBe(40)
    expect(draft?.bovenlichtGapCm).toBe(10)
  })

  it('erft floor-maten ook voor ramen', () => {
    const draft = computeOpeningDraftState([windowOpening({ bovenlichtHeightCm: 30 })], {
      bovenlichtHeightCm: 40,
      bovenlichtGapCm: 12,
    })
    expect(draft?.bovenlichtHeightCm).toBe(30)
    expect(draft?.bovenlichtGapCm).toBe(12)
    expect(draft?.bovenlichtHeightMixed).toBe(false)
  })
})
