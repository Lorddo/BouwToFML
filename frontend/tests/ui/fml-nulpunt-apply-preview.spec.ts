import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { applyNulpunt } from '@/core/fml/translate-floor-plan'
import type { FloorPlan } from '@/core/fml/types'
import { createWorkspaceFmlGenerate } from '@/ui/composables/workspace/workspace-fml-generate'

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

describe('applyNulpuntAtFmlCm (workspace preview)', () => {
  it('past atomisch toe op edited preview — niet op een andere bron', () => {
    const scale = {
      confirmed: ref(false),
      pixelsPerMillimeterX: ref(0),
      pixelsPerMillimeterY: ref(0),
    }
    const generate = createWorkspaceFmlGenerate(
      {
        imageName: ref('t.png'),
        combinedOutput: ref(null),
        scale: scale as never,
        setLocalError: () => {},
      },
      {
        appliedFmlThicknessLimits: ref({ minCm: 10, midCm: 20, maxCm: 30 }),
        appliedFmlBandBoundaries: ref({ midBoundaryCm: 15, maxBoundaryCm: 25 }),
        appliedFmlWallHeightCm: ref(280),
        appliedFmlDoorHeightCm: ref(210),
        appliedFmlWindowHeightCm: ref(120),
        appliedFmlWindowSillZCm: ref(90),
        fmlThicknessMinCm: ref(10),
        fmlThicknessMidCm: ref(20),
        fmlThicknessMaxCm: ref(30),
        fmlBandMidBoundaryCm: ref(15),
        fmlBandMaxBoundaryCm: ref(25),
        fmlWallHeightCm: ref(280),
        fmlDoorHeightCm: ref(210),
        fmlWindowHeightCm: ref(120),
        fmlWindowSillZCm: ref(90),
        fmlBovenlichtDefault: ref(false),
        fmlWindowBovenlichtDefault: ref(false),
        fmlBovenlichtHeightCm: ref(40),
        fmlBovenlichtGapCm: ref(10),
      },
    )

    const plan = samplePlan()
    const layout = { origin: { x: 50, y: 60 }, pxPerMmX: 1, pxPerMmY: 1 }
    generate.updatePreviewPlan(plan, layout)

    const drop = { x: 100, y: 200 }
    const applied = generate.applyNulpuntAtFmlCm(drop, layout)
    expect(applied).not.toBeNull()
    expect(applied!.plan.floors[0].walls[0].a).toEqual({ x: 0, y: 0 })
    expect(applied!.layout.origin).toEqual({ x: 150, y: 260 })
    expect(generate.fmlNulpuntImageCm.value).toEqual({ x: 150, y: 260 })
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
    const generate = createWorkspaceFmlGenerate(
      {
        imageName: ref('t.png'),
        combinedOutput: ref(null),
        scale: scale as never,
        setLocalError: () => {},
      },
      {
        appliedFmlThicknessLimits: ref({ minCm: 10, midCm: 20, maxCm: 30 }),
        appliedFmlBandBoundaries: ref({ midBoundaryCm: 15, maxBoundaryCm: 25 }),
        appliedFmlWallHeightCm: ref(280),
        appliedFmlDoorHeightCm: ref(210),
        appliedFmlWindowHeightCm: ref(120),
        appliedFmlWindowSillZCm: ref(90),
        fmlThicknessMinCm: ref(10),
        fmlThicknessMidCm: ref(20),
        fmlThicknessMaxCm: ref(30),
        fmlBandMidBoundaryCm: ref(15),
        fmlBandMaxBoundaryCm: ref(25),
        fmlWallHeightCm: ref(280),
        fmlDoorHeightCm: ref(210),
        fmlWindowHeightCm: ref(120),
        fmlWindowSillZCm: ref(90),
        fmlBovenlichtDefault: ref(false),
        fmlWindowBovenlichtDefault: ref(false),
        fmlBovenlichtHeightCm: ref(40),
        fmlBovenlichtGapCm: ref(10),
      },
    )

    const plan = samplePlan()
    // Alleen plan, geen persisted layout (zoals na gedeeltelijke hydrate).
    generate.updatePreviewPlan(plan)
    expect(generate.previewUnderlayLayout.value).toBeNull()

    const layout = { origin: { x: 50, y: 60 }, pxPerMmX: 1, pxPerMmY: 1 }
    const applied = generate.applyNulpuntAtFmlCm({ x: 100, y: 200 }, layout)
    expect(applied).not.toBeNull()
    expect(applied!.layout.origin).toEqual({ x: 150, y: 260 })
  })

  it('clearLiveFmlPreview wist preview zodat floor-remount geen stale plan krijgt', () => {
    const scale = {
      confirmed: ref(false),
      pixelsPerMillimeterX: ref(0),
      pixelsPerMillimeterY: ref(0),
    }
    const generate = createWorkspaceFmlGenerate(
      {
        imageName: ref('t.png'),
        combinedOutput: ref(null),
        scale: scale as never,
        setLocalError: () => {},
      },
      {
        appliedFmlThicknessLimits: ref({ minCm: 10, midCm: 20, maxCm: 30 }),
        appliedFmlBandBoundaries: ref({ midBoundaryCm: 15, maxBoundaryCm: 25 }),
        appliedFmlWallHeightCm: ref(280),
        appliedFmlDoorHeightCm: ref(210),
        appliedFmlWindowHeightCm: ref(120),
        appliedFmlWindowSillZCm: ref(90),
        fmlThicknessMinCm: ref(10),
        fmlThicknessMidCm: ref(20),
        fmlThicknessMaxCm: ref(30),
        fmlBandMidBoundaryCm: ref(15),
        fmlBandMaxBoundaryCm: ref(25),
        fmlWallHeightCm: ref(280),
        fmlDoorHeightCm: ref(210),
        fmlWindowHeightCm: ref(120),
        fmlWindowSillZCm: ref(90),
        fmlBovenlichtDefault: ref(false),
        fmlWindowBovenlichtDefault: ref(false),
        fmlBovenlichtHeightCm: ref(40),
        fmlBovenlichtGapCm: ref(10),
      },
    )

    generate.updatePreviewPlan(samplePlan(), {
      origin: { x: 1, y: 2 },
      pxPerMmX: 1,
      pxPerMmY: 1,
    })
    generate.setFmlNulpuntImageCm({ x: 9, y: 9 })
    expect(generate.previewPlan.value).not.toBeNull()

    generate.clearLiveFmlPreview()
    expect(generate.previewPlan.value).toBeNull()
    expect(generate.fmlNulpuntImageCm.value).toBeNull()
    expect(generate.previewUnderlayLayout.value).toBeNull()
  })
})
