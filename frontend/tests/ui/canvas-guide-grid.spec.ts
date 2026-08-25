import { describe, expect, it } from 'vitest'
import {
  canvasGridScanSlot,
  canvasGuideGridInverseConfig,
  CANVAS_GUIDE_GRID_PITCH_PX,
} from '@/ui/components/canvas/canvas-guide-grid'

describe('canvasGridScanSlot', () => {
  it('puts scan under grid on input / fml / elevation', () => {
    expect(canvasGridScanSlot('input')).toBe('under')
    expect(canvasGridScanSlot('fml')).toBe('under')
    expect(canvasGridScanSlot('elevation')).toBe('under')
  })

  it('puts scan over grid on workspaceScan (stap 2/3/B/W)', () => {
    expect(canvasGridScanSlot('workspaceScan')).toBe('over')
  })
})

describe('canvasGuideGridInverseConfig', () => {
  it('cancels parent pan/zoom without rotation', () => {
    const cfg = canvasGuideGridInverseConfig({ x: 120, y: -40, scale: 2 })
    expect(cfg).toEqual({
      x: -60,
      y: 20,
      scaleX: 0.5,
      scaleY: 0.5,
      listening: false,
    })
    expect(cfg).not.toHaveProperty('rotation')
  })

  it('clamps tiny scale so inverse stays finite', () => {
    const cfg = canvasGuideGridInverseConfig({ x: 0, y: 0, scale: 0 })
    expect(cfg.scaleX).toBe(100)
    expect(cfg.scaleY).toBe(100)
    expect(Number.isFinite(cfg.x)).toBe(true)
  })

  it('identity at scale 1 and origin', () => {
    const cfg = canvasGuideGridInverseConfig({ x: 0, y: 0, scale: 1 })
    expect(cfg.x).toBe(0)
    expect(cfg.y).toBe(0)
    expect(cfg.scaleX).toBe(1)
    expect(cfg.scaleY).toBe(1)
    expect(cfg.listening).toBe(false)
  })
})

describe('CANVAS_GUIDE_GRID_PITCH_PX', () => {
  it('is a comfortable screen pitch', () => {
    expect(CANVAS_GUIDE_GRID_PITCH_PX).toBeGreaterThanOrEqual(24)
    expect(CANVAS_GUIDE_GRID_PITCH_PX).toBeLessThanOrEqual(40)
  })
})
