import { describe, expect, it } from 'vitest'
import {
  applyOpeningDragMove,
  moveOpeningToWall,
  OPENING_DRAG_LEAVE_CM,
  OPENING_DRAG_SNAP_CM,
  projectPointToWallTUnclamped,
  resolveOpeningDragTarget,
} from '@/ui/components/fml-preview-opening-drag-geom'
import { findOpeningById, updateOpeningById } from '@/ui/components/fml-preview-openings'
import type { Wall } from '@/core/fml/types'

function doorOnWall(params: {
  id: string
  a: { x: number; y: number }
  b: { x: number; y: number }
  t: number
  width?: number
  guid?: string
  mirrored?: [number, number]
}): Wall {
  return {
    id: params.id,
    a: params.a,
    b: params.b,
    thickness: 20,
    openings: [
      {
        type: 'door',
        refid: 'door-ref',
        t: params.t,
        width: params.width ?? 90,
        guid: params.guid ?? 'door-1',
        mirrored: params.mirrored ?? [0, 1],
      },
    ],
  }
}

describe('projectPointToWallTUnclamped', () => {
  it('returns t outside 0..1 past the ends', () => {
    const wall = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }
    expect(projectPointToWallTUnclamped(wall, { x: -20, y: 0 })).toBeCloseTo(-0.2, 6)
    expect(projectPointToWallTUnclamped(wall, { x: 120, y: 0 })).toBeCloseTo(1.2, 6)
  })
})

describe('applyOpeningDragMove soft t', () => {
  it('allows soft t near segment ends without width clamp', () => {
    const walls = [
      doorOnWall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        t: 0.5,
        width: 90,
      }),
    ]
    const id = 'w1-door-door-1'
    // Panel update would clamp wide door away from the end.
    const panelClamped = updateOpeningById(walls, id, { t: 0.05 })
    expect(panelClamped[0]?.openings[0]?.t).toBeGreaterThan(0.4)

    const dragged = applyOpeningDragMove(walls, id, { x: 5, y: 0 })
    expect(dragged).not.toBeNull()
    expect(dragged!.openingId).toBe(id)
    expect(dragged!.walls[0]?.openings[0]?.t).toBeCloseTo(0.05, 5)
  })
})

describe('collinear hop', () => {
  it('hops to the next collinear segment past a shared junction', () => {
    const walls: Wall[] = [
      doorOnWall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 50, y: 0 },
        t: 0.8,
        width: 10,
        guid: 'door-hop',
      }),
      {
        id: 'w2',
        a: { x: 50, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const id = 'w1-door-door-hop'
    const result = applyOpeningDragMove(walls, id, { x: 70, y: 1 })
    expect(result).not.toBeNull()
    expect(result!.openingId).toBe('w2-door-door-hop')
    const located = findOpeningById(result!.walls, result!.openingId)
    expect(located?.wallId).toBe('w2')
    expect(located?.opening.guid).toBe('door-hop')
    const worldX = located!.wall.a.x + located!.opening.t * (located!.wall.b.x - located!.wall.a.x)
    expect(worldX).toBeCloseTo(70, 0)
    expect(result!.walls.find((w) => w.id === 'w1')?.openings).toHaveLength(0)
  })
})

describe('sticky vs transfer', () => {
  it('stays on current wall for a small perpendicular offset', () => {
    const walls = [
      doorOnWall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        t: 0.4,
        width: 10,
      }),
      {
        id: 'w2',
        a: { x: 0, y: 30 },
        b: { x: 100, y: 30 },
        thickness: 20,
        openings: [],
      },
    ]
    const id = 'w1-door-door-1'
    const offset = Math.min(OPENING_DRAG_LEAVE_CM - 1, 10)
    const target = resolveOpeningDragTarget(walls, 'w1', { x: 40, y: offset })
    expect(target?.wallId).toBe('w1')
    expect(target?.t).toBeCloseTo(0.4, 5)

    const result = applyOpeningDragMove(walls, id, { x: 40, y: offset })
    expect(result?.openingId).toBe(id)
    expect(result?.walls.find((w) => w.id === 'w1')?.openings).toHaveLength(1)
  })

  it('transfers to another wall beyond leave with snap, preserving guid and mirrored', () => {
    const walls = [
      doorOnWall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        t: 0.4,
        width: 10,
        guid: 'xfer-1',
        mirrored: [1, 0],
      }),
      {
        id: 'w2',
        a: { x: 0, y: 30 },
        b: { x: 100, y: 30 },
        thickness: 20,
        openings: [],
      },
    ]
    const id = 'w1-door-xfer-1'
    // Beyond leave (12) but within snap of w2 (dist to w2 = |y-30|).
    // At y=20: dist to w1=20 > leave 12, dist to w2=10 — but snap is 8, so 10 > 8.
    // At y=24: dist w1=24 > 12, dist w2=6 ≤ 8 → transfer.
    expect(OPENING_DRAG_SNAP_CM).toBeLessThan(OPENING_DRAG_LEAVE_CM)
    const result = applyOpeningDragMove(walls, id, { x: 55, y: 24 })
    expect(result).not.toBeNull()
    expect(result!.openingId).toBe('w2-door-xfer-1')
    const located = findOpeningById(result!.walls, result!.openingId)
    expect(located?.opening.guid).toBe('xfer-1')
    expect(located?.opening.mirrored).toEqual([1, 0])
    expect(located?.opening.width).toBe(10)
    expect(located?.opening.type).toBe('door')
    expect(located?.opening.t).toBeCloseTo(0.55, 5)
    expect(result!.walls.find((w) => w.id === 'w1')?.openings).toHaveLength(0)
  })

  it('moveOpeningToWall soft-updates t on the same wall', () => {
    const walls = [
      doorOnWall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        t: 0.5,
        width: 90,
      }),
    ]
    const result = moveOpeningToWall(walls, 'w1-door-door-1', 'w1', 0.02)
    expect(result?.walls[0]?.openings[0]?.t).toBeCloseTo(0.02, 6)
    expect(result?.openingId).toBe('w1-door-door-1')
  })
})
