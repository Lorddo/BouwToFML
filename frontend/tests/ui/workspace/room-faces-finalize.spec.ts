import { describe, expect, it, vi } from 'vitest'
import { createRoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import { finalizeWallDetection } from '@/ui/composables/workspace/room-faces-finalize'

function minimalState(): SerializedRoomClassifyState {
  return {
    width: 3,
    height: 2,
    rawLabelsData: new Int32Array([0, 1, 1, 0, 2, 2]),
    labelsData: new Int32Array([1, 1, 1, 2, 2, 2]),
    parentMap: [],
    classificationByLabel: [
      [1, 'wall'],
      [2, 'surface'],
    ],
    threshold: 0.8,
    mergedFaceCount: 2,
  }
}

describe('finalizeWallDetection — D-63', () => {
  it('stuurt maskKeepDoorFaceIds naar extract (leeg zonder hyps)', async () => {
    const cache = createRoomRasterCache(minimalState())
    const onExtractTargets = vi.fn(async () => false)
    await finalizeWallDetection({
      roomRasterCache: cache,
      roomPhase: 'review',
      setRoomPhase: vi.fn(),
      setFinalizePhase: vi.fn(),
      syncDetectionComplete: vi.fn(),
      getWallsOutput: () => null,
      refreshPreviewMask: vi.fn(),
      onExtractTargets,
      ensureEditableCacheAfterFinalize: vi.fn(),
      referenceWallThicknessPx: 54,
      getAcceptedDoorHyps: () => [],
    })
    expect(onExtractTargets).toHaveBeenCalledWith(
      { walls: true, wallJunctionStrategy: 'room_first' },
      expect.objectContaining({
        phase: 'finalize',
        maskKeepDoorFaceIds: [],
      }),
    )
    expect(cache.maskKeepDoorFaceIds.size).toBe(0)
  })
})
