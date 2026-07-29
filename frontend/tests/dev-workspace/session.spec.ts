import { describe, expect, it } from 'vitest'
import { decodeMaskBase64, encodeMaskBase64 } from '@/platform/dev-workspace/mask-codec'
import { isDevWorkspaceSession } from '@/platform/dev-workspace/validate'
import type { DevWorkspaceSessionV1 } from '@/platform/dev-workspace/types'
import { DEFAULT_PREPROCESS } from '@/platform/image'

describe('dev-workspace mask codec', () => {
  it('roundtrips mask bytes', () => {
    const mask = new Uint8Array([0, 1, 0, 255, 2])
    const encoded = encodeMaskBase64(mask)
    const decoded = decodeMaskBase64(encoded, mask.length)
    expect(Array.from(decoded)).toEqual(Array.from(mask))
  })
})

describe('dev-workspace validate', () => {
  it('accepts minimal valid v1 session shape', () => {
    const session: DevWorkspaceSessionV1 = {
      schemaVersion: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      imageName: 'test.jpg',
      imageWidth: 10,
      imageHeight: 10,
      workingImagePng: 'data:image/png;base64,AA==',
      preprocess: { ...DEFAULT_PREPROCESS },
      drawingProfileId: 'open',
      scale: {
        state: { xLeft: 1, xRight: 9, xGuideY: 5, yTop: 1, yBottom: 9, yGuideX: 5 },
        distanceMmX: 3000,
        distanceMmY: 3000,
        confirmed: true,
      },
      eraserTouched: false,
    }
    expect(isDevWorkspaceSession(session)).toBe(true)
  })

  it('accepts minimal valid v2 session shape', () => {
    const session = {
      schemaVersion: 2 as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      imageName: 'test.jpg',
      imageWidth: 10,
      imageHeight: 10,
      workingImagePng: 'data:image/png;base64,AA==',
      preprocess: { ...DEFAULT_PREPROCESS },
      drawingProfileId: 'open',
      scale: {
        state: { xLeft: 1, xRight: 9, xGuideY: 5, yTop: 1, yBottom: 9, yGuideX: 5 },
        distanceMmX: 3000,
        distanceMmY: 3000,
        confirmed: true,
      },
      eraserTouched: false,
      flow: {
        targetFlowStep: 'preprocess' as const,
        preprocessTab: 'walls' as const,
        profileConfirmed: false,
        restoreMode: 'exact' as const,
      },
    }
    expect(isDevWorkspaceSession(session)).toBe(true)
  })
})
