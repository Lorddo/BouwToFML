import type { CanvasLike } from '@/cv/port/canvasEnv'
import type { InkDiffBounds } from '@/cv/walls/rooms/room-ink-symmetric'
import {
  updateRoomRasterPreviewMask,
  type RoomRasterCache,
} from '@/cv/walls/rooms/room-raster-cache'
import type { RoomPhase } from './useWorkspaceRoomFaces'

export function shouldRefreshPreviewForPhase(phase: RoomPhase): boolean {
  return (
    phase === 'review' || phase === 'recalculating' || phase === 'done' || phase === 'finalizing'
  )
}

export function refreshPreviewMask(
  cache: RoomRasterCache,
  options?: { dirtyBounds?: InkDiffBounds | null },
): CanvasLike {
  return updateRoomRasterPreviewMask(cache, { dirtyBounds: options?.dirtyBounds })
}
