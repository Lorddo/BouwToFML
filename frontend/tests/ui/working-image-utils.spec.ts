import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { expandedSizeForRotation, uiRotationToCvDegrees } from '@/cv/tools/rotateMat'
import {
  applyPixelScaleFactorToCalibration,
  resolveScaleAfterInputBake,
  transformHScaleState,
  transformHScaleStateRotate180,
  transformHScaleStateRotation,
  transformSelectionRect,
} from '@/ui/composables/workspace/imageUtils'
import {
  inputStepCanProceed,
  preprocessStepCanProceed,
  OPTIMIZATION_BASE_DIMENSION,
  visiblePreprocessLayerTabs,
  visibleResultLayerTabs,
  visibleTemplateLayerTabs,
} from '@/ui/composables/workspace/constants'

describe('rotation convention', () => {
  it('maps UI clockwise-positive to OpenCV counter-clockwise', () => {
    expect(uiRotationToCvDegrees(90)).toBe(-90)
    expect(uiRotationToCvDegrees(-45)).toBe(45)
  })

  it('expands canvas bounds for non-cardinal rotation', () => {
    const size = expandedSizeForRotation(1000, 500, 45)
    expect(size.width).toBeGreaterThan(1000)
    expect(size.height).toBeGreaterThan(500)
  })
})

describe('working image utils', () => {
  it('re-inits unconfirmed scale after rotation bake so H/V can follow walls', () => {
    expect(
      resolveScaleAfterInputBake({
        scaleConfirmed: false,
        hasRotation: true,
        hasScaleState: true,
      }),
    ).toBe('reinit')
  })

  it('keeps transforming confirmed or crop-only scale handles', () => {
    expect(
      resolveScaleAfterInputBake({
        scaleConfirmed: true,
        hasRotation: true,
        hasScaleState: true,
      }),
    ).toBe('transform')
    expect(
      resolveScaleAfterInputBake({
        scaleConfirmed: false,
        hasRotation: false,
        hasScaleState: true,
      }),
    ).toBe('transform')
    expect(
      resolveScaleAfterInputBake({
        scaleConfirmed: false,
        hasRotation: false,
        hasScaleState: false,
      }),
    ).toBe('none')
  })

  it('transforms scale handles after crop and upscale', () => {
    const next = transformHScaleState(
      {
        xLeft: 110,
        xRight: 210,
        xGuideY: 90,
        yTop: 70,
        yBottom: 120,
        yGuideX: 160,
      },
      { offsetX: 100, offsetY: 50, scale: 2 },
      400,
      300,
    )
    expect(next).toEqual({
      xLeft: 20,
      xRight: 220,
      xGuideY: 80,
      yTop: 40,
      yBottom: 140,
      yGuideX: 120,
    })
  })

  it('flips scale handles for 180° rotation', () => {
    const next = transformHScaleStateRotate180(
      {
        xLeft: 100,
        xRight: 300,
        xGuideY: 200,
        yTop: 50,
        yBottom: 250,
        yGuideX: 400,
      },
      1000,
      800,
    )
    expect(next).toEqual({
      xLeft: 700,
      xRight: 900,
      xGuideY: 600,
      yTop: 550,
      yBottom: 750,
      yGuideX: 600,
    })
  })

  it('rotates scale handles when canvas expands', () => {
    const next = transformHScaleStateRotation(
      {
        xLeft: 400,
        xRight: 600,
        xGuideY: 500,
        yTop: 450,
        yBottom: 550,
        yGuideX: 500,
      },
      1000,
      1000,
      90,
      1400,
      1400,
    )
    expect(next.xGuideY).toBeGreaterThan(0)
    expect(next.yGuideX).toBeGreaterThan(0)
  })

  it('scales confirmed px/mm after silent upload upscale', () => {
    const confirmed = ref(true)
    const confirmedPixelsPerMillimeterX = ref(0.1)
    const confirmedPixelsPerMillimeterY = ref(0.1)
    const state = ref({
      xLeft: 100,
      xRight: 300,
      xGuideY: 200,
      yTop: 50,
      yBottom: 250,
      yGuideX: 400,
    })
    applyPixelScaleFactorToCalibration(
      {
        confirmed,
        state,
        applyUpscaleToConfirmedScale: (factor) => {
          if (confirmedPixelsPerMillimeterX.value != null) {
            confirmedPixelsPerMillimeterX.value *= factor
          }
          if (confirmedPixelsPerMillimeterY.value != null) {
            confirmedPixelsPerMillimeterY.value *= factor
          }
        },
      },
      2.5,
      2000,
      1500,
    )
    expect(confirmedPixelsPerMillimeterX.value).toBeCloseTo(0.25)
    expect(confirmedPixelsPerMillimeterY.value).toBeCloseTo(0.25)
  })

  it('scales unconfirmed ruler handles after silent upload upscale', () => {
    const confirmed = ref(false)
    const state = ref({
      xLeft: 40,
      xRight: 120,
      xGuideY: 80,
      yTop: 20,
      yBottom: 100,
      yGuideX: 160,
    })
    applyPixelScaleFactorToCalibration(
      {
        confirmed,
        state,
        applyUpscaleToConfirmedScale: () => {},
      },
      2.5,
      2000,
      1500,
    )
    expect(state.value?.xLeft).toBe(100)
    expect(state.value?.xRight).toBe(300)
  })

  it('transforms selection rect after crop and upscale', () => {
    const next = transformSelectionRect(
      { x: 110, y: 70, width: 40, height: 20 },
      {
        sourceWidth: 1000,
        sourceHeight: 800,
        rotate180: false,
        uiRotationDeg: 0,
        bakedWidth: 1000,
        bakedHeight: 800,
        cropOffset: { x: 100, y: 50 },
        scale: 2,
        outWidth: 1800,
        outHeight: 1500,
      },
    )
    expect(next).toEqual({ x: 20, y: 40, width: 80, height: 40 })
  })

  it('flips selection rect for 180° rotation', () => {
    const next = transformSelectionRect(
      { x: 100, y: 50, width: 200, height: 100 },
      {
        sourceWidth: 1000,
        sourceHeight: 800,
        rotate180: true,
        uiRotationDeg: 0,
        bakedWidth: 1000,
        bakedHeight: 800,
        cropOffset: { x: 0, y: 0 },
        scale: 1,
        outWidth: 1000,
        outHeight: 800,
      },
    )
    expect(next).toEqual({ x: 700, y: 650, width: 200, height: 100 })
  })
})

