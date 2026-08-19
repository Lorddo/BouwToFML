import { describe, expect, it } from 'vitest'
import {
  displayAreaLabel,
  effectiveRoomTypeColor,
  factoryRoomTypeColor,
  listRoomTypes,
  normalizeRoomTagColors,
  resolveRoomType,
  UNLABELED_AREA_COLOR,
} from '@/core/fml/roomtype-catalog'
import { AREA_MATCH_IOU, rebuildAreasFromHoles } from '@/core/fml/area-match'
import type { FloorArea } from '@/core/fml/types'

describe('roomtype-catalog', () => {
  it('resolveert House-roles naar NL name + fabriekskleur', () => {
    const kitchen = resolveRoomType(2)
    expect(kitchen?.name).toBe('Keuken')
    expect(kitchen?.color).toMatch(/^#[0-9A-F]{6}$/)
    expect(listRoomTypes().some((e) => e.role === 10 && e.name === 'Kast')).toBe(true)
  })

  it('effectiveRoomTypeColor: settings-override wint', () => {
    expect(effectiveRoomTypeColor(2)).toBe(factoryRoomTypeColor(2))
    expect(effectiveRoomTypeColor(2, { '2': '#112233' })).toBe('#112233')
    expect(effectiveRoomTypeColor(null)).toBe(UNLABELED_AREA_COLOR)
  })

  it('normalizeRoomTagColors drop onbekende roles en gelijke fabriek', () => {
    const factory = factoryRoomTypeColor(2)
    const out = normalizeRoomTagColors({
      '2': '#AABBCC',
      '999': '#000000',
      '3': factoryRoomTypeColor(3),
      bad: 'nope',
    })
    expect(out).toEqual({ '2': '#AABBCC' })
    // gelijke fabriek mag weg
    expect(normalizeRoomTagColors({ '2': factory })).toEqual({})
  })

  it('displayAreaLabel prefer customName', () => {
    expect(displayAreaLabel({ name: 'Kast', customName: 'MK' })).toBe('MK')
    expect(displayAreaLabel({ name: 'Kast' })).toBe('Kast')
    expect(displayAreaLabel({})).toBeNull()
  })
})

describe('rebuildAreasFromHoles', () => {
  const rect = (x0: number, y0: number, w: number, h: number) => [
    { x: x0, y: y0 },
    { x: x0 + w, y: y0 },
    { x: x0 + w, y: y0 + h },
    { x: x0, y: y0 + h },
  ]

  it('maakt unlabeled areas voor nieuwe holes', () => {
    const areas = rebuildAreasFromHoles([rect(0, 0, 200, 200)], undefined)
    expect(areas).toHaveLength(1)
    expect(areas[0].role).toBeUndefined()
    expect(areas[0].color).toBe(UNLABELED_AREA_COLOR)
    expect(areas[0].poly).toHaveLength(4)
  })

  it('behoudt tags via IoU bij kleine verschuiving', () => {
    const prev: FloorArea[] = [
      {
        id: 'keep-me',
        poly: rect(0, 0, 200, 200),
        role: 10,
        name: 'Kast',
        customName: 'MK',
        color: '#E0BF8F',
        showAreaLabel: true,
      },
    ]
    const nextHole = rect(5, 5, 200, 200)
    const areas = rebuildAreasFromHoles([nextHole], prev)
    expect(areas).toHaveLength(1)
    expect(areas[0].id).toBe('keep-me')
    expect(areas[0].role).toBe(10)
    expect(areas[0].customName).toBe('MK')
    expect(areas[0].color).toBe('#E0BF8F')
  })

  it('dropte degenerate holes', () => {
    expect(rebuildAreasFromHoles([rect(0, 0, 5, 5)], undefined)).toEqual([])
  })

  it('IoU-drempel is vastgelegd', () => {
    expect(AREA_MATCH_IOU).toBe(0.4)
  })
})
