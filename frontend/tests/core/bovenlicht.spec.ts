import { describe, expect, it } from 'vitest'
import {
  BOVENLICHT_GAP_CM,
  BOVENLICHT_HEIGHT_CM,
  buildBovenlichtOpening,
  foldBovenlichtOnWall,
  resolveBovenlichtGapCm,
  resolveBovenlichtHeightCm,
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

describe('resolveBovenlichtHeightCm / GapCm', () => {
  it('erft vloerdefault zonder override', () => {
    expect(resolveBovenlichtHeightCm(door(), 40)).toBe(40)
    expect(resolveBovenlichtGapCm(door(), 10)).toBe(10)
  })

  it('forceert override', () => {
    expect(resolveBovenlichtHeightCm(door({ bovenlichtHeightCm: 25 }), 40)).toBe(25)
    expect(resolveBovenlichtGapCm(door({ bovenlichtGapCm: 5 }), 10)).toBe(5)
  })

  it('accepteert gap 0 als override', () => {
    expect(resolveBovenlichtGapCm(door({ bovenlichtGapCm: 0 }), 10)).toBe(0)
  })

  it('valt terug bij negatief of NaN', () => {
    expect(resolveBovenlichtHeightCm(door({ bovenlichtHeightCm: -4 }), 40)).toBe(40)
    expect(resolveBovenlichtHeightCm(door({ bovenlichtHeightCm: Number.NaN }), 40)).toBe(40)
    expect(resolveBovenlichtGapCm(door({ bovenlichtGapCm: -1 }), 10)).toBe(10)
    expect(resolveBovenlichtGapCm(door({ bovenlichtGapCm: Number.NaN }), 10)).toBe(10)
  })

  it('valt terug op fabriek als floor-default ongeldig is', () => {
    expect(resolveBovenlichtHeightCm(door(), Number.NaN)).toBe(BOVENLICHT_HEIGHT_CM)
    expect(resolveBovenlichtGapCm(door(), -8)).toBe(BOVENLICHT_GAP_CM)
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

describe('foldBovenlichtOnWall', () => {
  const WALL_LEN = 200

  it('vouwt eigen export-guid terug (checkmark + maten, raam weg)', () => {
    const parent = door({ guid: 'door001', t: 0.4, width: 90 })
    const transom = buildBovenlichtOpening(parent)!
    const folded = foldBovenlichtOnWall([parent, transom], WALL_LEN)
    expect(folded).toHaveLength(1)
    expect(folded[0]).toMatchObject({
      type: 'door',
      guid: 'door001',
      bovenlicht: true,
      bovenlichtHeightCm: BOVENLICHT_HEIGHT_CM,
      bovenlichtGapCm: BOVENLICHT_GAP_CM,
    })
  })

  it('Staedion-achtig: gap 0 en height 30 blijven expliciet (geen fabriek-10)', () => {
    // Δt × 200 ≈ 2 cm — binnen MATCH_AXIS 3 cm
    const folded = foldBovenlichtOnWall(
      [
        door({ t: 0.5, width: 93, z_height: 220 }),
        {
          refid: '218',
          type: 'window',
          t: 0.51,
          width: 93,
          z: 220,
          z_height: 30,
        },
      ],
      WALL_LEN,
    )
    expect(folded).toHaveLength(1)
    expect(folded[0]).toMatchObject({
      type: 'door',
      bovenlicht: true,
      bovenlichtHeightCm: 30,
      bovenlichtGapCm: 0,
    })
    expect(resolveBovenlichtGapCm(folded[0], BOVENLICHT_GAP_CM)).toBe(0)
  })

  it('vouwt raam-boven-raam (sill + hoogte → gap)', () => {
    const folded = foldBovenlichtOnWall(
      [
        windowOpening({ t: 0.3, width: 120, z: 70, z_height: 150 }),
        {
          refid: CONCEPT_WINDOW_REFID,
          type: 'window',
          t: 0.3,
          width: 120,
          z: 230,
          z_height: 40,
        },
      ],
      WALL_LEN,
    )
    expect(folded).toHaveLength(1)
    expect(folded[0]).toMatchObject({
      type: 'window',
      bovenlicht: true,
      bovenlichtHeightCm: 40,
      bovenlichtGapCm: 10,
    })
  })

  it('laat non-match staan (te grote Δt of andere width)', () => {
    const wide = foldBovenlichtOnWall(
      [
        door({ t: 0.5, width: 90 }),
        { refid: '218', type: 'window', t: 0.5, width: 100, z: 230, z_height: 40 },
      ],
      WALL_LEN,
    )
    expect(wide).toHaveLength(2)

    // Δt × 200 = 10 cm > MATCH_AXIS 3
    const far = foldBovenlichtOnWall(
      [
        door({ t: 0.5, width: 90 }),
        { refid: '218', type: 'window', t: 0.55, width: 90, z: 230, z_height: 40 },
      ],
      WALL_LEN,
    )
    expect(far).toHaveLength(2)
  })
})
