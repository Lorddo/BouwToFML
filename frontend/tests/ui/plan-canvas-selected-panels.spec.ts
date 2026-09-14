import { describe, expect, it } from 'vitest'
import type { Wall } from '@/core/plan/types'
import type { RenderModel } from '@/ui/composables/plan-canvas/plan-canvas-render-types'
import {
  buildSelectedJunctionPanel,
  buildSelectedWallPanel,
} from '@/ui/composables/plan-canvas/plan-canvas-selected-panels'

function wall(partial: Partial<Wall> & Pick<Wall, 'id' | 'a' | 'b'>): Wall {
  return {
    thickness: 20,
    openings: [],
    ...partial,
  }
}

function wallModel(item: Wall): RenderModel {
  return {
    wallLines: [
      {
        id: item.id,
        wall: item,
        points: [],
        strokeWidth: 1,
        a: item.a,
        b: item.b,
      },
    ],
    ridgeLines: [],
  } as unknown as RenderModel
}

describe('buildSelectedWallPanel', () => {
  it('zet quick vs full op de muur-strip', () => {
    const model = wallModel(wall({ id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }))
    expect(buildSelectedWallPanel(model, ['w1'], 280)?.mode).toBe('full')
    expect(buildSelectedWallPanel(model, ['w1'], 280, 'quick')?.mode).toBe('quick')
    expect(buildSelectedWallPanel(model, ['w1'], 280, 'full')?.canSplit).toBe(true)
  })
})

describe('buildSelectedJunctionPanel', () => {
  it('toont knoophoogte ook als aangesloten muren verschillende hoogtes hebben', () => {
    const walls = [
      wall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        extras: { az: { z: 0, h: 250 }, bz: { z: 0, h: 250 } },
      }),
      wall({
        id: 'w2',
        a: { x: 100, y: 0 },
        b: { x: 100, y: 80 },
        extras: { az: { z: 0, h: 300 }, bz: { z: 0, h: 300 } },
      }),
    ]
    const panel = buildSelectedJunctionPanel(
      walls,
      {
        id: 'j1',
        refs: [
          { wallId: 'w1', end: 'b' },
          { wallId: 'w2', end: 'a' },
        ],
      },
      280,
    )
    expect(panel).toMatchObject({
      heightCm: 250,
      heightMixed: false,
      bottomZCm: 0,
      bottomZMixed: false,
    })
  })
})
