import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { Point2D } from '@/core/fml/types'
import { DRAW_SEED_CM } from '@/ui/composables/fml-preview/fml-preview-draw-measure'
import { useFmlPreviewDrawRoom } from '@/ui/composables/fml-preview/useFmlPreviewDrawRoom'

function mouseAt(x: number, y: number): MouseEvent {
  return { clientX: x, clientY: y } as MouseEvent
}

function typeKey(key: string): KeyboardEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false } as KeyboardEvent
}

describe('useFmlPreviewDrawRoom', () => {
  function createRoom(placeOnSecondClick?: () => boolean) {
    const applyRoomRect = vi.fn((_corners: Point2D[], _t: number) => ['w1', 'w2', 'w3', 'w4'])
    const room = useFmlPreviewDrawRoom({
      hitTest: {
        clientToCm: (x, y) => ({ x, y }),
        hitTestJunctionAtCm: () => null,
      },
      editor: {
        pushUndo: vi.fn(),
        undo: vi.fn(),
        applyRoomRect,
      } as never,
      hoveredJunctionId: ref(null),
      wallThicknessDraft: ref(20),
      shiftPressed: ref(false),
      resolveStartPoint: (cm) => cm,
      resolveEndPoint: (cm) => cm,
      placeOnSecondClick,
      beforeBegin: () => {},
      syncPlanToParent: () => {},
    })
    return { room, applyRoomRect }
  }

  it('seeds 0.5 × 0.5 m up and right on first click', () => {
    const scope = effectScope()
    scope.run(() => {
      const { room, applyRoomRect } = createRoom()
      room.onDrawRoomClick(mouseAt(10, 20))
      expect(room.isDrafting()).toBe(true)
      expect(room.measureHCm.value).toBeCloseTo(DRAW_SEED_CM)
      expect(room.measureVCm.value).toBeCloseTo(DRAW_SEED_CM)
      expect(room.drawRoomPreview.value?.[2]).toEqual({
        x: 10 + DRAW_SEED_CM + 20,
        y: 20 - DRAW_SEED_CM - 20,
      })
      expect(applyRoomRect).not.toHaveBeenCalled()
    })
    scope.stop()
  })

  it('negative H/V flips that axis from the seed', () => {
    const scope = effectScope()
    scope.run(() => {
      const { room, applyRoomRect } = createRoom()
      room.onDrawRoomClick(mouseAt(0, 0))
      room.setHOverrideCm(-200)
      room.setVOverrideCm(-150)
      expect(room.drawRoomPreview.value?.[2]).toEqual({ x: -220, y: 170 })
      expect(room.commitFromMeasure()).toBe(true)
      expect(applyRoomRect.mock.calls[0][0][2]).toEqual({ x: -220, y: 170 })
    })
    scope.stop()
  })

  it('typed inner measure expands the hartlijn by wall thickness', () => {
    const scope = effectScope()
    scope.run(() => {
      const { room, applyRoomRect } = createRoom()
      room.onDrawRoomClick(mouseAt(0, 0))
      room.setHOverrideCm(400)
      room.setVOverrideCm(300)
      expect(room.measureHCm.value).toBeCloseTo(400)
      expect(room.measureVCm.value).toBeCloseTo(300)
      expect(room.drawRoomPreview.value?.[2]).toEqual({ x: 420, y: -320 })
      expect(room.commitFromMeasure()).toBe(true)
      expect(applyRoomRect.mock.calls[0][0][2]).toEqual({ x: 420, y: -320 })
    })
    scope.stop()
  })

  it('types H then Tab then V without moving the pointer', () => {
    const scope = effectScope()
    scope.run(() => {
      const { room, applyRoomRect } = createRoom()
      room.onDrawRoomClick(mouseAt(0, 0))
      expect(room.handleTypeKey(typeKey('4'))).toBe(true)
      expect(room.measureHCm.value).toBeCloseTo(400)
      expect(room.handleTypeKey(typeKey('Tab'))).toBe(true)
      expect(room.handleTypeKey(typeKey('3'))).toBe(true)
      expect(room.measureVCm.value).toBeCloseTo(300)
      expect(room.drawRoomPreview.value?.[2]).toEqual({ x: 420, y: -320 })
      expect(room.commitFromMeasure()).toBe(true)
      expect(applyRoomRect.mock.calls[0][0][2]).toEqual({ x: 420, y: -320 })
    })
    scope.stop()
  })

  it('does not place on second click when placeOnSecondClick is false', () => {
    const scope = effectScope()
    scope.run(() => {
      const { room, applyRoomRect } = createRoom(() => false)
      room.onDrawRoomClick(mouseAt(0, 0))
      room.onDrawRoomClick(mouseAt(180, -90))
      expect(applyRoomRect).not.toHaveBeenCalled()
      expect(room.isDrafting()).toBe(true)
      expect(room.measureHCm.value).toBeCloseTo(160)
      expect(room.measureVCm.value).toBeCloseTo(70)
      expect(room.drawRoomPreview.value?.[2]).toEqual({ x: 180, y: -90 })
    })
    scope.stop()
  })
})
