import { describe, expect, it } from 'vitest'
import {
  DETAIL_LOD_MIN_SCREEN_PX,
  DETAIL_LOD_REF_CM,
  OPENING_STROKE_CM,
  detailSymbolsVisibleOnScreen,
  dimensionLabelVisibleOnScreen,
  worldDashStage,
  worldStrokeStage,
} from '@/ui/composables/fml-preview/fml-preview-world-stroke'

describe('worldStrokeStage', () => {
  it('schaalt cm met layout.scale', () => {
    expect(worldStrokeStage(OPENING_STROKE_CM, 0.5)).toBeCloseTo(OPENING_STROKE_CM * 0.5)
    expect(worldStrokeStage(2, 1)).toBe(2)
    expect(worldStrokeStage(1, 0)).toBe(0.05)
  })
})

describe('worldDashStage', () => {
  it('schaalt dash-cm met layout.scale', () => {
    expect(worldDashStage([5, 4], 0.4)).toEqual([2, 1.6])
  })
})

describe('detailSymbolsVisibleOnScreen', () => {
  it('verbergt openings/fixtures onder LOD-drempel', () => {
    const layout = DETAIL_LOD_MIN_SCREEN_PX / DETAIL_LOD_REF_CM
    expect(detailSymbolsVisibleOnScreen(layout, 1)).toBe(true)
    expect(detailSymbolsVisibleOnScreen(layout, 0.99)).toBe(false)
    expect(detailSymbolsVisibleOnScreen(0.01, 1)).toBe(false)
  })
})

describe('dimensionLabelVisibleOnScreen', () => {
  it('toont getal alleen als maatlijn genoeg schermlengte heeft', () => {
    expect(dimensionLabelVisibleOnScreen(80, 1)).toBe(true)
    expect(dimensionLabelVisibleOnScreen(40, 1)).toBe(false)
    expect(dimensionLabelVisibleOnScreen(6, 10)).toBe(true)
    expect(dimensionLabelVisibleOnScreen(4, 10)).toBe(false)
  })
})
