import { describe, expect, it } from 'vitest'
import {
  applyTwoFingerNav,
  applyWheelLikeZoom,
  gestureDistance,
  gestureMidpoint,
  isTapMove,
  shouldUseTouchNav,
  TAP_SLOP_PX,
} from '@/ui/composables/fml-preview/fml-preview-gestures'

describe('fml-preview-gestures', () => {
  it('treats a short move as a tap', () => {
    expect(isTapMove({ x: 0, y: 0 }, { x: 6, y: 6 })).toBe(true)
    expect(isTapMove({ x: 0, y: 0 }, { x: TAP_SLOP_PX, y: 0 })).toBe(false)
  })

  it('zooms about the pointer without jumping the origin', () => {
    const next = applyWheelLikeZoom({
      pointerX: 200,
      pointerY: 100,
      oldScale: 1,
      nextScale: 2,
      viewX: 0,
      viewY: 0,
    })
    expect(next.scale).toBe(2)
    expect(next.x).toBe(200 - 200 * 2)
    expect(next.y).toBe(100 - 100 * 2)
  })

  it('pans and pinches from a two-finger pair', () => {
    const next = applyTwoFingerNav({
      prevA: { x: 0, y: 0 },
      prevB: { x: 100, y: 0 },
      nextA: { x: 20, y: 10 },
      nextB: { x: 220, y: 10 },
      viewScale: 1,
      viewX: 0,
      viewY: 0,
      clampScale: (scale) => scale,
    })
    expect(next.scale).toBeCloseTo(2, 5)
    expect(gestureDistance({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(100)
    expect(gestureMidpoint({ x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({ x: 50, y: 0 })
    expect(next.x).not.toBe(0)
  })

  it('keeps mouse desktops off the touch-nav path', () => {
    expect(shouldUseTouchNav(true, false)).toBe(false)
    expect(shouldUseTouchNav(true, true)).toBe(true)
    expect(shouldUseTouchNav(false, true)).toBe(false)
  })
})
