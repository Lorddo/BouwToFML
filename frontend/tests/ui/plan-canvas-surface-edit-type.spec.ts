import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { RIDGE_DESIGN_NAME, RIDGE_DESIGN_ROLE } from '@/core/plan/ridge-walls'
import type { FloorPlan } from '@/core/plan/types'
import { usePlanCanvasSurfaceEdit } from '@/ui/composables/plan-canvas/usePlanCanvasSurfaceEdit'
import { createPlanCanvasSelection } from '@/ui/composables/plan-canvas/plan-canvas-selection'
import { usePlanEditor } from '@/ui/composables/usePlanEditor'

function typeKey(key: string): KeyboardEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false } as KeyboardEvent
}

function planWithRoof(): FloorPlan {
  return {
    name: 'Test',
    floors: [
      {
        name: 'BG',
        level: 0,
        height: 280,
        walls: [],
        designs: [
          {
            name: RIDGE_DESIGN_NAME,
            role: RIDGE_DESIGN_ROLE,
            walls: [],
            surfaces: [
              {
                id: 'roof-1',
                isRoof: true,
                color: '#888',
                showAreaLabel: false,
                poly: [
                  { x: 0, y: 0, z: 250 },
                  { x: 400, y: 0, z: 250 },
                  { x: 400, y: 300, z: 400 },
                  { x: 0, y: 300, z: 400 },
                ],
              },
            ],
            source: { settings: { engineAutoDims: false } },
          },
        ],
      },
    ],
  }
}

async function selectRoofVertex(
  selection: ReturnType<typeof createPlanCanvasSelection>,
  surfaceEdit: ReturnType<typeof usePlanCanvasSurfaceEdit>,
  surfaceId: string,
  vertexIndex: number,
): Promise<void> {
  selection.surfaceEditId.value = surfaceId
  await nextTick()
  surfaceEdit.selectedVertexIndex.value = vertexIndex
  await nextTick()
}

describe('usePlanCanvasSurfaceEdit typed vertex Z', () => {
  it('typen zet de geselecteerde dakhoek-Z zonder toolbar-focus', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const plan = ref<FloorPlan | null>(planWithRoof())
      const floorIndex = ref(0)
      const editor = usePlanEditor(plan, floorIndex)
      const selection = createPlanCanvasSelection()
      const syncPlanToParent = vi.fn()
      const surfaceEdit = usePlanCanvasSurfaceEdit({
        selection,
        editor,
        hitTest: { clientToCm: () => null },
        resolvePoint: (cm) => cm,
        axisLocked: ref(false),
        syncPlanToParent,
        getInputUnit: () => 'm',
      })

      await selectRoofVertex(selection, surfaceEdit, 'roof-1', 0)
      expect(surfaceEdit.measureLengthCm.value).toBe(250)

      expect(surfaceEdit.handleTypeKey(typeKey('3'))).toBe(true)
      expect(surfaceEdit.handleTypeKey(typeKey('.'))).toBe(true)
      expect(surfaceEdit.handleTypeKey(typeKey('1'))).toBe(true)
      expect(surfaceEdit.typeText.value).toBe('3.1')
      expect(surfaceEdit.measureLengthCm.value).toBeCloseTo(310)

      const surface = editor.surfaces.value.find((s) => s.id === 'roof-1')
      expect(surface?.poly[0]?.z).toBeCloseTo(310)
      expect(syncPlanToParent).toHaveBeenCalled()

      expect(surfaceEdit.commitFromMeasure()).toBe(true)
      expect(surfaceEdit.typeText.value).toBe('')
      expect(surfaceEdit.measureLengthCm.value).toBeCloseTo(310)
    })
    scope.stop()
  })

  it('clearTypeDraft wist alleen de typ-draft, Z blijft staan', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const plan = ref<FloorPlan | null>(planWithRoof())
      const floorIndex = ref(0)
      const editor = usePlanEditor(plan, floorIndex)
      const selection = createPlanCanvasSelection()
      const surfaceEdit = usePlanCanvasSurfaceEdit({
        selection,
        editor,
        hitTest: { clientToCm: () => null },
        resolvePoint: (cm) => cm,
        axisLocked: ref(false),
        syncPlanToParent: () => undefined,
        getInputUnit: () => 'cm',
      })

      await selectRoofVertex(selection, surfaceEdit, 'roof-1', 2)
      expect(surfaceEdit.handleTypeKey(typeKey('3'))).toBe(true)
      expect(surfaceEdit.handleTypeKey(typeKey('5'))).toBe(true)
      expect(surfaceEdit.handleTypeKey(typeKey('0'))).toBe(true)
      expect(editor.surfaces.value.find((s) => s.id === 'roof-1')?.poly[2]?.z).toBe(350)

      surfaceEdit.clearTypeDraft()
      expect(surfaceEdit.typeText.value).toBe('')
      expect(surfaceEdit.measureLengthCm.value).toBe(350)
      expect(editor.surfaces.value.find((s) => s.id === 'roof-1')?.poly[2]?.z).toBe(350)
    })
    scope.stop()
  })
})
