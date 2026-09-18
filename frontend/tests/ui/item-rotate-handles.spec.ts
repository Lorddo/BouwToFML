import { describe, expect, it } from 'vitest'
import type { Wall } from '@/core/plan/types'
import {
  angularDistanceDeg,
  hitItemRotateHandle,
  ITEM_ROTATE_HANDLE_ARC_D,
  ITEM_ROTATE_HANDLE_HEAD_D,
  itemLocalCorner,
  itemRotationSnapCandidatesDeg,
  ITEM_ROTATE_SNAP_DEG,
  normalizeItemRotationDeg,
  pointerAngleDeg,
  rotationFromGrab,
  snapItemRotationDeg,
} from '@/ui/composables/plan-canvas/item-rotate-handles'

function wall(partial: Partial<Wall> & Pick<Wall, 'a' | 'b' | 'thickness'>): Wall {
  return {
    id: partial.id ?? 'w',
    a: partial.a,
    b: partial.b,
    thickness: partial.thickness,
    balance: partial.balance,
    openings: [],
  }
}

describe('item-rotate-handles', () => {
  it('deelt dezelfde rotatie-glyph als fixtures', () => {
    expect(ITEM_ROTATE_HANDLE_ARC_D).toContain('A 2.8 2.8')
    expect(ITEM_ROTATE_HANDLE_HEAD_D).toContain('L 0.2 -4.1')
  })

  it('puts handles on the four corners', () => {
    expect(itemLocalCorner(40, 20, 'ne')).toEqual({ x: 20, y: -10 })
    expect(itemLocalCorner(40, 20, 'sw')).toEqual({ x: -20, y: 10 })
  })

  it('hits the nearest corner within tolerance', () => {
    expect(hitItemRotateHandle({ x: 20, y: -10 }, 40, 20, 4)).toBe('ne')
    expect(hitItemRotateHandle({ x: 0, y: 0 }, 40, 20, 3)).toBeNull()
  })

  it('rotates from a pointer sweep, including across ±180°', () => {
    expect(rotationFromGrab(10, 20, 110)).toBe(100)
    expect(rotationFromGrab(0, 170, -170)).toBe(20)
  })

  it('snaps to 90°/180° when close', () => {
    expect(snapItemRotationDeg(8, [0, 90, 180, 270])).toBe(0)
    expect(snapItemRotationDeg(82, [0, 90, 180, 270])).toBe(90)
    expect(snapItemRotationDeg(175, [0, 90, 180, 270])).toBe(180)
    expect(snapItemRotationDeg(40, [0, 90, 180, 270])).toBe(40)
  })

  it('adds a nearby diagonal wall so the fixture can lock parallel', () => {
    const walls = [wall({ a: { x: 0, y: 0 }, b: { x: 100, y: 100 }, thickness: 20, balance: 0.5 })]
    const candidates = itemRotationSnapCandidatesDeg(
      walls,
      { x: 40, y: 55 },
      { width: 60, height: 40, rotationDeg: 45 },
    )
    const has45 = candidates.some((deg) => angularDistanceDeg(deg, 45) < 0.5)
    const has135 = candidates.some((deg) => angularDistanceDeg(deg, 135) < 0.5)
    expect(has45).toBe(true)
    expect(has135).toBe(true)
    expect(snapItemRotationDeg(48, candidates)).toBeCloseTo(45, 5)
  })

  it('does not lock to a far diagonal wall', () => {
    const walls = [wall({ a: { x: 0, y: 0 }, b: { x: 100, y: 100 }, thickness: 20, balance: 0.5 })]
    const candidates = itemRotationSnapCandidatesDeg(
      walls,
      { x: 400, y: 400 },
      { width: 60, height: 40, rotationDeg: 0 },
    )
    expect(candidates).toEqual([0, 90, 180, 270])
  })

  it('keeps wrap-around distance small at 0/360', () => {
    expect(angularDistanceDeg(2, 358)).toBeCloseTo(4)
    expect(normalizeItemRotationDeg(-90)).toBe(270)
    expect(ITEM_ROTATE_SNAP_DEG).toBeGreaterThan(0)
    expect(pointerAngleDeg({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90)
  })
})
