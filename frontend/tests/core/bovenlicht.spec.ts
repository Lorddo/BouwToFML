import { describe, expect, it } from 'vitest'
import {
  BOVENLICHT_GAP_CM,
  BOVENLICHT_HEIGHT_CM,
  buildBovenlichtOpening,
  resolveDoorBovenlicht,
  resolveWindowBovenlicht,
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

const windowOpening = (overrides: Partial<Opening> = {}): Opening => ({
  refid: CONCEPT_WINDOW_REFID,
  t: 0.5,
  width: 120,
  type: 'window',
  z: 70,
  z_height: 150,
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

describe('resolveWindowBovenlicht', () => {
  it('erft projectdefault zonder override', () => {
    expect(resolveWindowBovenlicht(windowOpening(), false)).toBe(false)
    expect(resolveWindowBovenlicht(windowOpening(), true)).toBe(true)
  })

  it('forceert true/false override', () => {
    expect(resolveWindowBovenlicht(windowOpening({ bovenlicht: true }), false)).toBe(true)
    expect(resolveWindowBovenlicht(windowOpening({ bovenlicht: false }), true)).toBe(false)
  })

  it('negeert deuren', () => {
    expect(resolveWindowBovenlicht(door({ bovenlicht: true }), true)).toBe(false)
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

  it('plaatst raam 10 cm boven bestaand raam (sill + hoogte)', () => {
    const opening = buildBovenlichtOpening(windowOpening({ guid: 'win001' }))
    expect(opening).toMatchObject({
      type: 'window',
      t: 0.5,
      width: 120,
      z: 70 + 150 + BOVENLICHT_GAP_CM,
      z_height: BOVENLICHT_HEIGHT_CM,
      guid: 'win001-bovenlicht',
    })
  })

  it('respecteert custom gapCm en heightCm', () => {
    const opening = buildBovenlichtOpening(door({ guid: 'custom' }), {
      gapCm: 5,
      heightCm: 30,
    })
    expect(opening).toMatchObject({
      z: 225,
      z_height: 30,
      guid: 'custom-bovenlicht',
    })
  })

  it('clampt hoogte binnen floorHeight', () => {
    const opening = buildBovenlichtOpening(door({ z_height: 250 }), { floorHeightCm: 280 })
    expect(opening?.z).toBe(260)
    expect(opening?.z_height).toBe(20)
  })

  it('plaatst zonder gap als 10 cm erbij niet past', () => {
    // Deur 275, vloer 280: gap zou z=285 → plaats op deur, 5 cm glas
    const opening = buildBovenlichtOpening(door({ z_height: 275 }), { floorHeightCm: 280 })
    expect(opening).toMatchObject({ z: 275, z_height: 5 })
  })

  it('slaat over als deur tot plafond reikt', () => {
    expect(buildBovenlichtOpening(door({ z_height: 280 }), { floorHeightCm: 280 })).toBeNull()
  })
})
