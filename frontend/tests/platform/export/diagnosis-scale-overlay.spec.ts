import { describe, expect, it } from 'vitest'
import {
  buildScaleRulerSvg,
  formatScaleAxisLabel,
  formatScaleMismatch,
  type DiagnosisScaleOverlay,
} from '@/platform/export/diagnosis-scale-overlay'

const overlay: DiagnosisScaleOverlay = {
  state: {
    xLeft: 80,
    xRight: 420,
    xGuideY: 150,
    yTop: 60,
    yBottom: 500,
    yGuideX: 240,
  },
  distanceMmX: 4000,
  distanceMmY: 2500,
  pxDistanceX: 340,
  pxDistanceY: 440,
  pxPerMmX: 0.085,
  pxPerMmY: 0.176,
  confirmed: true,
  axisMismatchPct: 107,
}

describe('diagnosis-scale-overlay', () => {
  it('labels H/V with mm and px span', () => {
    expect(formatScaleAxisLabel('H', 4000, 340)).toBe('H 4000 mm · 340.0 px')
    expect(formatScaleAxisLabel('V', 2500.5, 440.25)).toBe('V 2500.5 mm · 440.3 px')
  })

  it('formats axis mismatch as percent or factor', () => {
    expect(formatScaleMismatch(1.5)).toBeNull()
    expect(formatScaleMismatch(2)).toBe('2.0%')
    expect(formatScaleMismatch(107)).toBe('2.1×')
  })

  it('draws H/V guides at handle coordinates', () => {
    const svg = buildScaleRulerSvg(overlay, 800, 600)
    expect(svg).toContain('viewBox="0 0 800 600"')
    expect(svg).toContain('x1="80"')
    expect(svg).toContain('x1="420"')
    expect(svg).toContain('y1="150"')
    expect(svg).toContain('y1="60"')
    expect(svg).toContain('y1="500"')
    expect(svg).toContain('x1="240"')
    expect(svg).toContain('H 4000 mm · 340.0 px')
    expect(svg).toContain('V 2500 mm · 440.0 px')
    expect(svg).toContain('#0ea5e9')
    expect(svg).toContain('#f59e0b')
  })

  it('returns empty svg when image size is missing', () => {
    expect(buildScaleRulerSvg(overlay, 0, 600)).toBe('')
  })
})
