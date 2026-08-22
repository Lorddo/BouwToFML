import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import { readDimensionSettings, writeDimensionSettings } from '@/core/fml/fml-dimension-settings'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { markWallAsRidge, setRidgeWallsOnFloor } from '@/core/fml/ridge-walls'

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

  it('engineAutoDims alleen op plattegrond-design van die floor', () => {
    const plan = createEmptyFloorPlan({ name: 'Multi' })
    plan.floors.push({
      name: 'Verdieping 1',
      level: 1,
      height: 280,
      walls: [],
      designs: [
        { name: 'A', walls: [] },
        {
          name: 'Dak',
          walls: [],
          source: { settings: { btfRole: 'ridge', engineAutoDims: true } },
        },
      ],
      activeDesignIndex: 0,
    })
    const written = writeDimensionSettings(plan, { engineAutoDims: true }, 1)
    expect(written.floors[0]?.designs?.[0]?.source?.settings?.engineAutoDims).not.toBe(true)
    expect(written.floors[1]?.designs?.[0]?.source?.settings?.engineAutoDims).toBe(true)
    expect(written.floors[1]?.designs?.[1]?.source?.settings?.engineAutoDims).toBe(false)
    expect(readDimensionSettings(written, 0).engineAutoDims).toBe(false)
    expect(readDimensionSettings(written, 1).engineAutoDims).toBe(true)
  })

  it('write raakt Dak-design niet aan bij Autogen op begane grond', () => {
    const plan = createEmptyFloorPlan({ name: 'BG' })
    const written = writeDimensionSettings(plan, { engineAutoDims: true }, 0)
    const dak = written.floors[0]?.designs?.find((design) => design.name === 'Dak')
    expect(written.floors[0]?.designs?.[0]?.source?.settings?.engineAutoDims).toBe(true)
    expect(dak?.source?.settings?.engineAutoDims).toBe(false)
  })

  it('export Dak: engineAutoDims false en geen dimensions', () => {
    const plan = createEmptyFloorPlan({ name: 'Dakexport' })
    const withAuto = writeDimensionSettings(plan, { engineAutoDims: true }, 0)
    withAuto.floors[0] = setRidgeWallsOnFloor(withAuto.floors[0], [
      markWallAsRidge({
        id: 'r1',
        a: { x: 0, y: 0 },
        b: { x: 200, y: 0 },
        thickness: 0,
        openings: [],
      }),
    ])
    const raw = JSON.parse(buildFmlV3(withAuto)) as {
      floors: Array<{
        designs: Array<{
          name?: string
          settings?: { engineAutoDims?: boolean }
          dimensions?: unknown[]
        }>
      }>
    }
    const dak = raw.floors[0]?.designs.find((design) => design.name === 'Dak')
    expect(dak?.settings?.engineAutoDims).toBe(false)
    expect(dak?.dimensions).toEqual([])
  })
})
