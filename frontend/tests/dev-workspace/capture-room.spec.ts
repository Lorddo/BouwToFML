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

describe('captureDevWorkspaceSession room snapshot', () => {
  it('stores reference wall + overrides in exact detection', () => {
    const session = captureDevWorkspaceSession({
      targetFlowStep: 'templates',
      templateTab: 'walls',
      preprocessTab: 'walls',
      resultTab: 'walls',
      profileConfirmed: true,
      wallPipelineVersion: 'v3',
      imageName: 'test.png',
      originalImageEl: fakeImage(100, 100),
      preprocess: { ...DEFAULT_PREPROCESS },
      drawingProfileId: 'open',
      scale: {
        state: { xLeft: 1, xRight: 9, xGuideY: 5, yTop: 1, yBottom: 9, yGuideX: 5 },
        distanceMmX: 3000,
        distanceMmY: 3000,
        confirmed: true,
      },
      eraserMask: null,
      eraserTouched: false,
      ocrMask: null,
      ocrMaskedRegions: [],
      ocrApplied: false,
      tabOutputs: { walls: null },
      roomPhase: 'review',
      wallsDetectionComplete: false,
      faceOverrides: [[3, 'wall']],
      pinnedRoots: [3],
      referenceWallThicknessPx: 14,
      referenceWallRect: { x: 10, y: 20, width: 30, height: 8 },
      openingRects: [{ type: 'door', x: 40, y: 50, width: 20, height: 12 }],
      roomInkCoverageThreshold: 0.72,
      inkOverlayRle: [0, 100, 1, 4],
      workingImagePng: 'data:image/png;base64,AA==',
    })

    expect(session.referenceWallThicknessPx).toBe(14)
    expect(session.inkOverlayRle).toEqual([0, 100, 1, 4])
    expect(session.openingRects).toEqual([{ type: 'door', x: 40, y: 50, width: 20, height: 12 }])
    expect(session.detectionExact?.referenceWallThicknessPx).toBe(14)
    expect(session.detectionExact?.referenceWallRect).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 8,
    })
    expect(session.detectionExact?.openingRects).toEqual([
      { type: 'door', x: 40, y: 50, width: 20, height: 12 },
    ])
    expect(session.detectionExact?.faceOverrides).toEqual([[3, 'wall']])
    expect(session.detectionExact?.roomInkCoverageThreshold).toBe(0.72)
    expect(session.flow.restoreMode).toBe('exact')
  })

  it('stores room snapshot in replay detection for result step', () => {
    const session = captureDevWorkspaceSession({
      targetFlowStep: 'result',
      templateTab: 'walls',
      preprocessTab: 'walls',
      resultTab: 'walls',
      profileConfirmed: true,
      wallPipelineVersion: 'v3',
      imageName: 'test.png',
      originalImageEl: fakeImage(100, 100),
      preprocess: { ...DEFAULT_PREPROCESS },
      drawingProfileId: 'open',
      scale: {
        state: { xLeft: 1, xRight: 9, xGuideY: 5, yTop: 1, yBottom: 9, yGuideX: 5 },
        distanceMmX: 3000,
        distanceMmY: 3000,
        confirmed: true,
      },
      eraserMask: null,
      eraserTouched: false,
      ocrMask: null,
      ocrMaskedRegions: [],
      ocrApplied: true,
      tabOutputs: { walls: null },
      roomPhase: 'done',
      wallsDetectionComplete: true,
      referenceWallThicknessPx: 18,
      faceOverrides: [[5, 'surface']],
      pinnedRoots: [5],
      workingImagePng: 'data:image/png;base64,AA==',
    })

    expect(session.flow.restoreMode).toBe('replay')
    expect(session.flow.wallPipelineVersion).toBe('v3')
    expect(session.detectionReplay?.referenceWallThicknessPx).toBe(18)
    expect(session.detectionReplay?.faceOverrides).toEqual([[5, 'surface']])
    expect(session.detectionReplay?.wallsPhase).toBe('finalize')
  })

  it('forceExactRestore on result stores detectionExact (floor-switch persistence)', () => {
    const session = captureDevWorkspaceSession({
      targetFlowStep: 'result',
      templateTab: 'walls',
      preprocessTab: 'walls',
      resultTab: 'vector',
      profileConfirmed: true,
      wallPipelineVersion: 'v3',
      imageName: 'test.png',
      originalImageEl: fakeImage(100, 100),
      preprocess: { ...DEFAULT_PREPROCESS },
      drawingProfileId: 'open',
      scale: {
        state: { xLeft: 1, xRight: 9, xGuideY: 5, yTop: 1, yBottom: 9, yGuideX: 5 },
        distanceMmX: 3000,
        distanceMmY: 3000,
        confirmed: true,
      },
      eraserMask: null,
      eraserTouched: false,
      ocrMask: null,
      ocrMaskedRegions: [],
      ocrApplied: false,
      tabOutputs: { walls: null },
      roomPhase: 'done',
      wallsDetectionComplete: true,
      faceOverrides: [[5, 'wall']],
      forceExactRestore: true,
      workingImagePng: 'data:image/png;base64,AA==',
    })

    expect(session.flow.restoreMode).toBe('exact')
    expect(session.flow.targetFlowStep).toBe('result')
    expect(session.detectionExact?.roomPhase).toBe('done')
    expect(session.detectionExact?.wallsDetectionComplete).toBe(true)
    expect(session.detectionExact?.faceOverrides).toEqual([[5, 'wall']])
    expect(session.detectionReplay).toBeUndefined()
  })
})
