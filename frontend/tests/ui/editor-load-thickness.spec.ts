import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { FloorPlan } from '@/core/plan/types'
import { FACTORY_THICKNESS_CMS } from '@/core/plan/wall-thickness-catalog'
import { useEditorLoad } from '@/ui/composables/editor/useEditorLoad'

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0) as unknown as number
}

function planWithWall(): FloorPlan {
  return {
    name: 'converter',
    floors: [
      {
        name: 'Begane grond',
        level: 0,
        height: 260,
        walls: [
          { id: 'w0', a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, thickness: 20, openings: [] },
        ],
      },
    ],
  }
}

describe('useEditorLoad thickness catalog', () => {
  function harness() {
    const catalog = ref<number[]>([10, 20, 30])
    const api = useEditorLoad({
      plan: ref(null),
      warnings: ref([]),
      error: ref(null),
      fileName: ref(null),
      activeFloorIndex: ref(0),
      orientByFloor: ref({}),
      pendingAlignRebase: ref(null),
      contentOpacity: ref(0.8),
      hidePlanText: ref(false),
      floors: ref([]),
      t: (key) => key,
      flushPreviewFieldCommits: vi.fn(),
      cancelPlanRescale: vi.fn(),
      cancelUnderlayScale: vi.fn(),
      persistActiveUnderlayDrawing: vi.fn(),
      clearUnderlayState: vi.fn(),
      syncUnderlayForActiveFloor: vi.fn(async () => undefined),
      resetInspectState: vi.fn(),
      applyThicknessCatalog: (cms) => {
        catalog.value = [...cms]
      },
      clearUndoStacks: vi.fn(),
      pushUndo: vi.fn(),
    })
    return { api, catalog }
  }

  it('laadt converter-catalogus mee met loadPlan', async () => {
    const { api, catalog } = harness()
    await api.loadPlan(planWithWall(), 'project.plg', { thicknessCms: [7, 15, 30, 45] })
    expect(catalog.value).toEqual([7, 15, 30, 45])
    expect(api.hasOpenContent()).toBe(true)
  })

  it('startNewPlan zet de catalogus terug op de gebruikers-defaults', () => {
    const { api, catalog } = harness()
    catalog.value = [7, 15, 30]
    api.startNewPlan()
    expect(catalog.value).toEqual([...FACTORY_THICKNESS_CMS])
  })
})
