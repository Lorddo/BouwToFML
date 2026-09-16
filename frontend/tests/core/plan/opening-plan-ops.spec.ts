import { describe, expect, it } from 'vitest'
import {
  clampDoorOpeningT,
  openingWorldCenter,
  updateOpeningById,
} from '@/core/plan/opening-plan-ops'
import type { Wall } from '@/core/plan/types'

describe('clampDoorOpeningT', () => {
  const host = { a: { x: 0, y: 0 }, b: { x: 80, y: 0 }, thickness: 20 }

  it('doodlopende muur: opening te breed → midden (bestaand)', () => {
    expect(clampDoorOpeningT(host, 200, 0.8)).toBe(0.5)
  })

  it('T aan B: centrum mag voorbij de naad, geen recenter naar 0.5', () => {
    expect(clampDoorOpeningT(host, 200, 1.5, { a: false, b: true })).toBeCloseTo(1.5, 6)
    expect(clampDoorOpeningT(host, 200, 0.5, { a: false, b: true })).toBeGreaterThan(1)
  })

  it('T aan A: centrum mag voor de naad', () => {
    expect(clampDoorOpeningT(host, 200, -0.4, { a: true, b: false })).toBeCloseTo(-0.4, 6)
  })

  it('zonder T blijft het vrije eind een harde stop', () => {
    const long = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 }
    expect(clampDoorOpeningT(long, 90, 0.05)).toBeCloseTo(0.35, 5)
    expect(clampDoorOpeningT(long, 90, 0.95)).toBeCloseTo(0.65, 5)
  })
})

describe('openingWorldCenter', () => {
  it('extrapoleert voorbij B als t > 1', () => {
    const wall = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }
    expect(openingWorldCenter(wall, 1.2).x).toBeCloseTo(120, 6)
    expect(openingWorldCenter(wall, -0.1).x).toBeCloseTo(-10, 6)
  })
})

describe('updateOpeningById over T', () => {
  it('verkleinen aan de hostkant houdt de overstekende kant', () => {
    const walls: Wall[] = [
      {
        id: 'gevel-l',
        a: { x: 0, y: 0 },
        b: { x: 200, y: 0 },
        thickness: 20,
        openings: [
          {
            type: 'window',
            id: 'blind-1',
            kind: 'window.blind',
            t: 1,
            width: 250,
            z: 220,
            z_height: 20,
          },
        ],
      },
      {
        id: 'gevel-r',
        a: { x: 200, y: 0 },
        b: { x: 400, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const startRight = 200 + 125
    const next = updateOpeningById(walls, 'gevel-l-window-blind-1', { t: 1.175, width: 180 })
    const opening = next[0]?.openings[0]
    expect(opening?.width).toBe(180)
    expect(opening?.t).toBeCloseTo(1.175, 5)
    expect((opening?.t ?? 0) * 200 + 90).toBeCloseTo(startRight, 5)
  })
})
