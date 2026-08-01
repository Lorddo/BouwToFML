import type { CanvasLike } from '@/cv/port/canvasEnv'
import { renderDoorSwingOverlayCanvas, type DoorSwingStage } from '@/cv/doors'
import {
  activeHypothesesForStage,
  DOOR_SWING_REFRESH_DEBOUNCE_MS,
  noteDoorSwingRefreshDebounce,
  type DoorSwingStageCache,
} from './useWorkspaceDoorSwingHelpers'

export { DOOR_SWING_REFRESH_DEBOUNCE_MS, noteDoorSwingRefreshDebounce }

export function renderDoorSwingOverlayForActiveStage(ctx: {
  stage: DoorSwingStage
  stageCache: DoorSwingStageCache
  overlayCache: {
    width: number
    height: number
    labelsData: Int32Array
    parentMap: Map<number, number>
  } | null
}): { canvas: CanvasLike | null; revision: boolean } {
  if (!ctx.overlayCache) {
    return { canvas: null, revision: false }
  }
  const canvas = renderDoorSwingOverlayCanvas({
    width: ctx.overlayCache.width,
    height: ctx.overlayCache.height,
    labelsData: ctx.overlayCache.labelsData,
    parentMap: ctx.overlayCache.parentMap,
    hypotheses: activeHypothesesForStage({
      stage: ctx.stage,
      cache: ctx.stageCache,
    }),
  })
  return { canvas, revision: true }
}

export function syncDoorSwingStatsFromCache(ctx: {
  stage: DoorSwingStage
  cache: DoorSwingStageCache
}) {
  const activeHypotheses = activeHypothesesForStage({
    stage: ctx.stage,
    cache: ctx.cache,
  })
  return {
    activeHypotheses,
    stats: {
      stage: ctx.stage,
      hypothesisCount: activeHypotheses.length,
      stage1HypothesisCount: ctx.cache.stage1Hypotheses.length,
      singleCount: ctx.cache.singleCount,
      clusterCount: ctx.cache.clusterCount,
      refBandCount: ctx.cache.refBandCount,
      seedCount: ctx.cache.seedCount,
      acceptedCount: ctx.cache.stage2AcceptedHypotheses.length,
      rejectedCount: ctx.cache.stage2RejectedCount,
      rejectedTooFull: ctx.cache.stage2RejectedTooFull,
      rejectedTooEmpty: ctx.cache.stage2RejectedTooEmpty,
      rejectedSurroundedByRoom: ctx.cache.stage2RejectedSurroundedByRoom,
      rejectedNoWallTouch: ctx.cache.stage2RejectedNoWallTouch,
      angleRescueCount: ctx.cache.angleRescueCount,
      resolvedDoorCount: ctx.cache.resolvedDoors.length,
      sizeBandPx: ctx.cache.sizeBandPx,
    },
  }
}
