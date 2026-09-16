import { describe, expect, it } from 'vitest'
import {
  clampOpeningWidthKeepOppositeEdge,
  openingEdgesAlongWall,
} from '@/core/plan/opening-along-wall-resize'
import { MAX_OPENING_WIDTH_CM } from '@/core/plan/opening-plan-ops'
import {
  planOpeningHandlePointsCm,
  resizeOpeningAlongWallFromPointer,
} from '@/ui/composables/plan-canvas/plan-canvas-opening-handles'
import type { Opening, Wall } from '@/core/plan/types'

function wall(partial?: Partial<Wall>): Wall {
  return {
    id: 'w',
    a: { x: 0, y: 0 },
    b: { x: 400, y: 0 },
    thickness: 20,
    openings: [],
    ...partial,
  }
}

describe('opening-along-wall-resize', () => {
  it('end-resize houdt de startkant vast', () => {
    const host = wall({ b: { x: 1200, y: 0 } })
    const start = { t: 0.2, width: 100 }
    const startLeft = 0.2 * 1200 - 50
    const nextRight = startLeft + 600
    const patch = clampOpeningWidthKeepOppositeEdge(
      host,
      start,
      { t: (startLeft + nextRight) / 2 / 1200, width: 600 },
      'end',
    )
    expect(patch.width).toBe(600)
    expect(patch.t * 1200 - patch.width / 2).toBeCloseTo(startLeft, 5)
  })

  it('start-resize houdt de eindkant vast', () => {
    const host = wall({ b: { x: 400, y: 0 } })
    const start = { t: 0.5, width: 80 }
    const startRight = 0.5 * 400 + 40
    const patch = clampOpeningWidthKeepOppositeEdge(host, start, { t: 0.35, width: 140 }, 'start')
    expect(patch.t * 400 + patch.width / 2).toBeCloseTo(startRight, 5)
    expect(patch.width).toBeGreaterThan(80)
  })

  it('capteert op max-breedte zonder de vaste kant te verschuiven', () => {
    const host = wall({ b: { x: 3000, y: 0 } })
    const start = { t: 0.1, width: 80 }
    const startLeft = 0.1 * 3000 - 40
    const patch = clampOpeningWidthKeepOppositeEdge(
      host,
      start,
      { t: 0.6, width: MAX_OPENING_WIDTH_CM + 800 },
      'end',
    )
    expect(patch.width).toBe(MAX_OPENING_WIDTH_CM)
    expect(patch.t * 3000 - patch.width / 2).toBeCloseTo(startLeft, 5)
  })

  it('clamp aan muureinde houdt de vaste kant', () => {
    const host = wall({ b: { x: 200, y: 0 } })
    const start = { t: 0.7, width: 80 }
    const startLeft = 0.7 * 200 - 40
    const patch = clampOpeningWidthKeepOppositeEdge(host, start, { t: 0.85, width: 160 }, 'end')
    expect(patch.t * 200 - patch.width / 2).toBeCloseTo(startLeft, 5)
    expect(patch.t * 200 + patch.width / 2).toBeLessThanOrEqual(210)
  })

  it('start-resize over T houdt de overstekende eindkant', () => {
    const host = wall({
      id: 'gevel-l',
      b: { x: 200, y: 0 },
    })
    const neighbor: Wall = {
      id: 'gevel-r',
      a: { x: 200, y: 0 },
      b: { x: 400, y: 0 },
      thickness: 20,
      openings: [],
    }
    const start = { t: 1, width: 250 }
    const startRight = 200 + 125
    const patch = clampOpeningWidthKeepOppositeEdge(
      host,
      start,
      { t: 1.175, width: 180 },
      'start',
      [host, neighbor],
    )
    expect(patch.t * 200 + patch.width / 2).toBeCloseTo(startRight, 5)
    expect(patch.width).toBe(180)
    expect(patch.t).toBeGreaterThan(1)
  })
})

describe('plan-canvas-opening-handles', () => {
  it('plaatst L/R/midden langs de muur met balance-offset', () => {
    const host = wall({ balance: 0 })
    const opening: Pick<Opening, 't' | 'width'> = { t: 0.5, width: 100 }
    const handles = planOpeningHandlePointsCm(host, opening)
    expect(handles.map((h) => h.kind)).toEqual(['start', 'end', 'move'])
    const edges = openingEdgesAlongWall(host, opening.t, opening.width)
    // balance 0 → mid-line shifted by half thickness along left normal
    expect(handles[0].x).toBeCloseTo(edges.left, 5)
    expect(Math.abs(handles[0].y)).toBeCloseTo(10, 5)
    expect(handles[1].x).toBeCloseTo(edges.right, 5)
    expect(handles[2].x).toBeCloseTo((edges.left + edges.right) / 2, 5)
  })

  it('resize vanaf pointer houdt de tegenkant vast', () => {
    const host = wall({
      b: { x: 400, y: 0 },
      openings: [
        {
          type: 'door',
          id: 'g1',
          kind: 'door.single',
          t: 0.5,
          width: 80,
          z: 0,
          z_height: 210,
        },
      ],
    })
    const openingId = 'w-door-g1'
    const next = resizeOpeningAlongWallFromPointer(
      [host],
      host,
      { t: 0.5, width: 80 },
      openingId,
      'end',
      { x: 280, y: 0 },
      false,
    )
    expect(next.t * 400 - next.width / 2).toBeCloseTo(0.5 * 400 - 40, 5)
    expect(next.width).toBeGreaterThan(80)
  })
})
