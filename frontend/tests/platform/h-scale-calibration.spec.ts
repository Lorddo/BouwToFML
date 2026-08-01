import { describe, expect, it } from 'vitest'
import { useHScaleCalibration } from '@/platform/calibration'

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
})
