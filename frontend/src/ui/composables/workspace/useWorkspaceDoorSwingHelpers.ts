import { effectiveClassification, type RoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { SelectionRect } from '@/platform/selection'
import type {
  DoorResolvedKind,
  DoorSizeBandPx,
  DoorSwingHypothesis,
  DoorSwingStage,
  ResolvedDoorCandidate,
} from '@/cv/doors'
import { resolveDoorFmlTemplateRefId } from '@/core/fml/types'
import { resolveOpeningCatalog, toCvDoorKind } from '@/core/fml/opening-refid-catalog'

// ESC:O-28 (D)
export const DOOR_SWING_REFRESH_DEBOUNCE_MS = 80

export type DoorSwingUiStats = {
  stage: DoorSwingStage
  hypothesisCount: number
  stage1HypothesisCount: number
  singleCount: number
  clusterCount: number
  refBandCount: number
  seedCount: number
  acceptedCount: number
  rejectedCount: number
  rejectedTooFull: number
  rejectedTooEmpty: number
  rejectedSurroundedByRoom: number
  rejectedNoWallTouch: number
  angleRescueCount: number
  resolvedDoorCount: number
  sizeBandPx: DoorSizeBandPx | null
}

export type DoorSwingStageCache = {
  stage1Hypotheses: DoorSwingHypothesis[]
  stage2AcceptedHypotheses: DoorSwingHypothesis[]
  resolvedDoors: ResolvedDoorCandidate[]
  stage2RejectedCount: number
  stage2RejectedTooFull: number
  stage2RejectedTooEmpty: number
  stage2RejectedSurroundedByRoom: number
  stage2RejectedNoWallTouch: number
  angleRescueCount: number
  singleCount: number
  clusterCount: number
  refBandCount: number
  seedCount: number
  sizeBandPx: DoorSizeBandPx | null
}

export function createEmptyDoorSwingStageCache(
  sizeBandPx: DoorSizeBandPx | null = null,
): DoorSwingStageCache {
  return {
    stage1Hypotheses: [],
    stage2AcceptedHypotheses: [],
    resolvedDoors: [],
    stage2RejectedCount: 0,
    stage2RejectedTooFull: 0,
    stage2RejectedTooEmpty: 0,
    stage2RejectedSurroundedByRoom: 0,
    stage2RejectedNoWallTouch: 0,
    angleRescueCount: 0,
    singleCount: 0,
    clusterCount: 0,
    refBandCount: 0,
    seedCount: 0,
    sizeBandPx,
  }
}

export function normalizeDoorSwingState(
  state: SerializedRoomClassifyState,
): SerializedRoomClassifyState {
  return {
    ...state,
    labelsData:
      state.labelsData instanceof Int32Array ? state.labelsData : new Int32Array(state.labelsData),
    rawLabelsData: state.rawLabelsData
      ? state.rawLabelsData instanceof Int32Array
        ? state.rawLabelsData
        : new Int32Array(state.rawLabelsData)
      : undefined,
    parentMap: [...state.parentMap],
    classificationByLabel: [...state.classificationByLabel],
  }
}

export function resolvePriorDoorClassification(
  state: SerializedRoomClassifyState,
  roomRasterCache: RoomRasterCache | null,
): Map<number, RoomRasterClass> {
  if (roomRasterCache && roomRasterCache.state.labelsData.length === state.labelsData.length) {
    return effectiveClassification(roomRasterCache)
  }
  return new Map(state.classificationByLabel)
}

export function signatureForDoorRects(rects: SelectionRect[]): string {
  return rects
    .filter((rect) => rect.type === 'door')
    .map(
      (rect) =>
        `${rect.type}:${rect.x},${rect.y},${rect.width},${rect.height}:${resolveDoorFmlTemplateRefId(rect.fmlRefId)}`,
    )
    .join('|')
}

export function collectAcceptedDoorFaceIds(hypotheses: DoorSwingHypothesis[]): number[] {
  const ids = new Set<number>()
  for (const hyp of hypotheses) {
    for (const faceId of hyp.faceIds) {
      if (faceId > 0) ids.add(faceId)
    }
  }
  return [...ids]
}

export function resolveDoorRefKind(refid: string): DoorResolvedKind {
  return toCvDoorKind(resolveOpeningCatalog(refid, 'door').kind)
}

export function activeHypothesesForStage(params: {
  stage: DoorSwingStage
  cache: DoorSwingStageCache
}): DoorSwingHypothesis[] {
  return params.stage === 'stage2'
    ? params.cache.stage2AcceptedHypotheses
    : params.cache.stage1Hypotheses
}
