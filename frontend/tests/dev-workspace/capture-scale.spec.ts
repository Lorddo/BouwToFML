import { describe, expect, it } from 'vitest'
import { captureDevWorkspaceSession } from '@/platform/dev-workspace/capture'
import { DEFAULT_PREPROCESS } from '@/platform/image'

function fakeImage(width: number, height: number): HTMLImageElement {
  return {
    complete: true,
    naturalWidth: width,
    naturalHeight: height,
  } as HTMLImageElement
}

describe('captureDevWorkspaceSession scale snapshot', () => {
  it('stores confirmed px/mm alongside ruler handles', () => {
    const session = captureDevWorkspaceSession({
      targetFlowStep: 'preprocess',
      templateTab: 'ocr',
      preprocessTab: 'walls',
      resultTab: 'walls',
      profileConfirmed: true,
      wallPipelineVersion: 'v3',
      imageName: 'test.png',
      originalImageEl: fakeImage(2000, 1500),
      preprocess: { ...DEFAULT_PREPROCESS },
      drawingProfileId: 'open',
      scale: {
        state: { xLeft: 100, xRight: 900, xGuideY: 750, yTop: 200, yBottom: 1300, yGuideX: 500 },
        distanceMmX: 4000,
        distanceMmY: 3000,
        confirmed: true,
        confirmedPixelsPerMillimeterX: 0.2,
        confirmedPixelsPerMillimeterY: 0.36666666666666664,
      },
      eraserMask: null,
      eraserTouched: false,
      ocrMask: null,
      ocrMaskedRegions: [],
      ocrApplied: false,
      tabOutputs: { walls: null },
      roomPhase: 'idle',
      wallsDetectionComplete: false,
      workingImagePng: 'data:image/png;base64,AA==',
    })

    expect(session.scale.confirmed).toBe(true)
    expect(session.scale.confirmedPixelsPerMillimeterX).toBeCloseTo(0.2)
    expect(session.scale.confirmedPixelsPerMillimeterY).toBeCloseTo(0.36666666666666664)
    // Linialen kunnen verouderd zijn t.o.v. px/mm na upscale — beide worden bewaard.
    expect(session.scale.state?.xLeft).toBe(100)
  })
})
