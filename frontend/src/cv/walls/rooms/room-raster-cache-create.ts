import {
  countClassificationStats,
  type RoomRasterClass,
} from './room-ink-classify'
import type { SerializedRoomClassifyState } from '../strategies/room-first'
import {
  syncDoorBridgeWallOverrides as syncDoorBridgeWallOverridesBase,
  syncDoorSwingFaceOverrides as syncDoorSwingFaceOverridesBase,
  syncDoorframeFaceOverrides as syncDoorframeFaceOverridesBase,
  syncPinnedClassOverrides as syncPinnedClassOverridesBase,
  syncWindowFaceOverrides as syncWindowFaceOverridesBase,
  type SyncPinnedClassOverridesParams,
  type SyncPinnedClassResult,
} from './face-override-sync'
import type { RoomRasterCache } from './room-raster-cache-types'
import {
  bumpFaceDualClassEpoch,
  effectiveClassification,
  rebuildFaceBBoxIndex,
} from './room-raster-cache-dual'

function afterPinnedSync(cache: RoomRasterCache, result: SyncPinnedClassResult): SyncPinnedClassResult {
  if (result.changed) bumpFaceDualClassEpoch(cache)
  return result
}

export function syncPinnedClassOverrides(
  cache: RoomRasterCache,
  params: SyncPinnedClassOverridesParams,
): SyncPinnedClassResult {
  return afterPinnedSync(cache, syncPinnedClassOverridesBase(cache, params))
}

export function syncDoorSwingFaceOverrides(
  cache: RoomRasterCache,
  doorFaceIds: Iterable<number>,
  referenceWallThicknessPx?: number,
  previousAutoFaceIds?: Iterable<number>,
): SyncPinnedClassResult {
  return afterPinnedSync(
    cache,
    syncDoorSwingFaceOverridesBase(cache, doorFaceIds, referenceWallThicknessPx, previousAutoFaceIds),
  )
}

export function syncDoorBridgeWallOverrides(
  cache: RoomRasterCache,
  bridgeFaceIds: Iterable<number>,
  referenceWallThicknessPx?: number,
  previousAutoFaceIds?: Iterable<number>,
): SyncPinnedClassResult {
  return afterPinnedSync(
    cache,
    syncDoorBridgeWallOverridesBase(
      cache,
      bridgeFaceIds,
      referenceWallThicknessPx,
      previousAutoFaceIds,
    ),
  )
}

export function syncWindowFaceOverrides(
  cache: RoomRasterCache,
  windowFaceIds: Iterable<number>,
  referenceWallThicknessPx?: number,
  previousAutoFaceIds?: Iterable<number>,
): SyncPinnedClassResult {
  return afterPinnedSync(
    cache,
    syncWindowFaceOverridesBase(cache, windowFaceIds, referenceWallThicknessPx, previousAutoFaceIds),
  )
}

export function syncDoorframeFaceOverrides(
  cache: RoomRasterCache,
  doorframeFaceIds: Iterable<number>,
  referenceWallThicknessPx?: number,
  previousAutoFaceIds?: Iterable<number>,
): SyncPinnedClassResult {
  return afterPinnedSync(
    cache,
    syncDoorframeFaceOverridesBase(
      cache,
      doorframeFaceIds,
      referenceWallThicknessPx,
      previousAutoFaceIds,
    ),
  )
}

export function createRoomRasterCache(state: SerializedRoomClassifyState): RoomRasterCache {
  const normalized: SerializedRoomClassifyState = {
    ...state,
    labelsData:
      state.labelsData instanceof Int32Array ? state.labelsData : new Int32Array(state.labelsData),
    rawLabelsData: state.rawLabelsData
      ? state.rawLabelsData instanceof Int32Array
        ? state.rawLabelsData
        : new Int32Array(state.rawLabelsData)
      : undefined,
    baselineWallBwData: state.baselineWallBwData
      ? state.baselineWallBwData instanceof Uint8Array
        ? state.baselineWallBwData
        : new Uint8Array(state.baselineWallBwData)
      : undefined,
  }

  const cache: RoomRasterCache = {
    state: normalized,
    faceOverrides: new Map(),
    pinnedRoots: new Set(),
    previewMaskUrl: null,
    previewMaskCanvas: null,
    faceDual: null,
    faceDualClassEpoch: 0,
    faceDualBuiltClassEpoch: -1,
    faceDualBuiltRaw: null,
    faceDualBuiltInk: null,
    faceBBox: null,
  }

  applySerializedFaceOverrides(cache, state.faceOverrides, state.pinnedRoots)
  rebuildFaceBBoxIndex(cache)
  return cache
}

export function classificationStats(cache: RoomRasterCache): {
  wallCount: number
  surfaceCount: number
  unknownCount: number
  doorCount: number
  windowCount: number
  doorframeCount: number
  overrideCount: number
} {
  const stats = countClassificationStats(effectiveClassification(cache))
  return { ...stats, overrideCount: cache.faceOverrides.size }
}

export function serializeFaceOverrides(cache: RoomRasterCache): Array<[number, RoomRasterClass]> {
  return [...cache.faceOverrides.entries()]
}

export function serializePinnedRoots(cache: RoomRasterCache): number[] {
  return [...cache.pinnedRoots]
}

export function applySerializedFaceOverrides(
  cache: RoomRasterCache,
  overrides?: Array<[number, RoomRasterClass]>,
  pinnedRoots?: number[],
): void {
  if (overrides) {
    cache.faceOverrides.clear()
    for (const [label, cls] of overrides) {
      cache.faceOverrides.set(label, cls)
    }
  }
  if (pinnedRoots) {
    cache.pinnedRoots.clear()
    for (const root of pinnedRoots) {
      cache.pinnedRoots.add(root)
    }
  }
}