describe('workspace input gates and OCR tabs', () => {
  it('uses 3000px optimization floor', () => {
    expect(OPTIMIZATION_BASE_DIMENSION).toBe(3000)
  })

  it('hides Int muur / Deuren / Ramen / OCR / Resultaat-Muren from canvas tabs (Dev-only)', () => {
    expect(visiblePreprocessLayerTabs()).toEqual(['walls'])
    expect(visibleTemplateLayerTabs(true)).toEqual(['walls'])
    expect(visibleTemplateLayerTabs(false)).toEqual(['walls'])
    expect(visibleResultLayerTabs()).toEqual(['vector'])
  })

  it('allows leaving input without wall reference; preprocess requires wall rect', () => {
    expect(
      inputStepCanProceed({
        imageSrc: 'x.png',
        scaleConfirmed: true,
      }),
    ).toBe(true)
    expect(
      inputStepCanProceed({
        imageSrc: 'x.png',
        scaleConfirmed: false,
      }),
    ).toBe(false)
    expect(
      preprocessStepCanProceed({
        imageSrc: 'x.png',
        hasWallRect: true,
      }),
    ).toBe(true)
    expect(
      preprocessStepCanProceed({
        imageSrc: 'x.png',
        hasWallRect: false,
      }),
    ).toBe(false)
  })
})
