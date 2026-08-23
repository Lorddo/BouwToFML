import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { Wall } from '@/core/fml/types'
import { useFmlPreviewWallMove } from '@/ui/composables/fml-preview/useFmlPreviewWallMove'

function mouseAt(x: number, y: number): MouseEvent {
  return { clientX: x, clientY: y } as MouseEvent
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

describe('useFmlPreviewWallMove typed distance', () => {
  it('commits a 0.4 cm typed move in centimetres', () => {
    const scope = effectScope()
    scope.run(() => {
      const preview = vi.fn()
      const syncPlanToParent = vi.fn()
      const moveWallId = ref<string | null>(null)
      const walls = [wall('w1')]
      const move = useFmlPreviewWallMove({
        hitTest: { clientToCm: (x, y) => ({ x, y }) },
        editor: {
          pushUndo: vi.fn(),
          undo: vi.fn(),
          flushAreaRegen: vi.fn(),
          previewWallSlideAlongAxis: preview,
          selectableWalls: { value: walls },
          walls: { value: walls },
          ridgeWalls: { value: [] },
          areas: { value: [] },
        } as never,
        moveWallId,
        spacePressed: ref(false),
        getInputUnit: () => 'cm',
        syncPlanToParent,
      })

      expect(move.beginWallMove('w1', mouseAt(100, 0))).toBe(true)
      move.updateWallMoveHover(mouseAt(100, 20))
      expect(move.handleTypeKey(typeKey('0'))).toBe(true)
      expect(move.handleTypeKey(typeKey('.'))).toBe(true)
      expect(move.handleTypeKey(typeKey('4'))).toBe(true)
      expect(move.measureLengthCm.value).toBeCloseTo(0.4)
      expect(move.commitFromMeasure()).toBe(true)
      expect(syncPlanToParent).toHaveBeenCalled()
      const last = preview.mock.calls.at(-1)
      expect(last?.[2]).toBeCloseTo(0.4)
    })
    scope.stop()
  })

  it('commits 0.004 m as a 0.4 cm move', () => {
    const scope = effectScope()
    scope.run(() => {
      const preview = vi.fn()
      const walls = [wall('w1')]
      const move = useFmlPreviewWallMove({
        hitTest: { clientToCm: (x, y) => ({ x, y }) },
        editor: {
          pushUndo: vi.fn(),
          undo: vi.fn(),
          flushAreaRegen: vi.fn(),
          previewWallSlideAlongAxis: preview,
          selectableWalls: { value: walls },
          walls: { value: walls },
          ridgeWalls: { value: [] },
          areas: { value: [] },
        } as never,
        moveWallId: ref(null),
        spacePressed: ref(false),
        getInputUnit: () => 'm',
        syncPlanToParent: vi.fn(),
      })

      expect(move.beginWallMove('w1', mouseAt(100, 0))).toBe(true)
      move.updateWallMoveHover(mouseAt(100, 20))
      for (const key of ['0', '.', '0', '0', '4']) {
        expect(move.handleTypeKey(typeKey(key))).toBe(true)
      }
      expect(move.measureLengthCm.value).toBeCloseTo(0.4)
      expect(move.commitFromMeasure()).toBe(true)
    })
    scope.stop()
  })

  it('snaps hover slide to another junction within 8 cm', () => {
    const scope = effectScope()
    scope.run(() => {
      const preview = vi.fn()
      const walls = [
        wall('w1', { x: 0, y: 100 }, { x: 200, y: 100 }),
        wall('w2', { x: 400, y: 180 }, { x: 500, y: 180 }),
      ]
      const move = useFmlPreviewWallMove({
        hitTest: { clientToCm: (x, y) => ({ x, y }) },
        editor: {
          pushUndo: vi.fn(),
          undo: vi.fn(),
          flushAreaRegen: vi.fn(),
          previewWallSlideAlongAxis: preview,
          selectableWalls: { value: walls },
          walls: { value: walls },
          ridgeWalls: { value: [] },
          areas: { value: [] },
        } as never,
        moveWallId: ref(null),
        spacePressed: ref(false),
        syncPlanToParent: vi.fn(),
      })

      expect(move.beginWallMove('w1', mouseAt(100, 100))).toBe(true)
      move.updateWallMoveHover(mouseAt(100, 175))
      const last = preview.mock.calls.at(-1)
      expect(last?.[2]).toBeCloseTo(80)
      expect(move.measureLengthCm.value).toBeCloseTo(80)
    })
    scope.stop()
  })

  it('commits a 1 mm typed move', () => {
    const scope = effectScope()
    scope.run(() => {
      const preview = vi.fn()
      const syncPlanToParent = vi.fn()
      const walls = [wall('w1')]
      const move = useFmlPreviewWallMove({
        hitTest: { clientToCm: (x, y) => ({ x, y }) },
        editor: {
          pushUndo: vi.fn(),
          undo: vi.fn(),
          flushAreaRegen: vi.fn(),
          previewWallSlideAlongAxis: preview,
          selectableWalls: { value: walls },
          walls: { value: walls },
          ridgeWalls: { value: [] },
          areas: { value: [] },
        } as never,
        moveWallId: ref(null),
        spacePressed: ref(false),
        getInputUnit: () => 'mm',
        syncPlanToParent,
      })

      expect(move.beginWallMove('w1', mouseAt(100, 0))).toBe(true)
      move.updateWallMoveHover(mouseAt(100, 20))
      expect(move.handleTypeKey(typeKey('1'))).toBe(true)
      expect(move.measureLengthCm.value).toBeCloseTo(0.1)
      expect(move.commitFromMeasure()).toBe(true)
      expect(syncPlanToParent).toHaveBeenCalled()
      expect(preview.mock.calls.at(-1)?.[2]).toBeCloseTo(0.1)
    })
    scope.stop()
  })

  it('cancels a 1 mm click move — only typed input may be that small', () => {
    const scope = effectScope()
    scope.run(() => {
      const undo = vi.fn()
      const syncPlanToParent = vi.fn()
      const walls = [wall('w1')]
      const move = useFmlPreviewWallMove({
        hitTest: { clientToCm: (x, y) => ({ x, y }) },
        editor: {
          pushUndo: vi.fn(),
          undo,
          flushAreaRegen: vi.fn(),
          previewWallSlideAlongAxis: vi.fn(),
          selectableWalls: { value: walls },
          walls: { value: walls },
          ridgeWalls: { value: [] },
          areas: { value: [] },
        } as never,
        moveWallId: ref(null),
        spacePressed: ref(false),
        syncPlanToParent,
      })

      expect(move.beginWallMove('w1', mouseAt(100, 0))).toBe(true)
      move.updateWallMoveHover(mouseAt(100, 0.1))
      expect(move.commitFromMeasure()).toBe(false)
      expect(undo).toHaveBeenCalled()
      expect(syncPlanToParent).not.toHaveBeenCalled()
    })
    scope.stop()
  })

  it('cancels a click move smaller than 0.5 cm', () => {
    const scope = effectScope()
    scope.run(() => {
      const undo = vi.fn()
      const syncPlanToParent = vi.fn()
      const walls = [wall('w1')]
      const move = useFmlPreviewWallMove({
        hitTest: { clientToCm: (x, y) => ({ x, y }) },
        editor: {
          pushUndo: vi.fn(),
          undo,
          flushAreaRegen: vi.fn(),
          previewWallSlideAlongAxis: vi.fn(),
          selectableWalls: { value: walls },
          walls: { value: walls },
          ridgeWalls: { value: [] },
          areas: { value: [] },
        } as never,
        moveWallId: ref(null),
        spacePressed: ref(false),
        syncPlanToParent,
      })

      expect(move.beginWallMove('w1', mouseAt(100, 0))).toBe(true)
      move.updateWallMoveHover(mouseAt(100, 0.3))
      expect(move.commitFromMeasure()).toBe(false)
      expect(undo).toHaveBeenCalled()
      expect(syncPlanToParent).not.toHaveBeenCalled()
    })
    scope.stop()
  })
})
