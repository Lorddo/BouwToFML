import { describe, expect, it, vi } from 'vitest'
import { createRoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import { resolveThinDoorMaskKeepFaceIds } from '@/ui/composables/workspace/door-thin-mask-finalize'
import {
  createAutoPassState,
  pushStage2DoorsOntoWalls,
} from '@/ui/composables/workspace/door-faces-auto-pass'
import type { DoorSwingHypothesis } from '@/cv/doors'

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

describe('resolveThinDoorMaskKeepFaceIds', () => {
  it('doet geen meetlint zonder hyps of zonder muurdikte', async () => {
    const cache = createRoomRasterCache(minimalState())
    cache.maskKeepDoorFaceIds = new Set([99])
    expect(
      await resolveThinDoorMaskKeepFaceIds({
        cache,
        accepted: [],
        referenceWallThicknessPx: 54,
      }),
    ).toEqual([])
    expect(
      await resolveThinDoorMaskKeepFaceIds({
        cache,
        accepted: [
          { faceIds: [1], unionBBox: { x: 0, y: 0, width: 10, height: 4 } } as DoorSwingHypothesis,
        ],
        referenceWallThicknessPx: 0,
      }),
    ).toEqual([])
  })
})

describe('pushStage2DoorsOntoWalls — geen D-63', () => {
  it('wist maskKeep (thin-mask is finalize-only)', async () => {
    const cache = createRoomRasterCache(minimalState())
    cache.maskKeepDoorFaceIds = new Set([1, 2])
    const persistOverrides = vi.fn()
    await pushStage2DoorsOntoWalls({
      accepted: [],
      bridgeWallFaceIds: [],
      roomRasterCache: cache,
      wallsOutput: null,
      referenceWallThicknessPx: 54,
      autoPassState: createAutoPassState(),
      persistOverrides,
    })
    expect(cache.maskKeepDoorFaceIds.size).toBe(0)
  })
})
