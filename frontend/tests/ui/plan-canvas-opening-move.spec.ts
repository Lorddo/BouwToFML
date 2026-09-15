import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { Wall } from '@/core/plan/types'
import { buildLocalOpeningId } from '@/core/plan/opening-ids'
import { slideOpeningAlongWall } from '@/core/plan/opening-drag-geom'
import { usePlanCanvasOpeningMove } from '@/ui/composables/plan-canvas/usePlanCanvasOpeningMove'

function mouseAt(x: number, y: number): MouseEvent {
  return { clientX: x, clientY: y } as MouseEvent
}

function typeKey(key: string): KeyboardEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false } as KeyboardEvent
}

function doorWall(id: string, t = 0.5): Wall {
  return {
    id,
    a: { x: 0, y: 0 },
    b: { x: 200, y: 0 },
    thickness: 20,
    balance: 0.5,
    openings: [
      {
        type: 'door',
        id: 'door-1',
        kind: 'door.single',
        t,
        width: 90,
        mirrored: [0, 1],
      },
    ],
  }
}

describe('slideOpeningAlongWall', () => {
  it('slides along the same wall without hop', () => {
    const walls = [doorWall('w1', 0.5), doorWall('w2', 0.5)]
    const openingId = buildLocalOpeningId('w1', walls[0].openings[0], 0)
    const result = slideOpeningAlongWall(walls, openingId, 20)
    expect(result).not.toBeNull()
    expect(result!.openingId).toBe(openingId)
    const moved = result!.walls.find((wall) => wall.id === 'w1')!.openings[0]
    expect(moved.t).toBeCloseTo(0.6)
    expect(result!.walls.find((wall) => wall.id === 'w2')!.openings[0].t).toBe(0.5)
  })
})

describe('usePlanCanvasOpeningMove typed distance', () => {
  it('commits a typed slide along the wall axis', () => {
    const scope = effectScope()
    scope.run(() => {
      const walls = [doorWall('w1', 0.5)]
      const openingId = buildLocalOpeningId('w1', walls[0].openings[0], 0)
      const preview = vi.fn((_base: Wall[], id: string, delta: number) => {
        const next = slideOpeningAlongWall(_base, id, delta)
        if (next) walls.splice(0, walls.length, ...next.walls)
        return next?.openingId ?? null
      })
      const syncPlanToParent = vi.fn()
      const move = usePlanCanvasOpeningMove({
        hitTest: { clientToCm: (x, y) => ({ x, y }) },
        editor: {
          pushUndo: vi.fn(),
          undo: vi.fn(),
          previewOpeningSlideAlongWall: preview,
          resolveOpening: (id: string) => {
            const wall = walls.find((item) =>
              item.openings.some(
                (_, index) => buildLocalOpeningId(item.id, item.openings[index], index) === id,
              ),
            )
            if (!wall) return null
            const openingIndex = wall.openings.findIndex(
              (_, index) => buildLocalOpeningId(wall.id, wall.openings[index], index) === id,
            )
            return {
              id,
              wallId: wall.id,
              wallIndex: 0,
              wall,
              openingIndex,
              opening: wall.openings[openingIndex],
            }
          },
          walls: { value: walls },
        } as never,
        moveOpeningId: ref(null),
        spacePressed: ref(false),
        getInputUnit: () => 'cm',
        syncPlanToParent,
      })

      expect(move.beginOpeningMove(openingId, mouseAt(100, 0))).toBe(true)
      move.updateOpeningMoveHover(mouseAt(140, 0))
      expect(move.handleTypeKey(typeKey('2'))).toBe(true)
      expect(move.handleTypeKey(typeKey('0'))).toBe(true)
      expect(move.measureLengthCm.value).toBeCloseTo(20)
      expect(move.commitFromMeasure()).toBe(true)
      expect(syncPlanToParent).toHaveBeenCalled()
      expect(preview.mock.calls.at(-1)?.[2]).toBeCloseTo(20)
      expect(walls[0].openings[0].t).toBeCloseTo(0.6)
    })
    scope.stop()
  })

  it('reverses direction with a negative typed distance', () => {
    const scope = effectScope()
    scope.run(() => {
      const walls = [doorWall('w1', 0.5)]
      const openingId = buildLocalOpeningId('w1', walls[0].openings[0], 0)
      const preview = vi.fn((_base: Wall[], id: string, delta: number) => {
        const next = slideOpeningAlongWall(_base, id, delta)
        return next?.openingId ?? null
      })
      const move = usePlanCanvasOpeningMove({
        hitTest: { clientToCm: (x, y) => ({ x, y }) },
        editor: {
          pushUndo: vi.fn(),
          undo: vi.fn(),
          previewOpeningSlideAlongWall: preview,
          resolveOpening: () => ({
            id: openingId,
            wallId: 'w1',
            wallIndex: 0,
            wall: walls[0],
            openingIndex: 0,
            opening: walls[0].openings[0],
          }),
          walls: { value: walls },
        } as never,
        moveOpeningId: ref(null),
        spacePressed: ref(false),
        getInputUnit: () => 'cm',
        syncPlanToParent: vi.fn(),
      })

      expect(move.beginOpeningMove(openingId, mouseAt(100, 0))).toBe(true)
      move.updateOpeningMoveHover(mouseAt(140, 0))
      expect(move.handleTypeKey(typeKey('-'))).toBe(true)
      expect(move.handleTypeKey(typeKey('1'))).toBe(true)
      expect(move.handleTypeKey(typeKey('0'))).toBe(true)
      expect(preview.mock.calls.at(-1)?.[2]).toBeCloseTo(-10)
    })
    scope.stop()
  })

  it('cancels a click move smaller than 0.5 cm', () => {
    const scope = effectScope()
    scope.run(() => {
      const undo = vi.fn()
      const walls = [doorWall('w1', 0.5)]
      const openingId = buildLocalOpeningId('w1', walls[0].openings[0], 0)
      const move = usePlanCanvasOpeningMove({
        hitTest: { clientToCm: (x, y) => ({ x, y }) },
        editor: {
          pushUndo: vi.fn(),
          undo,
          previewOpeningSlideAlongWall: vi.fn(() => openingId),
          resolveOpening: () => ({
            id: openingId,
            wallId: 'w1',
            wallIndex: 0,
            wall: walls[0],
            openingIndex: 0,
            opening: walls[0].openings[0],
          }),
          walls: { value: walls },
        } as never,
        moveOpeningId: ref(null),
        spacePressed: ref(false),
        syncPlanToParent: vi.fn(),
      })

      expect(move.beginOpeningMove(openingId, mouseAt(100, 0))).toBe(true)
      move.updateOpeningMoveHover(mouseAt(100.3, 0))
      expect(move.commitFromMeasure()).toBe(false)
      expect(undo).toHaveBeenCalled()
    })
    scope.stop()
  })
})
