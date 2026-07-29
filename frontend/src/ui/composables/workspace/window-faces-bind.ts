import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { RoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import {
  bindWindowsToWalls,
  mergeAdjacentBoundWindows,
  type BoundWindow,
  type ResolvedWindowCandidate,
  type WindowBindRejection,
} from '@/cv/windows'
import { windowCandidateStillClassifiedAsWindow } from './window-stage-cache-prune'
import {
  resolveEffectiveWallClassification,
  resolveEffectiveWallParentMap,
} from './faces-effective-classification'
import type { WindowAxelStageCache } from './window-faces-helpers'

export function filterResolvedWindowsStillClassifiedAsWindow(params: {
  resolved: ResolvedWindowCandidate[]
  roomRasterCache: RoomRasterCache | null
  wallsMeta: TabDetectionOutputs['walls'] | null | undefined
}): ResolvedWindowCandidate[] {
  const classification = resolveEffectiveWallClassification({
    roomRasterCache: params.roomRasterCache,
    wallsMeta: params.wallsMeta,
  })
  if (!classification) return params.resolved
  const parentMap = resolveEffectiveWallParentMap({
    roomRasterCache: params.roomRasterCache,
    wallsMeta: params.wallsMeta,
  })
  return params.resolved.filter((window) =>
    windowCandidateStillClassifiedAsWindow(window, classification, parentMap),
  )
}

export type BindResolvedWindowsResult = {
  bound: BoundWindow[]
  rejected: WindowBindRejection[]
  /** Filtered Stage-4 list when class-still dropped candidates; null = unchanged. */
  nextStage4Resolved: ResolvedWindowCandidate[] | null
}

/**
 * L14-bind van Stage-4 resolved ramen op semantic wall graph.
 * Class-still filter vóór bind; geen Stage-herdetectie.
 */
export function bindResolvedWindowsToWalls(params: {
  stageCache: WindowAxelStageCache
  walls: TabDetectionOutputs['walls'] | null | undefined
  roomRasterCache: RoomRasterCache | null
}): BindResolvedWindowsResult {
  const graph = params.walls?.semanticWallGraph
  const segments = graph?.segments ?? []
  const junctions = graph?.junctions ?? []
  if (segments.length <= 0) {
    return { bound: [], rejected: [], nextStage4Resolved: null }
  }
  const resolved = filterResolvedWindowsStillClassifiedAsWindow({
    resolved: params.stageCache.stage4ResolvedWindows,
    roomRasterCache: params.roomRasterCache,
    wallsMeta: params.walls,
  })
  const nextStage4Resolved =
    resolved.length !== params.stageCache.stage4ResolvedWindows.length ? resolved : null
  if (resolved.length <= 0) {
    return { bound: [], rejected: [], nextStage4Resolved }
  }
  const result = bindWindowsToWalls({
    windows: resolved,
    refBands: params.stageCache.refBands,
    segments,
    junctions,
  })
  return {
    bound: mergeAdjacentBoundWindows(result.bound),
    rejected: result.rejected,
    nextStage4Resolved,
  }
}
