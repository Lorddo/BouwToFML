import { describe, expect, it } from 'vitest'
import {
  ELEV_PRECISE_CLICK_MIN_CM,
  ELEV_PRECISE_TYPED_MIN_CM,
  elevationPreciseCommitMinCm,
  elevationPreciseHeightDelta,
  elevationPreciseOffset,
} from '@/ui/composables/plan-canvas/elevation-precise-move'

describe('elevation-precise-move', () => {
  it('offset volgt hover; getypte maat gaat dezelfde kant op', () => {
    const start = { x: 0, y: 0 }
    const hover = { x: 80, y: -40 }
    const raw = elevationPreciseOffset(start, hover, null)
    expect(raw.x).toBeCloseTo(80, 6)
    expect(raw.y).toBeCloseTo(-40, 6)
    const typed = elevationPreciseOffset(start, hover, 100)
    const len = Math.hypot(80, -40)
    expect(typed.x).toBeCloseTo((80 / len) * 100, 6)
    expect(typed.y).toBeCloseTo((-40 / len) * 100, 6)
  })

  it('negatieve typ keert de hover-richting', () => {
    const typed = elevationPreciseOffset({ x: 10, y: 10 }, { x: 10, y: 0 }, -50)
    expect(typed.x).toBeCloseTo(0, 6)
    expect(typed.y).toBeCloseTo(50, 6)
  })

  it('axis-lock houdt de dominante as', () => {
    const locked = elevationPreciseOffset({ x: 0, y: 0 }, { x: 90, y: 20 }, null, true)
    expect(locked.x).toBeCloseTo(90, 6)
    expect(locked.y).toBe(0)
  })

  it('hoogte: muis omhoog = plus, typ volgt die kant', () => {
    expect(elevationPreciseHeightDelta(0, -80, null)).toBeCloseTo(80, 6)
    expect(elevationPreciseHeightDelta(0, 40, null)).toBeCloseTo(-40, 6)
    expect(elevationPreciseHeightDelta(0, -80, 120)).toBe(120)
    expect(elevationPreciseHeightDelta(0, 40, 120)).toBe(-120)
    expect(elevationPreciseHeightDelta(0, -80, -30)).toBe(-30)
  })

  it('commit-drempel: klik 5 mm, typ 1 mm', () => {
    expect(elevationPreciseCommitMinCm(false)).toBe(ELEV_PRECISE_CLICK_MIN_CM)
    expect(elevationPreciseCommitMinCm(true)).toBe(ELEV_PRECISE_TYPED_MIN_CM)
  })
})
