import { describe, expect, it } from 'vitest'
import {
  BOVENLICHT_GAP_CM,
  BOVENLICHT_HEIGHT_CM,
  buildBovenlichtOpening,
  resolveDoorBovenlicht,
} from '@/core/fml/bovenlicht'
import { CONCEPT_WINDOW_REFID, type Opening } from '@/core/fml/types'

const door = (overrides: Partial<Opening> = {}): Opening => ({
  refid: '0434246537840a3326e305dbe7b9c355743e6e93',
  t: 0.5,
  width: 90,
  type: 'door',
  z_height: 220,
  ...overrides,
})

describe('resolveDoorBovenlicht', () => {
  it('erft projectdefault zonder override', () => {
    expect(resolveDoorBovenlicht(door(), false)).toBe(false)
    expect(resolveDoorBovenlicht(door(), true)).toBe(true)
  })

  it('forceert true/false override', () => {
    expect(resolveDoorBovenlicht(door({ bovenlicht: true }), false)).toBe(true)
    expect(resolveDoorBovenlicht(door({ bovenlicht: false }), true)).toBe(false)
  })

  it('negeert windows', () => {
    expect(resolveDoorBovenlicht({ ...door(), type: 'window', bovenlicht: true }, true)).toBe(false)
  })
})

describe('buildBovenlichtOpening', () => {
  it('plaatst raam 10 cm boven deur, 40 cm hoog, zelfde breedte/t', () => {
    const opening = buildBovenlichtOpening(door({ guid: 'abcdef' }))
    expect(opening).toMatchObject({
      type: 'window',
      refid: CONCEPT_WINDOW_REFID,
      t: 0.5,
      width: 90,
      z: 220 + BOVENLICHT_GAP_CM,
      z_height: BOVENLICHT_HEIGHT_CM,
      guid: 'abcdef-bovenlicht',
      mirrored: [0, 0],
    })
  })

  it('clampt hoogte binnen floorHeight', () => {
    const opening = buildBovenlichtOpening(door({ z_height: 250 }), { floorHeightCm: 280 })
    expect(opening?.z).toBe(260)
    expect(opening?.z_height).toBe(20)
  })

  it('slaat over als z >= floorHeight', () => {
    expect(buildBovenlichtOpening(door({ z_height: 280 }), { floorHeightCm: 280 })).toBeNull()
  })
})
