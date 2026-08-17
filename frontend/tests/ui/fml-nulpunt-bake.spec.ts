import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import { useFmlPreviewNulpunt } from '@/ui/composables/fml-preview/useFmlPreviewNulpunt'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'

function samplePlan(): FloorPlan {
  return {
    name: 'Test',
    floors: [
      {
        name: 'BG',
        level: 0,
        height: 280,
        walls: [
          {
            id: 'w1',
            a: { x: 10, y: 20 },
            b: { x: 110, y: 20 },
            thickness: 15,
            openings: [],
          },
        ],
        items: [],
      },
      {
        name: '1e',
        level: 1,
        height: 280,
        walls: [
          {
            id: 'w2',
            a: { x: 80, y: 90 },
            b: { x: 180, y: 90 },
            thickness: 15,
            openings: [],
          },
        ],
        items: [],
      },
    ],
  }
}

function mouseAt(clientX: number, clientY: number): MouseEvent {
  return { clientX, clientY } as MouseEvent
}

function installWindowStub(): {
  getMouseup: () => ((event: MouseEvent) => void) | null
  restore: () => void
} {
  let mouseupHandler: ((event: MouseEvent) => void) | null = null
  const stub = {
    addEventListener(type: string, handler: EventListenerOrEventListenerObject) {
      if (type === 'mouseup') mouseupHandler = handler as (event: MouseEvent) => void
    },
    removeEventListener(type: string) {
      if (type === 'mouseup') mouseupHandler = null
    },
  }
  vi.stubGlobal('window', stub)
  return {
    getMouseup: () => mouseupHandler,
    restore: () => vi.unstubAllGlobals(),
  }
}

function makeEditor(plan: FloorPlan, floorIndex = 0): ReturnType<typeof useFmlPreviewEditor> {
  const localPlan = ref(plan)
  const floorIdx = ref(floorIndex)
  return {
    localPlan,
    floorIndex: floorIdx,
    walls: computed(() => localPlan.value.floors[floorIdx.value]?.walls ?? []),
    pushUndo: vi.fn(),
    prepareParentSync: vi.fn(),
    replaceLocalPlan: vi.fn((next: FloorPlan) => {
      localPlan.value = next
    }),
  } as unknown as ReturnType<typeof useFmlPreviewEditor>
}

describe('useFmlPreviewNulpunt bake flow', () => {
  it('✓ bakt alleen actieve floor; andere floors ongemoeid; nudge i.p.v. refit', () => {
    const plan = samplePlan()
    const layout = { origin: { x: 100, y: 200 }, pxPerMmX: 1, pxPerMmY: 1 }
    const editor = makeEditor(plan, 0)
    const nulpuntMode = ref(true)
    const setNulpunt = vi.fn()
    const nudge = vi.fn()
    const win = installWindowStub()

    const api = useFmlPreviewNulpunt({
      hitTest: { clientToCm: (x, y) => ({ x, y }) },
      editor,
      nulpuntMode,
      getUnderlayLayout: () => layout,
      getFloorIndex: () => 0,
      setFmlNulpuntImageCm: setNulpunt,
      markParentPlanSync: vi.fn(),
      nudgeContentLayout: nudge,
      beforeBegin: vi.fn(),
    })

    api.beginNulpuntDrag(mouseAt(40, 60))
    win.getMouseup()!(mouseAt(40, 60))

    const baked = api.confirmNulpuntBake()
    expect(baked).not.toBeNull()
    expect(baked!.plan.floors[0].walls[0].a).toEqual({ x: -30, y: -40 })
    expect(baked!.plan.floors[1].walls[0].a).toEqual({ x: 80, y: 90 })
    expect(baked!.layout.origin).toEqual({ x: 140, y: 260 })
    expect(setNulpunt).toHaveBeenCalledWith({ x: 140, y: 260 })
    expect(nudge).toHaveBeenCalledWith(-40, -60)
    expect(api.nulpuntDisplayCm.value).toEqual({ x: 0, y: 0 })

    win.restore()
  })

  it('tool uit wist pending zonder bakken', () => {
    const plan = samplePlan()
    const layout = { origin: { x: 0, y: 0 }, pxPerMmX: 1, pxPerMmY: 1 }
    const editor = makeEditor(plan)
    const nulpuntMode = ref(true)
    const setNulpunt = vi.fn()
    const win = installWindowStub()

    const api = useFmlPreviewNulpunt({
      hitTest: { clientToCm: (x, y) => ({ x, y }) },
      editor,
      nulpuntMode,
      getUnderlayLayout: () => layout,
      getFloorIndex: () => 0,
      setFmlNulpuntImageCm: setNulpunt,
      markParentPlanSync: vi.fn(),
      nudgeContentLayout: vi.fn(),
      beforeBegin: vi.fn(),
    })

    api.beginNulpuntDrag(mouseAt(12, 8))
    win.getMouseup()!(mouseAt(12, 8))
    nulpuntMode.value = false
    expect(api.nulpuntPendingCm.value).toBeNull()
    expect(setNulpunt).not.toHaveBeenCalled()

    win.restore()
  })
})
