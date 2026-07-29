import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import { effectiveClassification, type RoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import {
  applyFaceClassificationOverrides,
  type RoomRasterClass,
} from '@/cv/walls/rooms/room-ink-classify'

/**
 * Live wall face classification for prune / snap / bind.
 * Prefers roomRasterCache; otherwise merges tabOutput base + faceOverrides
 * via applyFaceClassificationOverrides (D1-canonical).
 * @returns null when neither cache nor classificationByLabel is available.
 */
export function resolveEffectiveWallClassification(params: {
  roomRasterCache: RoomRasterCache | null
  wallsMeta: TabDetectionOutputs['walls'] | null | undefined
}): Map<number, RoomRasterClass> | null {
  if (params.roomRasterCache) return effectiveClassification(params.roomRasterCache)
  const stateRaw = params.wallsMeta?.meta?.roomClassifyState
  if (!stateRaw?.classificationByLabel) return null
  const base = new Map(stateRaw.classificationByLabel)
  const overrideEntries = stateRaw.faceOverrides
  if (!overrideEntries || overrideEntries.length === 0) return base
  const overrides = new Map<number, RoomRasterClass>()
  for (const [label, cls] of overrideEntries) {
    if (label > 0) overrides.set(label, cls)
  }
  if (overrides.size === 0) return base
  return applyFaceClassificationOverrides(base, overrides)
}

export function resolveEffectiveWallParentMap(params: {
  roomRasterCache: RoomRasterCache | null
  wallsMeta: TabDetectionOutputs['walls'] | null | undefined
}): Map<number, number> {
  if (params.roomRasterCache) return new Map(params.roomRasterCache.state.parentMap)
  const stateRaw = params.wallsMeta?.meta?.roomClassifyState
  if (!stateRaw?.parentMap) return new Map()
  return new Map(stateRaw.parentMap)
}
