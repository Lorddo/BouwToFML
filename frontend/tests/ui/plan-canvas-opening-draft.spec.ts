import { describe, expect, it } from 'vitest'
import { type Opening } from '@/core/plan/types'
import { computeOpeningDraftState } from '@/ui/composables/plan-canvas/plan-canvas-opening-draft'

const door = (overrides: Partial<Opening> = {}): Opening => ({
  id: overrides.id ?? 'door-1',
  kind: 'door.single',
  t: 0.5,
  width: 90,
  type: 'door',
  z_height: 220,
  ...overrides,
})

const windowOpening = (overrides: Partial<Opening> = {}): Opening => ({
  id: overrides.id ?? 'window-1',
  kind: 'window.single',
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

  it('leest spiegelstand van een driehoekraam', () => {
    const draft = computeOpeningDraftState([
      windowOpening({ kind: 'window.triangle', mirrored: [1, 0] }),
    ])
    expect(draft?.subtype).toBe('triangle')
    expect(draft?.hingeAtStart).toBe(false)
    expect(draft?.hingeMixed).toBe(false)
  })
})

describe('computeOpeningDraftState — kozijn', () => {
  it('zonder frame toont catalogus (raam 5 rondom, deur dorpel 0)', () => {
    const windowDraft = computeOpeningDraftState([windowOpening()])
    expect(windowDraft?.frameLeftCm).toBe(5)
    expect(windowDraft?.frameRightCm).toBe(5)
    expect(windowDraft?.frameTopCm).toBe(5)
    expect(windowDraft?.frameBottomCm).toBe(5)
    expect(windowDraft?.frameLeftMixed).toBe(false)

    const doorDraft = computeOpeningDraftState([door()])
    expect(doorDraft?.frameBottomCm).toBe(0)
    expect(doorDraft?.frameLeftCm).toBe(5)
  })

  it('instance-frame wint van catalogus', () => {
    const draft = computeOpeningDraftState([
      windowOpening({
        frame: { leftCm: 12, rightCm: 8, topCm: 4, bottomCm: 10 },
      }),
    ])
    expect(draft?.frameLeftCm).toBe(12)
    expect(draft?.frameRightCm).toBe(8)
    expect(draft?.frameTopCm).toBe(4)
    expect(draft?.frameBottomCm).toBe(10)
  })

  it('mixed per kant bij verschillende frames', () => {
    const draft = computeOpeningDraftState([
      windowOpening({
        id: 'a',
        frame: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 5 },
      }),
      windowOpening({
        id: 'b',
        frame: { leftCm: 10, rightCm: 5, topCm: 5, bottomCm: 5 },
      }),
    ])
    expect(draft?.frameLeftMixed).toBe(true)
    expect(draft?.frameRightMixed).toBe(false)
    expect(draft?.frameLeftCm).toBe(5)
  })
})
