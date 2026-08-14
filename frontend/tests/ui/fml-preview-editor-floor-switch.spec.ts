import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'

function planWithWallX(x: number): FloorPlan {
  return {
    name: 'T',
    floors: [
      {
        name: 'F',
        level: 0,
        height: 280,
        walls: [
          {
            id: 'w1',
            a: { x, y: 0 },
            b: { x: x + 10, y: 0 },
            thickness: 10,
            openings: [],
          },
        ],
      },
    ],
  }
}

describe('FmlPreviewEditor floor-switch', () => {
  it('cleart localPlan bij parent null ook als parent-sync-skip open staat', async () => {
    const plan = ref<FloorPlan | null>(planWithWallX(100))
    const floorIndex = ref(0)
    const editor = useFmlPreviewEditor(plan, floorIndex)
    await nextTick()
    expect(editor.walls.value[0]?.a.x).toBe(100)

    editor.prepareParentSync()
    // Floor-switch: clearWorkspace zet plan op null terwijl skip nog open is.
    plan.value = null
    await nextTick()
    expect(editor.walls.value).toEqual([])

    plan.value = planWithWallX(200)
    await nextTick()
    expect(editor.walls.value[0]?.a.x).toBe(200)
  })
})
