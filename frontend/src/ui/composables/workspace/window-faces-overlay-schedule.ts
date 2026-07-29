import type { CanvasLike } from '@/cv/port/canvasEnv'
import {
  renderWindowOverlayCanvas,
  type WindowAxelStage,
} from '@/cv/windows'
import {
  activeWindowHypothesesForStage,
  hypothesesWithStackEvidence,
  statsByRef,
  type FaceBBox,
  type WindowAxelStageCache,
  type WindowFaceUiStats,
  WINDOW_REFRESH_DEBOUNCE_MS,
} from './window-faces-helpers'

export { WINDOW_REFRESH_DEBOUNCE_MS }

export function renderWindowOverlayForActiveStage(ctx: {
  stage: WindowAxelStage
  stageCache: WindowAxelStageCache
  overlayCache: {
    width: number
    height: number
    labelsData: Int32Array
    parentMap: Map<number, number>
    faceBboxByRoot: Map<number, FaceBBox>
  } | null
}): { canvas: CanvasLike | null; revision: boolean } {
  if (!ctx.overlayCache) {
    return { canvas: null, revision: false }
  }
  const baseHyps = activeWindowHypothesesForStage({
    stage: ctx.stage,
    cache: ctx.stageCache,
  })
  const hypotheses =
    ctx.stage === 'stage3'
      ? hypothesesWithStackEvidence({
          hypotheses: baseHyps,
          stage3Accepted: ctx.stageCache.stage3Accepted,
          faceBboxByRoot: ctx.overlayCache.faceBboxByRoot,
        })
      : baseHyps
  const doorframeHypotheses =
    ctx.stage === 'stage3'
      ? hypothesesWithStackEvidence({
          hypotheses: ctx.stageCache.stage3AcceptedDoorframes.map((e) => e.hypothesis),
          stage3Accepted: ctx.stageCache.stage3AcceptedDoorframes,
          faceBboxByRoot: ctx.overlayCache.faceBboxByRoot,
        })
      : ctx.stageCache.stage3AcceptedDoorframes.map((e) => e.hypothesis)

  const canvas = renderWindowOverlayCanvas({
    width: ctx.overlayCache.width,
    height: ctx.overlayCache.height,
    labelsData: ctx.overlayCache.labelsData,
    parentMap: ctx.overlayCache.parentMap,
    hypotheses,
    doorframeHypotheses,
  })
  return { canvas, revision: true }
}

/** Same shape as `syncDoorSwingStatsFromCache`: active list + domain stats object. */
export function syncWindowStatsFromCache(ctx: {
  stage: WindowAxelStage
  cache: WindowAxelStageCache
}): { activeHypotheses: ReturnType<typeof activeWindowHypothesesForStage>; stats: WindowFaceUiStats } {
  const activeHypotheses = activeWindowHypothesesForStage({
    stage: ctx.stage,
    cache: ctx.cache,
  })
  const stage2RejectedCount =
    ctx.cache.stage2RejectedShare + ctx.cache.stage2RejectedAdjacent + ctx.cache.stage2RejectedDirectional
  return {
    activeHypotheses,
    stats: {
      stage: ctx.stage,
      refBandCount: ctx.cache.refBands.length,
      candidateRootCount: ctx.cache.stage1CandidateRootCount,
      stage1HypothesisCount: ctx.cache.stage1Hypotheses.length,
      acceptedCount:
        ctx.stage === 'stage1'
          ? ctx.cache.stage1AcceptedCount
          : ctx.stage === 'stage2'
            ? ctx.cache.stage2AcceptedHypotheses.length
            : ctx.cache.stage3AcceptedHypotheses.length,
      rejectedCount:
        ctx.stage === 'stage1'
          ? ctx.cache.stage1RejectedCount
          : ctx.stage === 'stage2'
            ? stage2RejectedCount
            : ctx.cache.stage3RejectedNoEvidence,
      stage2AcceptedCount: ctx.cache.stage2AcceptedHypotheses.length,
      stage2RejectedShare: ctx.cache.stage2RejectedShare,
      stage2RejectedAdjacent: ctx.cache.stage2RejectedAdjacent,
      stage2RejectedDirectional: ctx.cache.stage2RejectedDirectional,
      stage3AcceptedCount: ctx.cache.stage3AcceptedHypotheses.length,
      stage3AcceptedByFraming: ctx.cache.stage3AcceptedByFraming,
      stage3AcceptedByStripStack: ctx.cache.stage3AcceptedByStripStack,
      stage3RejectedNoEvidence: ctx.cache.stage3RejectedNoEvidence,
      stage3DoorframeAcceptedCount: ctx.cache.stage3DoorframeAcceptedCount,
      stage4ResolvedCount: ctx.cache.stage4ResolvedWindows.length,
      stage4DoorframeCount: ctx.cache.stage4ResolvedDoorframes.length,
      hypothesisCount: activeHypotheses.length,
      byRef: statsByRef(ctx.cache.refBands, activeHypotheses),
    },
  }
}
