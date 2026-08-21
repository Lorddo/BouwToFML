import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import { readDimensionSettings, writeDimensionSettings } from '@/core/fml/fml-dimension-settings'
import { importFmlV3 } from '@/core/fml/importFmlV3'

describe('fml-dimension-settings', () => {
  it('leeg plan: defaults uit / interior / geen totaal', () => {
    const plan = createEmptyFloorPlan({ name: 'Test' })
    expect(readDimensionSettings(plan)).toEqual({
      engineAutoDims: false,
      dimensionMode: 'interior',
      generateOuterDimension: false,
    })
  })

  it('write + buildFmlV3 + import: flags op project/design, dimensions blijft leeg', () => {
    const plan = createEmptyFloorPlan({ name: 'Maatlijn' })
    plan.floors[0].walls = [
      {
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        thickness: 20,
        openings: [],
      },
    ]
    const written = writeDimensionSettings(plan, {
      engineAutoDims: true,
      dimensionMode: 'exterior',
      generateOuterDimension: true,
    })
    expect(readDimensionSettings(written)).toEqual({
      engineAutoDims: true,
      dimensionMode: 'exterior',
      generateOuterDimension: true,
    })
    expect(written.source?.settings?.showDims).toBe(true)
    expect(written.floors[0].dimensions).toBeUndefined()

    const raw = JSON.parse(buildFmlV3(written))
    expect(raw.settings.dimensionMode).toBe('exterior')
    expect(raw.settings.generateOuterDimension).toBe(true)
    expect(raw.settings.showDims).toBe(true)
    expect(raw.floors[0].designs[0].settings.engineAutoDims).toBe(true)
    expect(raw.floors[0].designs[0].dimensions).toEqual([])

    const { plan: imported } = importFmlV3(raw)
    expect(readDimensionSettings(imported)).toEqual({
      engineAutoDims: true,
      dimensionMode: 'exterior',
      generateOuterDimension: true,
    })
    expect(imported.floors[0].dimensions).toBeUndefined()
  })

  it('engineAutoDims op alle designs van alle floors', () => {
    const plan = createEmptyFloorPlan({ name: 'Multi' })
    plan.floors.push({
      name: 'Verdieping 1',
      level: 1,
      height: 280,
      walls: [],
      designs: [
        { name: 'A', walls: [] },
        { name: 'B', walls: [] },
      ],
      activeDesignIndex: 0,
    })
    const written = writeDimensionSettings(plan, { engineAutoDims: true })
    for (const floor of written.floors) {
      for (const design of floor.designs ?? []) {
        expect(design.source?.settings?.engineAutoDims).toBe(true)
      }
    }
  })
})
