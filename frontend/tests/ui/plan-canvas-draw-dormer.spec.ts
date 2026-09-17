import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { Point2D } from '@/core/plan/types'
import { DRAW_SEED_CM } from '@/ui/composables/canvas-kernel/plan-canvas-draw-measure'
import { usePlanCanvasDrawDormer } from '@/ui/composables/plan-canvas/usePlanCanvasDrawDormer'

function mouseAt(x: number, y: number): MouseEvent {
  return { clientX: x, clientY: y, ctrlKey: false, metaKey: false } as MouseEvent
}

function typeKey(key: string): KeyboardEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false } as KeyboardEvent
}

describe('usePlanCanvasDrawDormer', () => {
  function createDormer() {
    const applyDormerDraw = vi.fn(
      (_a: Point2D, _b: Point2D, _depth: Point2D, _t: number) => ['w1', 'w2', 'w3'],
    )
    const dormer = usePlanCanvasDrawDormer({
      hitTest: {
        clientToCm: (x, y) => ({ x, y }),
        hitTestJunctionAtCm: () => null,
      },
      editor: {
        pushUndo: vi.fn(),
        undo: vi.fn(),
        applyDormerDraw,
      } as never,
      hoveredJunctionId: ref(null),
      wallThicknessDraft: ref(20),
      resolveFrontPoint: (cm) => cm,
      beforeBegin: () => {},
      syncPlanToParent: () => {},
    })
    return { dormer, applyDormerDraw }
  }

  it('seeds 0.5 m front on first click and accepts typed width', () => {
    const scope = effectScope()
    scope.run(() => {
      const { dormer, applyDormerDraw } = createDormer()
      dormer.onDrawDormerClick(mouseAt(0, 0))
      expect(dormer.isDrafting()).toBe(true)
      expect(dormer.phase.value).toBe('front')
      expect(dormer.typeField.value).toBe('front')
      expect(dormer.handleTypeKey(typeKey('3'))).toBe(true)
      expect(dormer.measureLengthCm.value).toBeCloseTo(300)
      expect(applyDormerDraw).not.toHaveBeenCalled()
    })
    scope.stop()
  })

  it('Tab goes to depth step; typed depth places without moving the pointer', () => {
    const scope = effectScope()
    scope.run(() => {
      const { dormer, applyDormerDraw } = createDormer()
      dormer.onDrawDormerClick(mouseAt(0, 0))
      expect(dormer.handleTypeKey(typeKey('4'))).toBe(true)
      expect(dormer.measureLengthCm.value).toBeCloseTo(400)
      expect(dormer.handleTypeKey(typeKey('Tab'))).toBe(true)
      expect(dormer.phase.value).toBe('depth')
      expect(dormer.typeField.value).toBe('depth')
      expect(dormer.measureDepthCm.value).toBeCloseTo(DRAW_SEED_CM)
      expect(dormer.handleTypeKey(typeKey('2'))).toBe(true)
      expect(dormer.measureDepthCm.value).toBeCloseTo(200)
      expect(dormer.commitFromMeasure()).toBe(true)
      expect(applyDormerDraw).toHaveBeenCalledTimes(1)
      const [frontA, frontB, depth] = applyDormerDraw.mock.calls[0]
      const leftX = frontB.y - frontA.y
      const leftY = frontA.x - frontB.x
      const leftLen = Math.hypot(leftX, leftY)
      const mid = { x: (frontA.x + frontB.x) / 2, y: (frontA.y + frontB.y) / 2 }
      const signed = ((depth.x - mid.x) * leftX + (depth.y - mid.y) * leftY) / leftLen
      expect(Math.abs(signed)).toBeCloseTo(200)
    })
    scope.stop()
  })

  it('hover does not overwrite a typed front or depth', () => {
    const scope = effectScope()
    scope.run(() => {
      const { dormer } = createDormer()
      dormer.onDrawDormerClick(mouseAt(0, 0))
      dormer.handleTypeKey(typeKey('3'))
      dormer.updateDrawDormerHover(mouseAt(900, 0))
      expect(dormer.measureLengthCm.value).toBeCloseTo(300)
      dormer.handleTypeKey(typeKey('Tab'))
      dormer.handleTypeKey(typeKey('1'))
      dormer.updateDrawDormerHover(mouseAt(0, 800))
      expect(dormer.measureDepthCm.value).toBeCloseTo(100)
    })
    scope.stop()
  })
})
