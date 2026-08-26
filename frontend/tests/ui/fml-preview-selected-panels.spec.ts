import { describe, expect, it } from 'vitest'
import type { Wall } from '@/core/fml/types'
import { buildSelectedJunctionPanel } from '@/ui/composables/fml-preview/fml-preview-selected-panels'

function wall(partial: Partial<Wall> & Pick<Wall, 'id' | 'a' | 'b'>): Wall {
  return {
    thickness: 20,
    openings: [],
    ...partial,
  }
}

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
