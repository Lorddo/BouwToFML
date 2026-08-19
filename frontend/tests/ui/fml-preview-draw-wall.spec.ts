import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import { useFmlPreviewDrawWall } from '@/ui/composables/fml-preview/useFmlPreviewDrawWall'

function mouseAt(x: number, y: number): MouseEvent {
  return { clientX: x, clientY: y } as MouseEvent
}

describe('useFmlPreviewDrawWall click-move-click', () => {
  it('places on second click, not via pointerup', () => {
    const scope = effectScope()
    scope.run(() => {
      const applyWallAdd = vi.fn((_a: Point2D, _b: Point2D, _t: number) => 'w-new')
      const pushUndo = vi.fn()
      const undo = vi.fn()
      const syncPlanToParent = vi.fn()
      const hoveredJunctionId = ref<string | null>(null)
      const wallThicknessDraft = ref(20)

      const wall = useFmlPreviewDrawWall({
        hitTest: {
          clientToCm: (x, y) => ({ x, y }),
          hitTestJunctionAtCm: () => null,
        },
        editor: {
          pushUndo,
          undo,
          applyWallAdd,
        } as never,
        hoveredJunctionId,
        wallThicknessDraft,
        resolvePoint: (cm) => cm,
        beforeBegin: () => {},
        syncPlanToParent,
      })

      wall.onDrawWallClick(mouseAt(0, 0))
      expect(wall.isDrafting()).toBe(true)
      expect(applyWallAdd).not.toHaveBeenCalled()

      wall.updateDrawWallHover(mouseAt(200, 0))
      expect(wall.measureLengthCm.value).toBeCloseTo(200)

      wall.onDrawWallClick(mouseAt(200, 0))
      expect(applyWallAdd).toHaveBeenCalledTimes(1)
      expect(applyWallAdd.mock.calls[0][0]).toEqual({ x: 0, y: 0 })
      expect(applyWallAdd.mock.calls[0][1]).toEqual({ x: 200, y: 0 })
      expect(wall.isDrafting()).toBe(false)
      expect(syncPlanToParent).toHaveBeenCalled()
    })
    scope.stop()
  })

  it('commitFromMeasure uses length override along hover direction', () => {
    const scope = effectScope()
    scope.run(() => {
      const applyWallAdd = vi.fn((_a: Point2D, _b: Point2D, _t: number) => 'w-new')
      const wall = useFmlPreviewDrawWall({
        hitTest: {
          clientToCm: (x, y) => ({ x, y }),
          hitTestJunctionAtCm: () => null,
        },
        editor: {
          pushUndo: vi.fn(),
          undo: vi.fn(),
          applyWallAdd,
        } as never,
        hoveredJunctionId: ref(null),
        wallThicknessDraft: ref(20),
        resolvePoint: (cm) => cm,
        beforeBegin: () => {},
        syncPlanToParent: () => {},
      })

      wall.onDrawWallClick(mouseAt(0, 0))
      wall.updateDrawWallHover(mouseAt(10, 0))
      wall.setLengthOverrideCm(350)
      expect(wall.commitFromMeasure()).toBe(true)
      expect(applyWallAdd.mock.calls[0][1].x).toBeCloseTo(350)
      expect(applyWallAdd.mock.calls[0][1].y).toBeCloseTo(0)
    })
    scope.stop()
  })
})
