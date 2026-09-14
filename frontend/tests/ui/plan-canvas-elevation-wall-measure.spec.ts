import { describe, expect, it } from 'vitest'
import type { ElevationWallRect } from '@/core/plan/facade-elevation'
import { OPENING_MOVE_MEASURE_INSET_CM } from '@/ui/composables/plan-canvas/plan-canvas-opening-move-measure'
import {
  buildElevationJunctionHeightMeasureLines,
  buildElevationRidgeHeightMeasureLines,
  buildElevationRoofVertexHeightMeasureLines,
  buildElevationWallFaceMeasureLines,
  elevationWallFaceMeasureLengthsCm,
} from '@/ui/composables/plan-canvas/plan-canvas-elevation-wall-measure'

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

describe('plan-canvas-elevation-wall-measure', () => {
  it('rechte muur 400×280 → één hoogte 280 cm rechts naast het vlak', () => {
    const lengths = elevationWallFaceMeasureLengthsCm(wall400x280())
    expect(lengths).not.toBeNull()
    expect(lengths!.heightLeftCm).toBeCloseTo(280, 6)
    expect(lengths!.heightRightCm).toBeCloseTo(280, 6)

    const lines = buildElevationWallFaceMeasureLines(wall400x280())
    expect(lines).toHaveLength(1)
    expect(lines[0].id).toBe('elev-wall-height')
    expect(lines[0].a.x).toBeCloseTo(400 + OPENING_MOVE_MEASURE_INSET_CM, 6)
    expect(lines[0].a.y).toBeCloseTo(-280, 6)
    expect(lines[0].b.y).toBeCloseTo(0, 6)
  })

  it('scheve kopgevel → beide eindhoogtes buiten het vlak', () => {
    const wall = wall400x280({
      aTop: { x: 0, y: -320 },
      bTop: { x: 400, y: -200 },
      y0: -320,
    })
    const lengths = elevationWallFaceMeasureLengthsCm(wall)
    expect(lengths).not.toBeNull()
    expect(lengths!.heightLeftCm).toBeCloseTo(320, 6)
    expect(lengths!.heightRightCm).toBeCloseTo(200, 6)

    const lines = buildElevationWallFaceMeasureLines(wall)
    expect(lines).toHaveLength(2)
    expect(lines[0].a.x).toBeCloseTo(0 - OPENING_MOVE_MEASURE_INSET_CM, 6)
    expect(lines[1].a.x).toBeCloseTo(400 + OPENING_MOVE_MEASURE_INSET_CM, 6)
  })

  it('degenereat segment → geen lijnen', () => {
    expect(
      buildElevationWallFaceMeasureLines(
        wall400x280({
          xa: 10,
          xb: 10,
          aTop: { x: 10, y: -280 },
          aBottom: { x: 10, y: 0 },
          bTop: { x: 10, y: -280 },
          bBottom: { x: 10, y: 0 },
        }),
      ),
    ).toEqual([])
  })

  it('knoop → hoogte naast de knoop; nok slaat over', () => {
    const lines = buildElevationJunctionHeightMeasureLines({
      id: 'j-0-0',
      x: 400,
      yTop: -260,
      yBot: 0,
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].a.x).toBeCloseTo(400 + OPENING_MOVE_MEASURE_INSET_CM, 6)
    expect(lines[0].a.y).toBeCloseTo(-260, 6)
    expect(lines[0].b.y).toBeCloseTo(0, 6)

    expect(
      buildElevationJunctionHeightMeasureLines({
        id: 'rj-0-0',
        x: 200,
        yTop: -400,
        yBot: -280,
        ridge: true,
      }),
    ).toEqual([])

    const ridgeLines = buildElevationJunctionHeightMeasureLines(
      {
        id: 'rj-0-0',
        x: 200,
        yTop: -400,
        yBot: -350,
        ridge: true,
      },
      0,
    )
    expect(ridgeLines).toHaveLength(1)
    expect(ridgeLines[0].a.y).toBeCloseTo(-350, 6)
    expect(ridgeLines[0].b.y).toBeCloseTo(0, 6)
  })

  it('nokbalk → hoogte tot vloer naast het segment; scheef = beide einden', () => {
    const ridge = wall400x280({
      ridge: true,
      aTop: { x: 0, y: -370 },
      aBottom: { x: 0, y: -350 },
      bTop: { x: 400, y: -370 },
      bBottom: { x: 400, y: -350 },
      y0: -370,
      y1: -350,
    })
    const lines = buildElevationRidgeHeightMeasureLines(ridge, 0)
    expect(lines).toHaveLength(1)
    expect(lines[0].id).toBe('elev-ridge-height')
    expect(lines[0].a.x).toBeCloseTo(400 + OPENING_MOVE_MEASURE_INSET_CM, 6)
    expect(lines[0].a.y).toBeCloseTo(-350, 6)
    expect(lines[0].b.y).toBeCloseTo(0, 6)

    const sloped = buildElevationRidgeHeightMeasureLines(
      wall400x280({
        ridge: true,
        aTop: { x: 0, y: -420 },
        aBottom: { x: 0, y: -400 },
        bTop: { x: 400, y: -320 },
        bBottom: { x: 400, y: -300 },
        y0: -420,
        y1: -300,
      }),
      0,
    )
    expect(sloped).toHaveLength(2)
    expect(Math.abs(sloped[0].a.y - sloped[0].b.y)).toBeCloseTo(400, 6)
    expect(Math.abs(sloped[1].a.y - sloped[1].b.y)).toBeCloseTo(300, 6)
  })

  it('dakvlak-punt → hoogte tot vloer naast het punt', () => {
    const lines = buildElevationRoofVertexHeightMeasureLines({ x: 180, y: -420 }, 0, 2)
    expect(lines).toHaveLength(1)
    expect(lines[0].id).toBe('elev-roof-vertex-height:2')
    expect(lines[0].a.x).toBeCloseTo(180 + OPENING_MOVE_MEASURE_INSET_CM, 6)
    expect(lines[0].a.y).toBeCloseTo(-420, 6)
    expect(lines[0].b.y).toBeCloseTo(0, 6)
    expect(Math.abs(lines[0].a.y - lines[0].b.y)).toBeCloseTo(420, 6)
  })

  it('dakvlak-punt op de vloer → geen lijn', () => {
    expect(buildElevationRoofVertexHeightMeasureLines({ x: 100, y: 0 }, 0, 0)).toEqual([])
  })

  it('dakvlak-punt op hogere verdieping → hoogte tot die vloer, niet begane grond', () => {
    const lines = buildElevationRoofVertexHeightMeasureLines({ x: 200, y: -700 }, -280, 1)
    expect(lines).toHaveLength(1)
    expect(lines[0].a.y).toBeCloseTo(-700, 6)
    expect(lines[0].b.y).toBeCloseTo(-280, 6)
    expect(Math.abs(lines[0].a.y - lines[0].b.y)).toBeCloseTo(420, 6)
  })
})
