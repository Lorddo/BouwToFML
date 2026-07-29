import type { ExtractionOutput } from '@/core/extraction'
import type { WallJunctionStrategy } from '@/core/extraction/types'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import {
  serializeFaceOverrides,
  serializePinnedRoots,
  type RoomRasterCache,
} from '@/cv/walls/rooms/room-raster-cache'
import { isFinalizeTabOutput } from '@/cv/workspace/layer-flow'
import type { RoomPhase } from './useWorkspaceRoomFaces'

export function wallsFinalizeOutputValid(output: ExtractionOutput | null | undefined): boolean {
  return isFinalizeTabOutput(output)
}

export async function finalizeWallDetection(ctx: {
  roomRasterCache: RoomRasterCache | null
  roomPhase: RoomPhase
  setRoomPhase: (phase: RoomPhase) => void
  setStatus?: (message: string) => void
  syncDetectionComplete: () => void
  getWallsOutput: () => ExtractionOutput | null | undefined
  refreshPreviewMask: (cache: RoomRasterCache) => void
  onExtractTargets: (
    targets: { walls?: boolean; wallJunctionStrategy?: WallJunctionStrategy },
    options?: {
      phase?: 'classify' | 'recalculate' | 'finalize' | 'full'
      roomClassifyState?: SerializedRoomClassifyState
      faceOverrides?: Array<[number, RoomRasterClass]>
      pinnedRoots?: number[]
    },
  ) => Promise<boolean>
  ensureEditableCacheAfterFinalize: (output: ExtractionOutput | null | undefined) => Promise<void>
  onFinalizeSuccess?: () => void | Promise<void>
}): Promise<boolean> {
  const cache = ctx.roomRasterCache
  if (!cache || (ctx.roomPhase !== 'review' && ctx.roomPhase !== 'done')) return false

  ctx.setRoomPhase('finalizing')
  ctx.setStatus?.('Afronden detectie…')
  const ok = await ctx.onExtractTargets(
    { walls: true, wallJunctionStrategy: 'room_first' },
    {
      phase: 'finalize',
      roomClassifyState: cache.state,
      faceOverrides: serializeFaceOverrides(cache),
      pinnedRoots: serializePinnedRoots(cache),
    },
  )
  const finalized = ctx.getWallsOutput()
  if (ok && wallsFinalizeOutputValid(finalized)) {
    ctx.setRoomPhase('done')
    await ctx.ensureEditableCacheAfterFinalize(finalized)
    ctx.syncDetectionComplete()
    await ctx.onFinalizeSuccess?.()
    return true
  }
  ctx.setRoomPhase('review')
  if (!wallsFinalizeOutputValid(finalized) && cache) {
    ctx.refreshPreviewMask(cache)
  }
  ctx.syncDetectionComplete()
  return false
}
