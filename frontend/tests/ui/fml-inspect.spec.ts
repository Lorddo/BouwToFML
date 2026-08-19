import { describe, expect, it } from 'vitest'
import {
  INSPECT_COLOR_DONE,
  INSPECT_COLOR_OPEN,
  cycleInspectColor,
  inspectColorFor,
  inspectKindLabel,
  pickInspectTarget,
  resolveInspectFill,
} from '@/ui/composables/fml-preview/fml-inspect'

describe('resolveInspectFill', () => {
  it('uses fallback when id has no color', () => {
    expect(resolveInspectFill('w1', {}, '#111827')).toBe('#111827')
    expect(resolveInspectFill('w1', undefined, '#111827')).toBe('#111827')
  })

  it('uses #RRGGBB override and ignores invalid hex', () => {
    expect(resolveInspectFill('w1', { w1: '#22c55e' }, '#111827')).toBe('#22c55e')
    expect(resolveInspectFill('w1', { w1: 'green' }, '#111827')).toBe('#111827')
    expect(resolveInspectFill('w1', { w1: '#fff' }, '#111827')).toBe('#111827')
  })
})

describe('inspectColorFor', () => {
  it('returns undefined when missing', () => {
    expect(inspectColorFor('w1', { w2: '#f59e0b' })).toBeUndefined()
  })
})

describe('cycleInspectColor', () => {
  it('cycles none → open → done → none', () => {
    expect(cycleInspectColor(undefined)).toBe(INSPECT_COLOR_OPEN)
    expect(cycleInspectColor(INSPECT_COLOR_OPEN)).toBe(INSPECT_COLOR_DONE)
    expect(cycleInspectColor(INSPECT_COLOR_DONE)).toBeUndefined()
    expect(cycleInspectColor('#2563eb')).toBeUndefined()
  })
})

describe('inspectKindLabel', () => {
  it('labels kinds in Dutch', () => {
    expect(inspectKindLabel('wall')).toBe('Muur')
    expect(inspectKindLabel('door')).toBe('Deur')
    expect(inspectKindLabel('window')).toBe('Raam')
    expect(inspectKindLabel('area')).toBe('Kamer')
    expect(inspectKindLabel('surface')).toBe('Vlak')
    expect(inspectKindLabel('item')).toBe('Object')
  })
})

describe('pickInspectTarget', () => {
  const opening = {
    compositeId: 'w1-door-abc123',
    guid: 'abc123',
    type: 'door' as const,
    wallId: 'w1',
  }

  it('emits opening.guid, not the composite id', () => {
    const picked = pickInspectTarget({
      opening,
      surface: { id: 's1', isCutout: false },
      area: { id: 'a1' },
      wall: { id: 'w1' },
    })
    expect(picked).toEqual({
      kind: 'door',
      id: 'abc123',
      wallId: 'w1',
      compositeOpeningId: 'w1-door-abc123',
    })
  })

  it('lets a window win over area', () => {
    const picked = pickInspectTarget({
      opening: { ...opening, type: 'window', guid: 'win-9' },
      surface: null,
      area: { id: 'a1' },
      wall: { id: 'w1' },
    })
    expect(picked?.kind).toBe('window')
    expect(picked?.id).toBe('win-9')
  })

  it('picks a fixture before surface, wall or area', () => {
    const picked = pickInspectTarget({
      opening: null,
      item: { id: 'item-1' },
      surface: { id: 's1', isCutout: false },
      area: { id: 'a1' },
      wall: { id: 'w1' },
    })
    expect(picked).toEqual({ kind: 'item', id: 'item-1' })
  })

  it('skips cutout surfaces', () => {
    const picked = pickInspectTarget({
      opening: null,
      surface: { id: 'cut', isCutout: true },
      area: { id: 'a1' },
      wall: { id: 'w1' },
    })
    expect(picked).toEqual({ kind: 'wall', id: 'w1' })
  })

  it('picks surface before wall or area', () => {
    const picked = pickInspectTarget({
      opening: null,
      surface: { id: 's1', isCutout: false },
      area: { id: 'a1' },
      wall: { id: 'w1' },
    })
    expect(picked).toEqual({ kind: 'surface', id: 's1' })
  })

  it('picks wall on the room edge, not the area behind it', () => {
    const picked = pickInspectTarget({
      opening: null,
      surface: null,
      area: { id: 'a1' },
      wall: { id: 'w1' },
    })
    expect(picked).toEqual({ kind: 'wall', id: 'w1' })
  })

  it('picks area in the interior (no wall/surface)', () => {
    const picked = pickInspectTarget({
      opening: null,
      surface: null,
      area: { id: 'a1' },
      wall: null,
    })
    expect(picked).toEqual({ kind: 'area', id: 'a1' })
  })

  it('returns null when nothing is hit', () => {
    expect(
      pickInspectTarget({
        opening: null,
        surface: null,
        area: null,
        wall: null,
      }),
    ).toBeNull()
  })
})
