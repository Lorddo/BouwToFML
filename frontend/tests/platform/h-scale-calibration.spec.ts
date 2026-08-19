import { describe, expect, it } from 'vitest'
import { SCALE_AXIS_MISMATCH_WARN_PCT, useHScaleCalibration } from '@/platform/calibration'

describe('useHScaleCalibration', () => {
  it('locks px/mm on confirm and keeps it under mm edits via recompute', () => {
    const scale = useHScaleCalibration()
    scale.init(1000, 800)
    scale.state.value = {
      xLeft: 100,
      xRight: 300,
      xGuideY: 400,
      yTop: 50,
      yBottom: 250,
      yGuideX: 500,
    }
    scale.distanceMmX.value = 1000
    scale.distanceMmY.value = 2000
    scale.confirm()

    expect(scale.pixelsPerMillimeterX.value).toBeCloseTo(0.2)
    expect(scale.pixelsPerMillimeterY.value).toBeCloseTo(0.1)

    scale.distanceMmX.value = 500
    scale.recomputeConfirmedFromDistances()
    expect(scale.pixelsPerMillimeterX.value).toBeCloseTo(0.4)
    expect(scale.confirmed.value).toBe(true)
  })

  it('swaps confirmed X/Y px/mm after 90° bake', () => {
    const scale = useHScaleCalibration()
    scale.init(1000, 800)
    scale.state.value = {
      xLeft: 0,
      xRight: 200,
      xGuideY: 100,
      yTop: 0,
      yBottom: 100,
      yGuideX: 100,
    }
    scale.distanceMmX.value = 1000
    scale.distanceMmY.value = 500
    scale.confirm()

    expect(scale.pixelsPerMillimeterX.value).toBeCloseTo(0.2)
    expect(scale.pixelsPerMillimeterY.value).toBeCloseTo(0.2)

    scale.distanceMmX.value = 1000
    scale.distanceMmY.value = 500
    scale.confirmedPixelsPerMillimeterX.value = 0.2
    scale.confirmedPixelsPerMillimeterY.value = 0.4

    scale.applyCardinalAxisSwapToConfirmedScale(90)
    expect(scale.pixelsPerMillimeterX.value).toBeCloseTo(0.4)
    expect(scale.pixelsPerMillimeterY.value).toBeCloseTo(0.2)
    expect(scale.distanceMmX.value).toBe(500)
    expect(scale.distanceMmY.value).toBe(1000)
  })

  it('does not swap on 0°/180° and still applies upscale', () => {
    const scale = useHScaleCalibration()
    scale.init(1000, 800)
    scale.state.value = {
      xLeft: 0,
      xRight: 100,
      xGuideY: 100,
      yTop: 0,
      yBottom: 100,
      yGuideX: 100,
    }
    scale.distanceMmX.value = 1000
    scale.distanceMmY.value = 1000
    scale.confirm()

    scale.applyCardinalAxisSwapToConfirmedScale(180)
    expect(scale.pixelsPerMillimeterX.value).toBeCloseTo(0.1)
    expect(scale.pixelsPerMillimeterY.value).toBeCloseTo(0.1)

    scale.applyUpscaleToConfirmedScale(2)
    expect(scale.pixelsPerMillimeterX.value).toBeCloseTo(0.2)
    expect(scale.pixelsPerMillimeterY.value).toBeCloseTo(0.2)
  })

  /** Gemeten geval: 2,359 tegen 0,229 px/mm → FML van 1,1 bij 10,5 m. */
  describe('axisMismatchPct', () => {
    function scaleWithRulers(pxX: number, mmX: number, pxY: number, mmY: number) {
      const scale = useHScaleCalibration()
      scale.init(3000, 3000)
      scale.state.value = {
        xLeft: 0,
        xRight: pxX,
        xGuideY: 100,
        yTop: 0,
        yBottom: pxY,
        yGuideX: 100,
      }
      scale.distanceMmX.value = mmX
      scale.distanceMmY.value = mmY
      return scale
    }

    it('is 0 zonder schaal', () => {
      expect(useHScaleCalibration().axisMismatchPct.value).toBe(0)
    })

    it('blijft onder de grens bij normale meetruis', () => {
      const scale = scaleWithRulers(1000, 5000, 1010, 5000)
      expect(scale.axisMismatchPct.value).toBeLessThan(SCALE_AXIS_MISMATCH_WARN_PCT)
    })

    it('haalt de grens bij een verkeerd ingevulde eenheid', () => {
      const scale = scaleWithRulers(1000, 500, 1000, 5000)
      expect(scale.axisMismatchPct.value).toBeCloseTo(900)
      expect(scale.axisMismatchPct.value).toBeGreaterThan(SCALE_AXIS_MISMATCH_WARN_PCT)
    })

    it('kijkt naar de bevestigde px/mm, niet naar de liniaalspan', () => {
      const scale = scaleWithRulers(1000, 5000, 1000, 5000)
      scale.confirm()
      expect(scale.axisMismatchPct.value).toBe(0)
      scale.confirmedPixelsPerMillimeterX.value = 0.4
      expect(scale.axisMismatchPct.value).toBeCloseTo(100)
    })
  })

  describe('applyUniformGeometryFactor', () => {
    it('schaalt px/mm omlaag en distanceMm omhoog bij factor > 1', () => {
      const scale = useHScaleCalibration()
      scale.init(1000, 800)
      scale.state.value = {
        xLeft: 0,
        xRight: 200,
        xGuideY: 100,
        yTop: 0,
        yBottom: 200,
        yGuideX: 100,
      }
      scale.distanceMmX.value = 1000
      scale.distanceMmY.value = 1000
      scale.confirm()
      expect(scale.pixelsPerMillimeterX.value).toBeCloseTo(0.2)

      expect(scale.applyUniformGeometryFactor(1.02)).toBe(true)
      expect(scale.pixelsPerMillimeterX.value).toBeCloseTo(0.2 / 1.02)
      expect(scale.pixelsPerMillimeterY.value).toBeCloseTo(0.2 / 1.02)
      expect(scale.distanceMmX.value).toBeCloseTo(1020)
      expect(scale.distanceMmY.value).toBeCloseTo(1020)
      expect(scale.confirmed.value).toBe(true)
    })

    it('weigerfactor buiten [0.5, 2] en ongeconfirmeerde schaal', () => {
      const scale = useHScaleCalibration()
      scale.init(1000, 800)
      scale.state.value = {
        xLeft: 0,
        xRight: 100,
        xGuideY: 50,
        yTop: 0,
        yBottom: 100,
        yGuideX: 50,
      }
      scale.distanceMmX.value = 1000
      scale.distanceMmY.value = 1000
      expect(scale.applyUniformGeometryFactor(1.1)).toBe(false)

      scale.confirm()
      expect(scale.applyUniformGeometryFactor(0.4)).toBe(false)
      expect(scale.applyUniformGeometryFactor(2.1)).toBe(false)
      expect(scale.applyUniformGeometryFactor(1)).toBe(false)
      expect(scale.pixelsPerMillimeterX.value).toBeCloseTo(0.1)
    })
  })
})
