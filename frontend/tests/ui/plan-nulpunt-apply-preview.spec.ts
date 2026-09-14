import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { applyNulpunt } from '@/core/plan/translate-floor-plan'
import type { FloorPlan } from '@/core/plan/types'
import { createWorkspacePlanGenerate } from '@/ui/composables/workspace/workspace-plan-generate'

function samplePlan(): FloorPlan {
  return {
    name: 'T',
    floors: [
      {
        name: '1e',
        level: 1,
        height: 280,
        walls: [
          {
            id: 'w1',
            a: { x: 100, y: 200 },
            b: { x: 200, y: 200 },
            thickness: 10,
            openings: [],
          },
        ],
      },
    ],
  }
}

describe('applyNulpuntAtPlanCm (workspace preview)', () => {
  it('past atomisch toe op edited preview — niet op een andere bron', () => {
    const scale = {
      confirmed: ref(false),
      pixelsPerMillimeterX: ref(0),
      pixelsPerMillimeterY: ref(0),
    }
    const generate = createWorkspacePlanGenerate(
      {
        imageName: ref('t.png'),
        combinedOutput: ref(null),
        scale: scale as never,
        setLocalError: () => {},
      },
      {
        appliedThicknessLimits: ref({ minCm: 10, midCm: 20, maxCm: 30 }),
        appliedBandBoundaries: ref({ midBoundaryCm: 15, maxBoundaryCm: 25 }),
        appliedWallHeightCm: ref(280),
        appliedDoorHeightCm: ref(210),
        appliedWindowHeightCm: ref(120),
        appliedWindowSillZCm: ref(90),
        planThicknessCms: ref([10, 20, 30]),
        planThicknessMinCm: ref(10),
        planThicknessMidCm: ref(20),
        planThicknessMaxCm: ref(30),
        planBandMidBoundaryCm: ref(15),
        planBandMaxBoundaryCm: ref(25),
        planWallHeightCm: ref(280),
        planDoorHeightCm: ref(210),
        planWindowHeightCm: ref(120),
        planWindowSillZCm: ref(90),
        planBovenlichtDefault: ref(false),
        planWindowBovenlichtDefault: ref(false),
        planBovenlichtHeightCm: ref(40),
        planBovenlichtGapCm: ref(10),
      },
    )

    const plan = samplePlan()
    const layout = { origin: { x: 50, y: 60 }, pxPerMmX: 1, pxPerMmY: 1 }
    generate.updatePreviewPlan(plan, layout)

    const drop = { x: 100, y: 200 }
    const applied = generate.applyNulpuntAtPlanCm(drop, layout)
    expect(applied).not.toBeNull()
    expect(applied!.plan.floors[0].walls[0].a).toEqual({ x: 0, y: 0 })
    expect(applied!.layout.origin).toEqual({ x: 150, y: 260 })
    expect(generate.planNulpuntImageCm.value).toEqual({ x: 150, y: 260 })
    expect(generate.previewPlan.value?.floors[0]!.name).toBe('1e')

    // Zelfde uitkomst als core helper
    const expected = applyNulpunt(plan, layout, drop)
    expect(applied!.plan.floors[0].walls[0].a).toEqual(expected.plan.floors[0].walls[0].a)
  })

  it('gebruikt layoutOverride als previewUnderlayLayout null is', () => {
    const scale = {
      confirmed: ref(false),
      pixelsPerMillimeterX: ref(0),
      pixelsPerMillimeterY: ref(0),
    }
    const generate = createWorkspacePlanGenerate(
      {
        imageName: ref('t.png'),
        combinedOutput: ref(null),
        scale: scale as never,
        setLocalError: () => {},
      },
      {
        appliedThicknessLimits: ref({ minCm: 10, midCm: 20, maxCm: 30 }),
        appliedBandBoundaries: ref({ midBoundaryCm: 15, maxBoundaryCm: 25 }),
        appliedWallHeightCm: ref(280),
        appliedDoorHeightCm: ref(210),
        appliedWindowHeightCm: ref(120),
        appliedWindowSillZCm: ref(90),
        planThicknessCms: ref([10, 20, 30]),
        planThicknessMinCm: ref(10),
        planThicknessMidCm: ref(20),
        planThicknessMaxCm: ref(30),
        planBandMidBoundaryCm: ref(15),
        planBandMaxBoundaryCm: ref(25),
        planWallHeightCm: ref(280),
        planDoorHeightCm: ref(210),
        planWindowHeightCm: ref(120),
        planWindowSillZCm: ref(90),
        planBovenlichtDefault: ref(false),
        planWindowBovenlichtDefault: ref(false),
        planBovenlichtHeightCm: ref(40),
        planBovenlichtGapCm: ref(10),
      },
    )

    const plan = samplePlan()
    // Alleen plan, geen persisted layout (zoals na gedeeltelijke hydrate).
    generate.updatePreviewPlan(plan)
    expect(generate.previewUnderlayLayout.value).toBeNull()

    const layout = { origin: { x: 50, y: 60 }, pxPerMmX: 1, pxPerMmY: 1 }
    const applied = generate.applyNulpuntAtPlanCm({ x: 100, y: 200 }, layout)
    expect(applied).not.toBeNull()
    expect(applied!.layout.origin).toEqual({ x: 150, y: 260 })
  })

  it('clearLivePlanCanvas wist preview zodat floor-remount geen stale plan krijgt', () => {
    const scale = {
      confirmed: ref(false),
      pixelsPerMillimeterX: ref(0),
      pixelsPerMillimeterY: ref(0),
    }
    const generate = createWorkspacePlanGenerate(
      {
        imageName: ref('t.png'),
        combinedOutput: ref(null),
        scale: scale as never,
        setLocalError: () => {},
      },
      {
        appliedThicknessLimits: ref({ minCm: 10, midCm: 20, maxCm: 30 }),
        appliedBandBoundaries: ref({ midBoundaryCm: 15, maxBoundaryCm: 25 }),
        appliedWallHeightCm: ref(280),
        appliedDoorHeightCm: ref(210),
        appliedWindowHeightCm: ref(120),
        appliedWindowSillZCm: ref(90),
        planThicknessCms: ref([10, 20, 30]),
        planThicknessMinCm: ref(10),
        planThicknessMidCm: ref(20),
        planThicknessMaxCm: ref(30),
        planBandMidBoundaryCm: ref(15),
        planBandMaxBoundaryCm: ref(25),
        planWallHeightCm: ref(280),
        planDoorHeightCm: ref(210),
        planWindowHeightCm: ref(120),
        planWindowSillZCm: ref(90),
        planBovenlichtDefault: ref(false),
        planWindowBovenlichtDefault: ref(false),
        planBovenlichtHeightCm: ref(40),
        planBovenlichtGapCm: ref(10),
      },
    )

    generate.updatePreviewPlan(samplePlan(), {
      origin: { x: 1, y: 2 },
      pxPerMmX: 1,
      pxPerMmY: 1,
    })
    generate.setPlanNulpuntImageCm({ x: 9, y: 9 })
    expect(generate.previewPlan.value).not.toBeNull()

    generate.clearLivePlanCanvas()
    expect(generate.previewPlan.value).toBeNull()
    expect(generate.planNulpuntImageCm.value).toBeNull()
    expect(generate.previewUnderlayLayout.value).toBeNull()
  })
})
