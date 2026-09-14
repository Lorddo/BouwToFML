import { describe, expect, it } from 'vitest'
import type { FloorArea, Wall } from '@/core/plan/types'
import { previewAreasFromWallMove } from '@/ui/composables/plan-canvas/plan-canvas-area-live'

function wall(id: string, ax: number, ay: number, bx: number, by: number): Wall {
  return {
    id,
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    thickness: 10,
    balance: 0.5,
    openings: [],
  }
}

function room(id: string, x0: number, y0: number, w: number, h: number): FloorArea {
  return {
    id,
    poly: [
      { x: x0, y: y0 },
      { x: x0 + w, y: y0 },
      { x: x0 + w, y: y0 + h },
      { x: x0, y: y0 + h },
    ],
    color: '#fff',
    showAreaLabel: true,
  }
}

describe('previewAreasFromWallMove', () => {
  it('schuift vertices op een rigide meebewegende muur mee', () => {
    const base = [wall('east', 400, 0, 400, 300)]
    const next = [wall('east', 450, 0, 450, 300)]
    const areas = [room('r', 0, 0, 400, 300)]
    const live = previewAreasFromWallMove(areas, base, next)
    expect(live?.[0]?.poly[1]).toEqual({ x: 450, y: 0 })
    expect(live?.[0]?.poly[2]).toEqual({ x: 450, y: 300 })
    expect(live?.[0]?.poly[0]).toEqual({ x: 0, y: 0 })
  })

  it('laat verre vertices met rust', () => {
    const base = [wall('east', 400, 0, 400, 300)]
    const next = [wall('east', 430, 0, 430, 300)]
    const areas = [room('r', 0, 0, 400, 300)]
    const live = previewAreasFromWallMove(areas, base, next)
    expect(live?.[0]?.poly[0]).toEqual({ x: 0, y: 0 })
    expect(live?.[0]?.poly[3]).toEqual({ x: 0, y: 300 })
  })

  it('geeft een kopie terug zonder muur-delta', () => {
    const walls = [wall('east', 400, 0, 400, 300)]
    const areas = [room('r', 0, 0, 400, 300)]
    const live = previewAreasFromWallMove(areas, walls, walls)
    expect(live).not.toBe(areas)
    expect(live?.[0]?.poly).toEqual(areas[0].poly)
  })
})
