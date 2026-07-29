import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import {
  serializeFaceOverrides,
  serializePinnedRoots,
  type RoomRasterCache,
} from '@/cv/walls/rooms/room-raster-cache'

/**
 * Persist current face overrides + pinned roots from the room raster cache
 * back into the walls tabOutput (roomClassifyState).
 *
 * @param includeParentMap — doors need parentMap sync (seed-detach); windows do not.
 */
export function persistOverridesToTabOutputs(
  cache: RoomRasterCache,
  tabOutputs: TabDetectionOutputs,
  options?: { includeParentMap?: boolean },
): TabDetectionOutputs | null {
  const walls = tabOutputs.walls
  const state = walls?.meta?.roomClassifyState
  if (!walls?.meta || !state) return null
  const faceOverrides = serializeFaceOverrides(cache)
  const pinnedRoots = serializePinnedRoots(cache)
  return {
    ...tabOutputs,
    walls: {
      ...walls,
      meta: {
        ...walls.meta,
        roomClassifyState: {
          ...state,
          faceOverrides,
          pinnedRoots,
          ...(options?.includeParentMap ? { parentMap: cache.state.parentMap } : {}),
        },
      },
    },
  }
}

/** Door-specific shorthand: always includes parentMap. */
export function persistDoorOverridesToTabOutputs(
  cache: RoomRasterCache,
  tabOutputs: TabDetectionOutputs,
): TabDetectionOutputs | null {
  return persistOverridesToTabOutputs(cache, tabOutputs, { includeParentMap: true })
}

/** Window-specific shorthand: no parentMap. */
export function persistWindowOverridesToTabOutputs(
  cache: RoomRasterCache,
  tabOutputs: TabDetectionOutputs,
): TabDetectionOutputs | null {
  return persistOverridesToTabOutputs(cache, tabOutputs)
}
