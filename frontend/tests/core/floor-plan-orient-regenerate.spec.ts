import { describe, expect, it } from 'vitest'
import { copyUnderlayDisplayOrient } from '@/core/fml/drawing-to-underlay-layout'
import {
  applyFloorOrientFromCanonical,
  composeFloorOrient,
  defaultFloorOrient,
} from '@/core/fml/floor-plan-orient'
import type { FloorPlan } from '@/core/fml/types'

describe('underlay display orient + regenerate compose', () => {
  it('copyUnderlayDisplayOrient behoudt rot/flip op verse origin', () => {
    const fresh: {
      origin: { x: number; y: number }
      pxPerMmX: number
      pxPerMmY: number
      rotationDeg?: number
      flipX?: boolean
    } = {
      origin: { x: 10, y: 20 },
      pxPerMmX: 2,
      pxPerMmY: 2,
    }
    const prev = {
      origin: { x: 0, y: 0 },
      pxPerMmX: 2,
      pxPerMmY: 2,
      rotationDeg: 90,
      flipX: true,
    }
    const next = copyUnderlayDisplayOrient(fresh, prev)
    expect(next.origin).toEqual({ x: 10, y: 20 })
    expect(next.rotationDeg).toBe(90)
    expect(next.flipX).toBe(true)
  })

  it('regenerate-pad: fmlOrient blijft equivalent aan knop-ops', () => {
    const plan: FloorPlan = {
      name: 'G',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [
            {
              id: 'w',
              a: { x: 10, y: 0 },
              b: { x: 20, y: 0 },
              thickness: 10,
              openings: [],
            },
          ],
        },
      ],
    }
    let state = defaultFloorOrient()
    state = composeFloorOrient(state, 'rotCw')
    state = composeFloorOrient(state, 'flipX')
    const fromCanonical = applyFloorOrientFromCanonical(plan, state)
    expect(fromCanonical.floors[0].walls[0].a).toEqual({ x: 0, y: 10 })
    expect(fromCanonical.floors[0].walls[0].b).toEqual({ x: 0, y: 20 })
  })
})
