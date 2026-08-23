import { describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import { findRidgeDesignIndex } from '@/core/fml/ridge-walls'
import type { FloorPlan, Point2D } from '@/core/fml/types'
import { useFmlPreviewDrawSurface } from '@/ui/composables/fml-preview/useFmlPreviewDrawSurface'
import { createFmlPreviewSelection } from '@/ui/composables/fml-preview/fml-preview-selection'
import { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'

function emptyPlan(): FloorPlan {
  return {
    name: 'Test',
    floors: [{ name: 'BG', level: 0, height: 280, walls: [] }],
  }
}

function triangle(): Point2D[] {
  return [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
  ]
}

describe('useFmlPreviewDrawSurface', () => {
  it('plattegrond-surface met trapgat schrijft isCutout op de floor, niet op Dak', () => {
    const scope = effectScope()
    const plan = ref<FloorPlan | null>(emptyPlan())
    const floorIndex = ref(0)
    const editor = scope.run(() => useFmlPreviewEditor(plan, floorIndex))!
    const selection = createFmlPreviewSelection()
    const draw = scope.run(() =>
      useFmlPreviewDrawSurface({
        selection,
        editor,
        hitTest: { clientToCm: () => null },
        shiftPressed: ref(false),
        resolvePoint: (cm) => cm,
        beforeBegin: () => undefined,
        syncPlanToParent: () => undefined,
        isDak: () => false,
      }),
    )!
    selection.drawSurfacePoints.value = triangle()
    draw.pendingCutout.value = true

    expect(draw.commitDrawSurface()).toBe(true)
    const floor = editor.localPlan.value?.floors[0]
    const surface = floor?.surfaces?.[0]
    expect(surface?.isRoof).toBeUndefined()
    expect(surface?.isCutout).toBe(true)
    expect(surface?.customName).toBe('Trapgat')
    const ridgeIdx = findRidgeDesignIndex(floor!)
    expect(floor?.designs?.[ridgeIdx]?.surfaces ?? []).toHaveLength(0)

    scope.stop()
  })

  it('dakvlak blijft isRoof op het Dak-design zonder isCutout', () => {
    const scope = effectScope()
    const plan = ref<FloorPlan | null>(emptyPlan())
    const floorIndex = ref(0)
    const editor = scope.run(() => useFmlPreviewEditor(plan, floorIndex))!
    const selection = createFmlPreviewSelection()
    const draw = scope.run(() =>
      useFmlPreviewDrawSurface({
        selection,
        editor,
        hitTest: { clientToCm: () => null },
        shiftPressed: ref(false),
        resolvePoint: (cm) => cm,
        beforeBegin: () => undefined,
        syncPlanToParent: () => undefined,
        isDak: () => true,
      }),
    )!
    selection.drawSurfacePoints.value = triangle()
    draw.pendingCutout.value = true

    expect(draw.commitDrawSurface()).toBe(true)
    const floor = editor.localPlan.value?.floors[0]
    expect(floor?.surfaces ?? []).toHaveLength(0)
    const ridgeIdx = findRidgeDesignIndex(floor!)
    const roofs = floor?.designs?.[ridgeIdx]?.surfaces ?? []
    expect(roofs).toHaveLength(1)
    expect(roofs[0]?.isRoof).toBe(true)
    expect(roofs[0]?.isCutout).toBeUndefined()

    scope.stop()
  })
})

describe('useFmlPreviewEditor addSurface', () => {
  it('zonder isRoof blijft de surface op de plattegrond en update isCutout', () => {
    const scope = effectScope()
    const plan = ref<FloorPlan | null>(emptyPlan())
    const floorIndex = ref(0)
    const editor = scope.run(() => useFmlPreviewEditor(plan, floorIndex))!
    const id = editor.addSurface({
      poly: triangle(),
      color: '#FFFFFF',
      showAreaLabel: true,
    })
    expect(editor.localPlan.value?.floors[0]?.surfaces?.[0]?.id).toBe(id)
    editor.updateSurface(id, { isCutout: true })
    expect(editor.localPlan.value?.floors[0]?.surfaces?.[0]?.isCutout).toBe(true)
    scope.stop()
  })
})
