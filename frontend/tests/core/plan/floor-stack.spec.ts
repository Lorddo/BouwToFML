import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { createBlankFloor, createEmptyFloorPlan } from '@/core/plan/empty-floor-plan'
import {
  elevationDakThicknessCm,
  elevationFloorGroups,
  readFloorStack,
  seedFloorStackIfMissing,
  setNokThicknessCm,
  setSlabThicknessCm,
} from '@/core/plan/floor-stack'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { seedRidgeDisplayWidthIfMissing, ridgeDisplayWidthCm } from '@/core/plan/ridge-walls'

describe('floor-stack elevation groups', () => {
  it('groepeert hoog → laag zonder nokhoogte-rij', () => {
    const plan = createEmptyFloorPlan({ name: 'Stack', wallHeightCm: 260 })
    plan.floors.push(createBlankFloor({ name: '1e', level: 1, wallHeightCm: 250 }))
    const seeded = seedFloorStackIfMissing(plan, { dakThicknessCm: 35, slabThicknessCm: 18 })
    expect(elevationDakThicknessCm(seeded)).toBe(35)
    expect(elevationFloorGroups(seeded)).toEqual([
      { floorIndex: 1, name: '1e', heightCm: 250, slabCm: 18 },
      { floorIndex: 0, name: 'Begane grond', heightCm: 260, slabCm: 18 },
    ])
  })

  it('seedFloorStackIfMissing schrijft niet over een bestaande stack', () => {
    let plan = setNokThicknessCm(createEmptyFloorPlan({ name: 'Bestaand' }), 40)
    plan = setSlabThicknessCm(plan, 0, 22)
    const next = seedFloorStackIfMissing(plan, { dakThicknessCm: 12, slabThicknessCm: 9 })
    expect(readFloorStack(next).nokThicknessCm).toBe(40)
    expect(readFloorStack(next).floors[0]?.thicknessCm).toBe(22)
  })

  it('seedFloorStackIfMissing vult alleen ontbrekende floors', () => {
    const plan = setSlabThicknessCm(createEmptyFloorPlan({ name: 'Multi' }), 0, 22)
    plan.floors.push(createBlankFloor({ name: '1e', level: 1, wallHeightCm: 250 }))
    const next = seedFloorStackIfMissing(plan, { dakThicknessCm: 35, slabThicknessCm: 18 })
    const stack = readFloorStack(next)
    expect(stack.floors.find((row) => row.level === 0)?.thicknessCm).toBe(22)
    expect(stack.floors.find((row) => row.level === 1)?.thicknessCm).toBe(18)
  })
})

describe('ridge display seed', () => {
  it('zet displayWidth alleen als die ontbreekt', () => {
    const plan = createEmptyFloorPlan({ name: 'Noklijn' })
    const seeded = seedRidgeDisplayWidthIfMissing(plan, 16)
    expect(ridgeDisplayWidthCm(seeded)).toBe(16)
    expect(ridgeDisplayWidthCm(seedRidgeDisplayWidthIfMissing(seeded, 8))).toBe(16)
  })
})

describe('floor-stack .plg-roundtrip', () => {
  it('woont in plan.roof.stack; FML-export stript floorStack', () => {
    let plan = setNokThicknessCm(createEmptyFloorPlan({ name: 'StackPlg' }), 40)
    plan = setSlabThicknessCm(plan, 0, 22)
    expect(plan.roof?.stack).toMatchObject({
      nokThicknessCm: 40,
      floors: [{ level: 0, thicknessCm: 22 }],
    })
    expect(plan.source?.settings?.floorStack).toBeUndefined()

    const raw = JSON.parse(buildFmlV3(plan))
    expect(raw.settings.floorStack).toBeUndefined()

    // Zonder floorStack in FML komt import terug op defaults — bekend strip-gedrag.
    const imported = importFmlV3(raw).plan
    expect(imported.source?.settings?.floorStack).toBeUndefined()
    expect(readFloorStack(imported).nokThicknessCm).toBe(30)
  })
})
