import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { Wall } from '@/core/fml/types'
import { usePlanCanvasJunctionMove } from '@/ui/composables/plan-canvas/usePlanCanvasJunctionMove'
import type { RenderJunction } from '@/ui/composables/plan-canvas/plan-canvas-render-types'

function mouseAt(x: number, y: number, mods?: { ctrlKey?: boolean }): MouseEvent {
  return { clientX: x, clientY: y, ctrlKey: mods?.ctrlKey === true } as MouseEvent
}

function typeKey(key: string): KeyboardEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false } as KeyboardEvent
}

function wall(id: string, a = { x: 0, y: 0 }, b = { x: 200, y: 0 }): Wall {
  return {
    id,
    a,
    b,
    thickness: 20,
    balance: 0.5,
    openings: [],
  }
}

function junctionAt(id: string, x: number, y: number, wallId: string): RenderJunction {
  return {
    id,
    x,
    y,
    cmX: x,
    cmY: y,
    refs: [{ wallId, end: 'a' }],
    wallCount: 1,
  }
}

describe('usePlanCanvasJunctionMove typed distance', () => {
  it('commits a 0.4 cm typed move in centimetres', () => {
    const scope = effectScope()
    scope.run(() => {
      const preview = vi.fn()
      const syncPlanToParent = vi.fn()
      const walls = [wall('w1')]
      const move = usePlanCanvasJunctionMove({
        hitTest: { clientToCm: (x, y) => ({ x, y }) },
        editor: {
          pushUndo: vi.fn(),
          undo: vi.fn(),
          flushAreaRegen: vi.fn(),
          previewJunctionMove: preview,
          snapJunctionPoint: (_refs: unknown, candidate: { x: number; y: number }) => candidate,
          findMergeTarget: () => null,
          applyJunctionMerge: vi.fn(),
          junctions: { value: [] },
          walls: { value: walls },
          ridgeWalls: { value: [] },
          areas: { value: [] },
        } as never,
        pinnedJunctionId: ref(null),
        draggingJunctionId: ref(null),
        spacePressed: ref(false),
        getInputUnit: () => 'cm',
        syncPlanToParent,
      })

      const node = junctionAt('j1', 0, 0, 'w1')
      expect(move.beginJunctionMove(node, mouseAt(0, 0))).toBe(true)
      move.updateJunctionMoveHover(mouseAt(20, 0))
      expect(move.handleTypeKey(typeKey('0'))).toBe(true)
      expect(move.handleTypeKey(typeKey('.'))).toBe(true)
      expect(move.handleTypeKey(typeKey('4'))).toBe(true)
      expect(move.measureLengthCm.value).toBeCloseTo(0.4)
      expect(move.commitFromMeasure()).toBe(true)
      expect(syncPlanToParent).toHaveBeenCalled()
      const last = preview.mock.calls.at(-1)
      expect(last?.[2].x).toBeCloseTo(0.4)
      expect(last?.[2].y).toBeCloseTo(0)
    })
    scope.stop()
  })

  it('cancels a click move smaller than 0.5 cm', () => {
    const scope = effectScope()
    scope.run(() => {
      const undo = vi.fn()
      const syncPlanToParent = vi.fn()
      const walls = [wall('w1')]
      const move = usePlanCanvasJunctionMove({
        hitTest: { clientToCm: (x, y) => ({ x, y }) },
        editor: {
          pushUndo: vi.fn(),
          undo,
          flushAreaRegen: vi.fn(),
          previewJunctionMove: vi.fn(),
          snapJunctionPoint: (_refs: unknown, candidate: { x: number; y: number }) => candidate,
          findMergeTarget: () => null,
          applyJunctionMerge: vi.fn(),
          junctions: { value: [] },
          walls: { value: walls },
          ridgeWalls: { value: [] },
          areas: { value: [] },
        } as never,
        pinnedJunctionId: ref(null),
        draggingJunctionId: ref(null),
        spacePressed: ref(false),
        syncPlanToParent,
      })

      expect(move.beginJunctionMove(junctionAt('j1', 0, 0, 'w1'), mouseAt(0, 0))).toBe(true)
      move.updateJunctionMoveHover(mouseAt(0.3, 0))
      expect(move.commitFromMeasure()).toBe(false)
      expect(undo).toHaveBeenCalled()
      expect(syncPlanToParent).not.toHaveBeenCalled()
    })
    scope.stop()
  })

  it('skips snap when Ctrl is held during hover', () => {
    const scope = effectScope()
    scope.run(() => {
      const snap = vi.fn((_refs: unknown, candidate: { x: number; y: number }) => ({
        x: candidate.x + 50,
        y: candidate.y,
      }))
      const preview = vi.fn()
      const walls = [wall('w1')]
      const move = usePlanCanvasJunctionMove({
        hitTest: { clientToCm: (x, y) => ({ x, y }) },
        editor: {
          pushUndo: vi.fn(),
          undo: vi.fn(),
          flushAreaRegen: vi.fn(),
          previewJunctionMove: preview,
          snapJunctionPoint: snap,
          findMergeTarget: () => null,
          applyJunctionMerge: vi.fn(),
          junctions: { value: [] },
          walls: { value: walls },
          ridgeWalls: { value: [] },
          areas: { value: [] },
        } as never,
        pinnedJunctionId: ref(null),
        draggingJunctionId: ref(null),
        spacePressed: ref(false),
        syncPlanToParent: vi.fn(),
      })

      expect(move.beginJunctionMove(junctionAt('j1', 0, 0, 'w1'), mouseAt(0, 0))).toBe(true)
      move.updateJunctionMoveHover(mouseAt(10, 0, { ctrlKey: true }))
      expect(snap).not.toHaveBeenCalled()
      expect(preview.mock.calls.at(-1)?.[2]).toEqual({ x: 10, y: 0 })
    })
    scope.stop()
  })

  it('merges into a nearby junction on commit', () => {
    const scope = effectScope()
    scope.run(() => {
      const applyMerge = vi.fn()
      const other = {
        id: 'j2',
        refs: [{ wallId: 'w2', end: 'a' as const }],
        x: 20,
        y: 0,
      }
      const walls = [wall('w1'), wall('w2', { x: 20, y: 0 }, { x: 100, y: 0 })]
      const move = usePlanCanvasJunctionMove({
        hitTest: { clientToCm: (x, y) => ({ x, y }) },
        editor: {
          pushUndo: vi.fn(),
          undo: vi.fn(),
          flushAreaRegen: vi.fn(),
          previewJunctionMove: vi.fn(),
          snapJunctionPoint: (_refs: unknown, candidate: { x: number; y: number }) => candidate,
          findMergeTarget: () => other,
          applyJunctionMerge: applyMerge,
          junctions: {
            value: [{ id: 'j1', refs: [{ wallId: 'w1', end: 'a' }], x: 20, y: 0 }, other],
          },
          walls: { value: walls },
          ridgeWalls: { value: [] },
          areas: { value: [] },
        } as never,
        pinnedJunctionId: ref(null),
        draggingJunctionId: ref(null),
        spacePressed: ref(false),
        syncPlanToParent: vi.fn(),
      })

      expect(move.beginJunctionMove(junctionAt('j1', 0, 0, 'w1'), mouseAt(0, 0))).toBe(true)
      move.updateJunctionMoveHover(mouseAt(20, 0))
      expect(move.commitFromMeasure()).toBe(true)
      expect(applyMerge).toHaveBeenCalled()
    })
    scope.stop()
  })
})
