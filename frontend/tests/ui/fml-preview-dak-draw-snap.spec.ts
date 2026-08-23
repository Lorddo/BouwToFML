import { describe, expect, it } from 'vitest'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import { findRidgeDesignIndex } from '@/core/fml/ridge-walls'
import type { FloorSurface, Wall } from '@/core/fml/types'
import {
  dakRoofRingsFromFloor,
  resolveDakSurfacePoint,
  resolveRidgeDrawPoint,
} from '@/ui/components/fml-preview-dak-draw-snap'

function roofSurface(id: string, poly: FloorSurface['poly']): FloorSurface {
  return {
    id,
    poly,
    color: '#ccc',
    showAreaLabel: false,
    isRoof: true,
  }
}

describe('fml-preview-dak-draw-snap', () => {
  it('dakRoofRingsFromFloor slaat exclude-id over', () => {
    const plan = createEmptyFloorPlan({ name: 'Dak' })
    const floor = plan.floors[0]
    const designIndex = findRidgeDesignIndex(floor)
    const designs = floor.designs ?? []
    const design = designs[designIndex]
    if (!design) throw new Error('ridge design ontbreekt')
    design.surfaces = [
      roofSurface('keep', [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
      ]),
      roofSurface('skip', [
        { x: 200, y: 0 },
        { x: 260, y: 0 },
        { x: 260, y: 40 },
      ]),
    ]
    floor.designs = designs

    const all = dakRoofRingsFromFloor(floor)
    expect(all).toHaveLength(2)
    const filtered = dakRoofRingsFromFloor(floor, 'skip')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.[0]).toEqual({ x: 0, y: 0 })
  })

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

  function boxPlan(): ReturnType<typeof createEmptyFloorPlan> {
    const plan = createEmptyFloorPlan({ name: 'Dak' })
    const floor = plan.floors[0]
    floor.walls = [
      wall({ id: 's', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 }),
      wall({ id: 'e', a: { x: 100, y: 0 }, b: { x: 100, y: 100 }, thickness: 20 }),
      wall({ id: 'n', a: { x: 100, y: 100 }, b: { x: 0, y: 100 }, thickness: 20 }),
      wall({ id: 'w', a: { x: 0, y: 100 }, b: { x: 0, y: 0 }, thickness: 20 }),
    ]
    return plan
  }

  it('eerste dakvlak-punt snapt naar de buitenhoek, niet de hartlijn', () => {
    const plan = boxPlan()
    const snapped = resolveDakSurfacePoint(
      { x: -6, y: -7 },
      { plan, floorIndex: 0, lockAxis: false },
    )
    expect(snapped.x).toBeCloseTo(-10)
    expect(snapped.y).toBeCloseTo(-10)
  })

  it('eerste dakvlak-punt snapt naar de buitenface (goot)', () => {
    const plan = boxPlan()
    const snapped = resolveDakSurfacePoint(
      { x: 50, y: -6 },
      { plan, floorIndex: 0, lockAxis: false },
    )
    expect(snapped.x).toBeCloseTo(50)
    expect(snapped.y).toBeCloseTo(-10)
  })

  it('eerste dakvlak-punt snapt naar een nok-eind', () => {
    const plan = boxPlan()
    const floor = plan.floors[0]
    const designIndex = findRidgeDesignIndex(floor)
    const design = floor.designs?.[designIndex]
    if (!design) throw new Error('ridge design ontbreekt')
    design.walls = [wall({ id: 'ridge-1', a: { x: 40, y: 10 }, b: { x: 40, y: 80 }, thickness: 0 })]
    const snapped = resolveDakSurfacePoint(
      { x: 43, y: 78 },
      { plan, floorIndex: 0, lockAxis: false },
    )
    expect(snapped.x).toBeCloseTo(40)
    expect(snapped.y).toBeCloseTo(80)
  })

  it('resolveRidgeDrawPoint met snapDisabled blijft op de pointer (lege floor)', () => {
    const plan = createEmptyFloorPlan({ name: 'Nok' })
    const point = resolveRidgeDrawPoint(
      { x: 33, y: 44 },
      {
        plan,
        floorIndex: 0,
        walls: [],
        lockAxis: false,
        snapDisabled: true,
      },
    )
    expect(point).toEqual({ x: 33, y: 44 })
  })
})
