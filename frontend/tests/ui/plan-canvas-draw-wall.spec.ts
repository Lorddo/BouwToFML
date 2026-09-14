import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { Point2D } from '@/core/plan/types'
import { usePlanCanvasDrawWall } from '@/ui/composables/plan-canvas/usePlanCanvasDrawWall'

function mouseAt(x: number, y: number): MouseEvent {
  return { clientX: x, clientY: y } as MouseEvent
}

function typeKey(key: string): KeyboardEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false } as KeyboardEvent
}

describe('usePlanCanvasDrawWall click-move-click', () => {
  it('places on second click, not via pointerup', () => {
    const scope = effectScope()
    scope.run(() => {
      const applyWallAdd = vi.fn((_a: Point2D, _b: Point2D, _t: number) => 'w-new')
      const pushUndo = vi.fn()
      const undo = vi.fn()
      const syncPlanToParent = vi.fn()
      const hoveredJunctionId = ref<string | null>(null)
      const wallThicknessDraft = ref(20)

      const wall = usePlanCanvasDrawWall({
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
      expect(wall.measureLengthCm.value).toBeCloseTo(50)
      expect(wall.drawWallPreview.value?.b).toEqual({ x: 0, y: -50 })
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
      const wall = usePlanCanvasDrawWall({
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

  it('negative length flips the seed direction', () => {
    const scope = effectScope()
    scope.run(() => {
      const applyWallAdd = vi.fn((_a: Point2D, _b: Point2D, _t: number) => 'w-new')
      const wall = usePlanCanvasDrawWall({
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
      wall.setLengthOverrideCm(-200)
      expect(wall.drawWallPreview.value?.b).toEqual({ x: 0, y: 200 })
      expect(wall.commitFromMeasure()).toBe(true)
      expect(applyWallAdd.mock.calls[0][1]).toEqual({ x: 0, y: 200 })
    })
    scope.stop()
  })

  it('typed inner length clears the connecting wall thickness', () => {
    const scope = effectScope()
    scope.run(() => {
      const applyWallAdd = vi.fn((_a: Point2D, _b: Point2D, _t: number) => 'w-new')
      const wall = usePlanCanvasDrawWall({
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
        getWalls: () => [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, balance: 0.5 }],
        beforeBegin: () => {},
        syncPlanToParent: () => {},
      })

      wall.onDrawWallClick(mouseAt(0, 0))
      expect(wall.measureLengthCm.value).toBeCloseTo(50)
      expect(wall.drawWallPreview.value?.b.y).toBeCloseTo(-60)
      wall.setLengthOverrideCm(200)
      expect(wall.measureLengthCm.value).toBeCloseTo(200)
      expect(wall.commitFromMeasure()).toBe(true)
      expect(applyWallAdd.mock.calls[0][1].y).toBeCloseTo(-210)
    })
    scope.stop()
  })

  it('types a length from the keyboard and freezes hover', () => {
    const scope = effectScope()
    scope.run(() => {
      const applyWallAdd = vi.fn((_a: Point2D, _b: Point2D, _t: number) => 'w-new')
      const wall = usePlanCanvasDrawWall({
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
      wall.updateDrawWallHover(mouseAt(80, 0))
      expect(wall.handleTypeKey(typeKey('3'))).toBe(true)
      expect(wall.handleTypeKey(typeKey('.'))).toBe(true)
      expect(wall.handleTypeKey(typeKey('5'))).toBe(true)
      expect(wall.measureLengthCm.value).toBeCloseTo(350)
      wall.updateDrawWallHover(mouseAt(80, 400))
      expect(wall.drawWallPreview.value?.b.y).toBeCloseTo(0)
      expect(wall.commitFromMeasure()).toBe(true)
      expect(applyWallAdd.mock.calls[0][1].x).toBeCloseTo(350)
      expect(applyWallAdd.mock.calls[0][1].y).toBeCloseTo(0)
    })
    scope.stop()
  })

  it('types a length in the selected ruler unit', () => {
    const scope = effectScope()
    scope.run(() => {
      const applyWallAdd = vi.fn((_a: Point2D, _b: Point2D, _t: number) => 'w-new')
      const wall = usePlanCanvasDrawWall({
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
        getInputUnit: () => 'cm',
        beforeBegin: () => {},
        syncPlanToParent: () => {},
      })

      wall.onDrawWallClick(mouseAt(0, 0))
      wall.updateDrawWallHover(mouseAt(80, 0))
      expect(wall.handleTypeKey(typeKey('9'))).toBe(true)
      expect(wall.handleTypeKey(typeKey('9'))).toBe(true)
      expect(wall.handleTypeKey(typeKey('.'))).toBe(true)
      expect(wall.handleTypeKey(typeKey('6'))).toBe(true)
      expect(wall.measureLengthCm.value).toBeCloseTo(99.6)
      expect(wall.commitFromMeasure()).toBe(true)
      expect(applyWallAdd.mock.calls[0][1].x).toBeCloseTo(99.6)
    })
    scope.stop()
  })

  it('does not place on second click when placeOnSecondClick is false', () => {
    const scope = effectScope()
    scope.run(() => {
      const applyWallAdd = vi.fn()
      const wall = usePlanCanvasDrawWall({
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
        placeOnSecondClick: () => false,
        beforeBegin: () => {},
        syncPlanToParent: () => {},
      })

      wall.onDrawWallClick(mouseAt(0, 0))
      wall.onDrawWallClick(mouseAt(180, 0))
      expect(applyWallAdd).not.toHaveBeenCalled()
      expect(wall.isDrafting()).toBe(true)
      expect(wall.drawWallPreview.value?.b).toEqual({ x: 180, y: 0 })
    })
    scope.stop()
  })

  it('handle hit on mobile does not place the seed wall', () => {
    const scope = effectScope()
    scope.run(() => {
      const applyWallAdd = vi.fn()
      const wall = usePlanCanvasDrawWall({
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
        handleTolCm: () => 20,
        placeOnSecondClick: () => false,
        beforeBegin: () => {},
        syncPlanToParent: () => {},
      })

      wall.onDrawWallClick(mouseAt(0, 0))
      wall.onDrawWallClick(mouseAt(0, -50))
      expect(applyWallAdd).not.toHaveBeenCalled()
      expect(wall.isDrafting()).toBe(true)
    })
    scope.stop()
  })
})
