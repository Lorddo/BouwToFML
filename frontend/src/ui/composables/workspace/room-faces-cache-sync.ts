import type { ExtractionOutput } from '@/core/extraction'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import { createRoomRasterCache, type RoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import type { RoomPhase } from './useWorkspaceRoomFaces'

export function isWallsOutputFinalized(output: ExtractionOutput | null | undefined): boolean {
  const phase = output?.meta?.roomPipelinePhase
  return phase === 'finalize' || phase === 'full'
}

export function isWallsClassifyOutput(output: ExtractionOutput | null | undefined): boolean {
  const phase = output?.meta?.roomPipelinePhase
  return (phase === 'classify' || phase === 'recalculate') && !!output?.meta?.roomClassifyState
}

export function restoreCacheFromOutput(
  output: ExtractionOutput | null | undefined,
): RoomRasterCache | null {
  const state = output?.meta?.roomClassifyState
  if (!state) return null
  return createRoomRasterCache(state)
}

export function syncFromTabOutputs(ctx: {
  roomPhase: RoomPhase
  tabOutputs: TabDetectionOutputs
  roomRasterCache: RoomRasterCache | null
  setRoomPhase: (phase: RoomPhase) => void
  syncDetectionComplete: () => void
  ingestClassifyOutput: (output: ExtractionOutput | null) => Promise<boolean>
  restoreCacheFromTabOutput: (
    output: ExtractionOutput | null | undefined,
    options?: { refreshPreview?: boolean },
  ) => Promise<boolean>
  ensureEditableCacheAfterFinalize: (output: ExtractionOutput | null | undefined) => Promise<void>
  flowStep: string
  templateTab: string
  profileConfirmed: boolean
  referenceWallThicknessPx: number | null
}): Promise<void> {
  return syncFromTabOutputsImpl(ctx)
}

async function syncFromTabOutputsImpl(ctx: {
  roomPhase: RoomPhase
  tabOutputs: TabDetectionOutputs
  roomRasterCache: RoomRasterCache | null
  setRoomPhase: (phase: RoomPhase) => void
  syncDetectionComplete: () => void
  ingestClassifyOutput: (output: ExtractionOutput | null) => Promise<boolean>
  restoreCacheFromTabOutput: (
    output: ExtractionOutput | null | undefined,
    options?: { refreshPreview?: boolean },
  ) => Promise<boolean>
  ensureEditableCacheAfterFinalize: (output: ExtractionOutput | null | undefined) => Promise<void>
  flowStep: string
  templateTab: string
  profileConfirmed: boolean
  referenceWallThicknessPx: number | null
}): Promise<void> {
  const walls = ctx.tabOutputs.walls

  if (
    (ctx.roomPhase === 'review' ||
      ctx.roomPhase === 'done' ||
      ctx.roomPhase === 'classifying' ||
      ctx.roomPhase === 'finalizing') &&
    (isWallsClassifyOutput(walls) || isWallsOutputFinalized(walls)) &&
    !ctx.roomRasterCache
  ) {
    await ctx.restoreCacheFromTabOutput(walls)
    if (!isWallsOutputFinalized(walls)) return
  }

  if (isWallsOutputFinalized(walls)) {
    if (ctx.roomPhase === 'review' || ctx.roomPhase === 'finalizing') {
      ctx.syncDetectionComplete()
      return
    }
    if (ctx.roomPhase !== 'done') {
      ctx.setRoomPhase('done')
    }
    if (!ctx.roomRasterCache) {
      await ctx.ensureEditableCacheAfterFinalize(walls)
    }
    ctx.syncDetectionComplete()
    return
  }
  if (isWallsClassifyOutput(walls) && ctx.roomPhase === 'idle') {
    await ctx.ingestClassifyOutput(walls)
    return
  }
  if (ctx.roomPhase === 'done' && !isWallsOutputFinalized(walls)) {
    ctx.setRoomPhase('idle')
    ctx.syncDetectionComplete()
    return
  }
  if (
    !walls &&
    ctx.flowStep === 'templates' &&
    ctx.templateTab === 'walls' &&
    ctx.profileConfirmed &&
    ctx.referenceWallThicknessPx == null
  ) {
    ctx.setRoomPhase('awaiting_reference')
    ctx.syncDetectionComplete()
  }
}
