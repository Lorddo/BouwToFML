import { describe, expect, it } from 'vitest'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import { findRidgeDesignIndex } from '@/core/fml/ridge-walls'
import type { FloorSurface } from '@/core/fml/types'
import {
  dakRoofRingsFromFloor,
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
