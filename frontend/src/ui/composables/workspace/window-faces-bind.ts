import { tally } from '@/core/diagnostics'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import { ensureFaceDualSpace } from '@/cv/walls/rooms/room-raster-cache'
import type { RoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import {
  bindWindowsToWalls,
  dedupeOverlappingBoundWindows,
  suppressWindowsNearDoors,
  type BoundWindow,
  type ResolvedWindowCandidate,
  type WallOpeningSpan,
  type WindowBindRejection,
} from '@/cv/windows'
import {
  reconcileResolvedWindowsForClassification,
  resolvedWindowsListChanged,
} from './window-faces-reconcile-classification'
import {
  resolveEffectiveWallClassification,
  resolveEffectiveWallParentMap,
} from './faces-effective-classification'
import type { WindowAxelStageCache } from './window-faces-helpers'

// ESC:O-22 (B)
/**
 * L14-prep: handmatig gedemote faces (niet langer `window`) strippen + bbox/width
 * herberekenen. Stage 1–4 cache blijft historisch; alleen wat naar bind/FML gaat.
 */
export function filterResolvedWindowsStillClassifiedAsWindow(params: {
  resolved: ResolvedWindowCandidate[]
  roomRasterCache: RoomRasterCache | null
  wallsMeta: TabDetectionOutputs['walls'] | null | undefined
}): ResolvedWindowCandidate[] {
  tally('O-22', 'filter_class_window')
  const classification = resolveEffectiveWallClassification({
    roomRasterCache: params.roomRasterCache,
    wallsMeta: params.wallsMeta,
  })
  if (!classification) return params.resolved
  const parentMap = resolveEffectiveWallParentMap({
    roomRasterCache: params.roomRasterCache,
    wallsMeta: params.wallsMeta,
  })
  const dual = params.roomRasterCache ? ensureFaceDualSpace(params.roomRasterCache) : null
  return reconcileResolvedWindowsForClassification({
    resolved: params.resolved,
    classification,
    parentMap,
    dual,
  })
}

export type BindResolvedWindowsResult = {
  bound: BoundWindow[]
  rejected: WindowBindRejection[]
  /** Reconciled Stage-4 list when demote/filter changed candidates; null = unchanged. */
  nextStage4Resolved: ResolvedWindowCandidate[] | null
}

/**
 * L14-bind van Stage-4 resolved ramen op semantic wall graph.
 * Class-reconcile (strip demoted faces) vóór bind; 1D muurgat-dedupe (+ optioneel deur-suppress).
 * R-27 pair/triple-merge gebeurt in FML-conversie (`toLayer14WindowsForFml`).
 */
export function bindResolvedWindowsToWalls(params: {
  stageCache: WindowAxelStageCache
  walls: TabDetectionOutputs['walls'] | null | undefined
  roomRasterCache: RoomRasterCache | null
  /** Oriented doors (L12 spans); leeg/null → geen deur↔raam suppress. */
  doors?: readonly WallOpeningSpan[] | null
}): BindResolvedWindowsResult {
  const graph = params.walls?.semanticWallGraph
  const segments = graph?.segments ?? []
  const junctions = graph?.junctions ?? []
  if (segments.length <= 0) {
    return { bound: [], rejected: [], nextStage4Resolved: null }
  }
  const source = params.stageCache.stage4ResolvedWindows
  const resolved = filterResolvedWindowsStillClassifiedAsWindow({
    resolved: source,
    roomRasterCache: params.roomRasterCache,
    wallsMeta: params.walls,
  })
  const nextStage4Resolved = resolvedWindowsListChanged(source, resolved) ? resolved : null
  if (resolved.length <= 0) {
    return { bound: [], rejected: [], nextStage4Resolved }
  }
  const result = bindWindowsToWalls({
    windows: resolved,
    refBands: params.stageCache.refBands,
    segments,
    junctions,
  })
  const deduped = dedupeOverlappingBoundWindows(result.bound)
  return {
    bound: suppressWindowsNearDoors(deduped, params.doors ?? []),
    rejected: result.rejected,
    nextStage4Resolved,
  }
}
