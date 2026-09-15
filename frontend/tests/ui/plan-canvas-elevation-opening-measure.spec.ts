import { describe, expect, it } from 'vitest'
import type { ElevationWallRect } from '@/core/plan/facade-elevation'
import { OPENING_MOVE_MEASURE_INSET_CM } from '@/ui/composables/canvas-kernel/plan-canvas-opening-move-measure'
import {
  buildElevationOpeningMeasureLines,
  elevationOpeningMeasureLengthsCm,
} from '@/ui/composables/elevation/elevation-opening-measure'

function wall400x280(overrides: Partial<ElevationWallRect> = {}): ElevationWallRect {
  return {
    wallId: 'w',
    floorIndex: 0,
    depthCm: 0,
    xa: 0,
    xb: 400,
    x0: 0,
    x1: 400,
    y0: -280,
    y1: 0,
    aTop: { x: 0, y: -280 },
    aBottom: { x: 0, y: 0 },
    bTop: { x: 400, y: -280 },
    bBottom: { x: 400, y: 0 },
    innerATop: { x: 0, y: -280 },
    innerABottom: { x: 0, y: 0 },
    innerBTop: { x: 400, y: -280 },
    innerBBottom: { x: 400, y: 0 },
    ...overrides,
  }
}

describe('plan-canvas-elevation-opening-measure', () => {
  it('muur 400×280, raam 80×100 op midden / dorpel 100 → L/R 160, vloer 100, plafond 80', () => {
    const lengths = elevationOpeningMeasureLengthsCm(wall400x280(), {
      x0: 160,
      x1: 240,
      y0: -200,
      y1: -100,
    })
    expect(lengths).not.toBeNull()
    expect(lengths!.leftCm).toBeCloseTo(160, 6)
    expect(lengths!.rightCm).toBeCloseTo(160, 6)
    expect(lengths!.floorCm).toBeCloseTo(100, 6)
    expect(lengths!.ceilingCm).toBeCloseTo(80, 6)
  })

  it('raam naar links → links korter, rechts langer; hoogtes blijven', () => {
    const lengths = elevationOpeningMeasureLengthsCm(wall400x280(), {
      x0: 40,
      x1: 120,
      y0: -200,
      y1: -100,
    })
    expect(lengths).not.toBeNull()
    expect(lengths!.leftCm).toBeCloseTo(40, 6)
    expect(lengths!.rightCm).toBeCloseTo(280, 6)
    expect(lengths!.floorCm).toBeCloseTo(100, 6)
    expect(lengths!.ceilingCm).toBeCloseTo(80, 6)
  })

  it('binnenkant-X is de restmaat (niet de baksteen-oren)', () => {
    const wall = wall400x280({
      aTop: { x: -10, y: -280 },
      aBottom: { x: -10, y: 0 },
      bTop: { x: 410, y: -280 },
      bBottom: { x: 410, y: 0 },
      innerATop: { x: 10, y: -280 },
      innerABottom: { x: 10, y: 0 },
      innerBTop: { x: 390, y: -280 },
      innerBBottom: { x: 390, y: 0 },
      x0: -10,
      x1: 410,
    })
    const lengths = elevationOpeningMeasureLengthsCm(wall, {
      x0: 160,
      x1: 240,
      y0: -200,
      y1: -100,
    })
    expect(lengths).not.toBeNull()
    expect(lengths!.leftCm).toBeCloseTo(150, 6)
    expect(lengths!.rightCm).toBeCloseTo(150, 6)
  })

  it('schuine muurtop: plafond-rest volgt interpolatie op het opening-midden', () => {
    const wall = wall400x280({
      aTop: { x: 0, y: -280 },
      bTop: { x: 400, y: -200 },
      y0: -280,
    })
    const lengths = elevationOpeningMeasureLengthsCm(wall, {
      x0: 160,
      x1: 240,
      y0: -200,
      y1: -100,
    })
    expect(lengths).not.toBeNull()
    // midden X=200 → top = -280 + (−200−(−280))*0.5 = −240; latei −200 → 40
    expect(lengths!.ceilingCm).toBeCloseTo(40, 6)
    expect(lengths!.floorCm).toBeCloseTo(100, 6)
  })

  it('horizontale rest ligt onder de opening; verticale rechts ernaast', () => {
    const lines = buildElevationOpeningMeasureLines(wall400x280(), {
      x0: 160,
      x1: 240,
      y0: -200,
      y1: -100,
    })
    expect(lines).toHaveLength(4)
    const inset = OPENING_MOVE_MEASURE_INSET_CM
    expect(lines[0].a.y).toBeCloseTo(-100 + inset, 6)
    expect(lines[1].a.y).toBeCloseTo(-100 + inset, 6)
    expect(lines[2].a.x).toBeCloseTo(240 + inset, 6)
    expect(lines[3].a.x).toBeCloseTo(240 + inset, 6)
  })

  it('deur op de vloer: horizontale rest boven de opening', () => {
    const lines = buildElevationOpeningMeasureLines(wall400x280(), {
      x0: 160,
      x1: 240,
      y0: -210,
      y1: 0,
    })
    expect(lines[0].a.y).toBeCloseTo(-210 - OPENING_MOVE_MEASURE_INSET_CM, 6)
  })

  it('degeneraat segment → geen lijnen', () => {
    expect(
      buildElevationOpeningMeasureLines(
        wall400x280({
          xa: 10,
          xb: 10,
          aTop: { x: 10, y: -280 },
          aBottom: { x: 10, y: 0 },
          bTop: { x: 10, y: -280 },
          bBottom: { x: 10, y: 0 },
          innerATop: { x: 10, y: -280 },
          innerABottom: { x: 10, y: 0 },
          innerBTop: { x: 10, y: -280 },
          innerBBottom: { x: 10, y: 0 },
          x0: 10,
          x1: 10,
        }),
        { x0: 8, x1: 12, y0: -200, y1: -100 },
      ),
    ).toEqual([])
  })
})
