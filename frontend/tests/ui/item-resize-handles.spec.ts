import { describe, expect, it } from 'vitest'
import {
  hitItemResizeHandle,
  itemLocalSide,
  itemLocalToWorld,
  resizeFromSide,
  worldToItemLocal,
} from '@/ui/composables/fml-preview/item-resize-handles'

describe('item-resize-handles', () => {
  it('puts handles on the mid-sides', () => {
    expect(itemLocalSide(40, 20, 'e')).toEqual({ x: 20, y: 0 })
    expect(itemLocalSide(40, 20, 'n')).toEqual({ x: 0, y: -10 })
  })

  it('round-trips world ↔ local with rotation and mirror', () => {
    const center = { x: 100, y: 50 }
    const local = { x: 12, y: -8 }
    const world = itemLocalToWorld(center, local, 90, [1, 0])
    const back = worldToItemLocal(center, world, 90, [1, 0])
    expect(back.x).toBeCloseTo(local.x, 6)
    expect(back.y).toBeCloseTo(local.y, 6)
  })

  it('moves only the dragged side and keeps the opposite edge', () => {
    const item = { x: 100, y: 50, width: 40, height: 20, rotation: 0 }
    const east = resizeFromSide(item, 'e', { x: 30, y: 4 }, 5)
    expect(east.width).toBe(50)
    expect(east.height).toBe(20)
    expect(east.x).toBeCloseTo(105, 6)
    expect(east.y).toBeCloseTo(50, 6)

    const west = resizeFromSide(item, 'w', { x: -30, y: 0 }, 5)
    expect(west.width).toBe(50)
    expect(west.x).toBeCloseTo(95, 6)
    expect(west.height).toBe(20)
  })

  it('hits the nearest side within tolerance', () => {
    expect(hitItemResizeHandle({ x: 20, y: 1 }, 40, 20, 4)).toBe('e')
    expect(hitItemResizeHandle({ x: 0, y: 0 }, 40, 20, 3)).toBeNull()
  })
})
