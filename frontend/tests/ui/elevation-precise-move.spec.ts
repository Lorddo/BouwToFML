import { describe, expect, it } from 'vitest'
import {
  ELEV_PRECISE_CLICK_MIN_CM,
  ELEV_PRECISE_TYPED_MIN_CM,
  elevationOpeningRestLengthCm,
  elevationPreciseCommitMinCm,
  elevationPreciseHeightDelta,
  elevationPreciseOffset,
  elevationPreciseOpeningOffset,
  elevationPreciseOpeningRestSide,
  elevationPreciseResultHeightCm,
  elevationPreciseRidgeOffset,
  elevationRectBottomZCm,
} from '@/ui/composables/elevation/elevation-precise-move'

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

  it('opening: typ restmaat L/R of vloer/plafond volgens hover', () => {
    const lengths = { leftCm: 40, rightCm: 60, floorCm: 90, ceilingCm: 30 }
    const start = { x: 100, y: 100 }
    expect(elevationPreciseOpeningRestSide(start, { x: 140, y: 100 })).toBe('right')
    expect(elevationPreciseOpeningRestSide(start, { x: 60, y: 100 })).toBe('left')
    expect(elevationPreciseOpeningRestSide(start, { x: 100, y: 140 })).toBe('floor')
    expect(elevationPreciseOpeningRestSide(start, { x: 100, y: 40 })).toBe('ceiling')
    expect(elevationOpeningRestLengthCm(lengths, 'floor')).toBe(90)
    // Hover rechts → typ rechter rest 20 → moveX = 60-20 = 40
    expect(
      elevationPreciseOpeningOffset(start, { x: 140, y: 100 }, 20, lengths),
    ).toEqual({ x: 40, y: 0 })
    // Hover links → typ 10 → moveX = 10-40 = -30
    expect(
      elevationPreciseOpeningOffset(start, { x: 60, y: 100 }, 10, lengths),
    ).toEqual({ x: -30, y: 0 })
    // Hover omlaag → vloer-rest 50 → moveY = 90-50 = 40
    expect(
      elevationPreciseOpeningOffset(start, { x: 100, y: 140 }, 50, lengths),
    ).toEqual({ x: 0, y: 40 })
    // Hover omhoog → plafond-rest 15 → moveY = 15-30 = -15
    expect(
      elevationPreciseOpeningOffset(start, { x: 100, y: 40 }, 15, lengths),
    ).toEqual({ x: 0, y: -15 })
  })

  it('knoop/nok: positieve typ = resultaat-hoogte', () => {
    expect(elevationPreciseResultHeightCm(250, 0, 40, 280)).toBe(280)
    // Geen typ: hover omhoog = plus
    expect(elevationPreciseResultHeightCm(250, 0, -30, null)).toBeCloseTo(280, 6)
    // Negatieve typ: oude delta
    expect(elevationPreciseResultHeightCm(250, 0, -30, -20)).toBe(230)
  })

  it('nok: typ = absolute vloerhoogte (alleen Y); muis altijd H/V', () => {
    // Start onderkant 250 → typ 300 = 50 cm omhoog → dy = -50
    expect(elevationPreciseRidgeOffset({ x: 10, y: 0 }, { x: 80, y: -20 }, 300, 250)).toEqual({
      x: 0,
      y: -50,
    })
    // Geen typ: as-lock op dominante X
    const moved = elevationPreciseRidgeOffset({ x: 0, y: 0 }, { x: 90, y: 20 }, null, 250)
    expect(moved.x).toBeCloseTo(90, 6)
    expect(moved.y).toBe(0)
  })

  it('elevationRectBottomZCm: yBot → vloer-relatieve Z', () => {
    expect(elevationRectBottomZCm({ y0: -280, y1: -260 }, 0)).toBe(260)
    expect(elevationRectBottomZCm({ y0: -280, y1: -260 }, 100)).toBe(160)
  })
})
