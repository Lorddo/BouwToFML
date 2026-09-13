import { describe, expect, it } from 'vitest'
import {
  collectAllOfBoxKind,
  collectBoxSelectHits,
  findOpeningsFullyInCmBBox,
  findWallsFullyInCmBBox,
  listOpeningIdsByType,
  normalizeCmBBox,
  openingCmBBox,
  wallCmBBox,
} from '@/ui/composables/plan-canvas/plan-canvas-wall-select'

describe('normalizeCmBBox', () => {
  it('normaliseert signed drag (bottom→top / right→left) naar positieve size', () => {
    expect(normalizeCmBBox({ x: 100, y: 80, width: -60, height: -40 })).toEqual({
      x: 40,
      y: 40,
      width: 60,
      height: 40,
    })
    expect(normalizeCmBBox({ x: 40, y: 40, width: 60, height: 40 })).toEqual({
      x: 40,
      y: 40,
      width: 60,
      height: 40,
    })
  })
})

describe('findWallsFullyInCmBBox', () => {
  const walls = [
    { id: 'w1', a: { x: 10, y: 10 }, b: { x: 90, y: 10 }, thickness: 20, openings: [] },
    { id: 'w2', a: { x: 10, y: 50 }, b: { x: 90, y: 50 }, thickness: 20, openings: [] },
    { id: 'w3', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, openings: [] },
  ]

  it('selecteert alleen muren volledig binnen bbox', () => {
    expect(findWallsFullyInCmBBox(walls, { x: 0, y: 0, width: 100, height: 30 })).toEqual(['w1'])
    expect(findWallsFullyInCmBBox(walls, { x: 0, y: 0, width: 100, height: 70 })).toEqual([
      'w1',
      'w2',
    ])
    expect(findWallsFullyInCmBBox(walls, { x: 20, y: 0, width: 60, height: 30 })).toEqual([])
  })

  it('selecteert hetzelfde bij signed bbox (bottom→top drag)', () => {
    expect(findWallsFullyInCmBBox(walls, { x: 100, y: 30, width: -100, height: -30 })).toEqual([
      'w1',
    ])
  })

  it('houdt rekening met muurdikte in bbox', () => {
    const bbox = wallCmBBox(walls[0])
    expect(findWallsFullyInCmBBox(walls, bbox)).toEqual(['w1'])
    expect(
      findWallsFullyInCmBBox(walls, {
        x: bbox.x + 1,
        y: bbox.y + 1,
        width: bbox.width - 2,
        height: bbox.height - 2,
      }),
    ).toEqual([])
  })
})

describe('findOpeningsFullyInCmBBox', () => {
  const walls = [
    {
      id: 'w1',
      a: { x: 0, y: 10 },
      b: { x: 200, y: 10 },
      thickness: 20,
      openings: [
        { id: 'd1', kind: 'door.single' as const, t: 0.25, width: 90, type: 'door' as const },
        { id: 'win1', kind: 'window.single' as const, t: 0.75, width: 100, type: 'window' as const },
      ],
    },
    {
      id: 'w2',
      a: { x: 0, y: 80 },
      b: { x: 200, y: 80 },
      thickness: 20,
      openings: [{ id: 'd2', kind: 'door.single' as const, t: 0.5, width: 80, type: 'door' as const }],
    },
  ]

  it('selecteert alleen deuren volledig binnen bbox', () => {
    expect(
      findOpeningsFullyInCmBBox(walls, { x: 0, y: 0, width: 110, height: 30 }, 'door'),
    ).toEqual(['w1-door-d1'])
    expect(
      findOpeningsFullyInCmBBox(walls, { x: 0, y: 0, width: 200, height: 100 }, 'door'),
    ).toEqual(['w1-door-d1', 'w2-door-d2'])
  })

  it('negeert ramen bij deur-filter (en omgekeerd)', () => {
    expect(
      findOpeningsFullyInCmBBox(walls, { x: 0, y: 0, width: 200, height: 30 }, 'window'),
    ).toEqual(['w1-window-win1'])
    expect(
      findOpeningsFullyInCmBBox(walls, { x: 0, y: 0, width: 200, height: 30 }, 'door'),
    ).toEqual(['w1-door-d1'])
  })

  it('houdt rekening met openingsbreedte (niet alleen centrum)', () => {
    const door = walls[0].openings[0]
    const bbox = openingCmBBox(walls[0], door)
    expect(findOpeningsFullyInCmBBox(walls, bbox, 'door')).toEqual(['w1-door-d1'])
    expect(
      findOpeningsFullyInCmBBox(
        walls,
        {
          x: bbox.x + 1,
          y: bbox.y + 1,
          width: bbox.width - 2,
          height: bbox.height - 2,
        },
        'door',
      ),
    ).toEqual([])
  })

  it('listOpeningIdsByType somt alle ids van dat type', () => {
    expect(listOpeningIdsByType(walls, 'door')).toEqual(['w1-door-d1', 'w2-door-d2'])
    expect(listOpeningIdsByType(walls, 'window')).toEqual(['w1-window-win1'])
    expect(listOpeningIdsByType(walls)).toEqual(['w1-door-d1', 'w1-window-win1', 'w2-door-d2'])
  })
})

describe('collectBoxSelectHits / collectAllOfBoxKind', () => {
  const walls = [
    {
      id: 'w1',
      a: { x: 0, y: 10 },
      b: { x: 200, y: 10 },
      thickness: 20,
      openings: [
        { id: 'd1', kind: 'door.single' as const, t: 0.25, width: 90, type: 'door' as const },
        { id: 'win1', kind: 'window.single' as const, t: 0.75, width: 100, type: 'window' as const },
      ],
    },
    {
      id: 'w2',
      a: { x: 0, y: 80 },
      b: { x: 200, y: 80 },
      thickness: 20,
      openings: [{ id: 'd2', kind: 'door.single' as const, t: 0.5, width: 80, type: 'door' as const }],
    },
  ]

  it('all (mixed) pakt muren én openingen in dezelfde bbox', () => {
    expect(collectBoxSelectHits(walls, { x: -20, y: -5, width: 240, height: 40 }, 'all')).toEqual({
      wallIds: ['w1'],
      openingIds: ['w1-door-d1', 'w1-window-win1'],
    })
  })

  it('collectAllOfBoxKind pakt de hele floor per categorie', () => {
    expect(collectAllOfBoxKind(walls, 'wall')).toEqual({
      wallIds: ['w1', 'w2'],
      openingIds: [],
    })
    expect(collectAllOfBoxKind(walls, 'door')).toEqual({
      wallIds: [],
      openingIds: ['w1-door-d1', 'w2-door-d2'],
    })
    expect(collectAllOfBoxKind(walls, 'window')).toEqual({
      wallIds: [],
      openingIds: ['w1-window-win1'],
    })
    expect(collectAllOfBoxKind(walls, 'all')).toEqual({
      wallIds: ['w1', 'w2'],
      openingIds: ['w1-door-d1', 'w1-window-win1', 'w2-door-d2'],
    })
  })
})
