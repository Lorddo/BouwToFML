import { describe, expect, it } from 'vitest'
import { scaleOverlayHandleValue } from '@/ui/components/floorplan-scale-overlay'

describe('floorplan-scale-overlay', () => {
  const bounds = { width: 1000, height: 800 }

  it('houdt H-greep op X en clamt binnen het beeld', () => {
    expect(scaleOverlayHandleValue('xLeft', { x: 120, y: 900 }, bounds)).toBe(120)
    expect(scaleOverlayHandleValue('xRight', { x: -4, y: 10 }, bounds)).toBe(0)
    expect(scaleOverlayHandleValue('xRight', { x: 1400, y: 10 }, bounds)).toBe(1000)
  })

  it('houdt V-greep op Y en clamt binnen het beeld', () => {
    expect(scaleOverlayHandleValue('yTop', { x: 900, y: 40 }, bounds)).toBe(40)
    expect(scaleOverlayHandleValue('yBottom', { x: 10, y: -8 }, bounds)).toBe(0)
    expect(scaleOverlayHandleValue('yBottom', { x: 10, y: 1200 }, bounds)).toBe(800)
  })
})
