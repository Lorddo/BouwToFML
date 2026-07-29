import type { Segment } from '@/cv/port/wallGraph'
import type { RoomWallFaceSkeleton, RoomWallJunction } from './rooms/room-wall-skeleton-types'
import type { SerializedRoomClassifyState } from './strategies/room-first'
import type { PipelineV3Debug, RoomWallMaskRle } from '@/core/extraction/types'
import type { WallPipelineVersion } from '@/platform/wall-pipeline-version'

export type RoomPipelinePhase = 'classify' | 'recalculate' | 'finalize' | 'full'

/**
 * Strategy-result naar geometry-pipeline / ExtractionOutput.
 * Geen preview/overlay-canvases: die werden nooit gekopieerd naar output (GC).
 */
export interface WallStrategyResult {
  roomInkCoverageThreshold?: number
  roomWallFaceSkeletons?: RoomWallFaceSkeleton[]
  /** Laag 1 (ruw WASM) — V3 layer1 / legacy veldnaam LayerA. */
  roomWallFaceSkeletonsLayerA?: RoomWallFaceSkeleton[]
  roomWallFaceSkeletonsFiltered?: RoomWallFaceSkeleton[]
  roomWallFaceSkeletonsLayerC?: RoomWallFaceSkeleton[]
  roomWallSkeletonSegments?: Segment[]
  roomWallSkeletonSegmentsRaw?: Segment[]
  roomWallSkeletonSegmentsFiltered?: Segment[]
  roomWallSkeletonSegmentsLayerC?: Segment[]
  roomWallJunctions?: RoomWallJunction[]
  roomWallJunctionsRaw?: RoomWallJunction[]
  roomWallJunctionsFiltered?: RoomWallJunction[]
  roomWallJunctionsLayerC?: RoomWallJunction[]
  pipelineV3Debug?: PipelineV3Debug
  roomWallMaskRle?: RoomWallMaskRle
  roomPipelinePhase?: RoomPipelinePhase
  wallPipelineVersion?: WallPipelineVersion
  roomClassifyState?: SerializedRoomClassifyState
  roomStats?: {
    graphEdgeCount: number
    faceCount: number
    surfaceCount: number
    wallCount: number
    unknownCount: number
    roomWallSkeletonSegmentCount?: number
    roomWallSkeletonWasmSegmentCount?: number
    roomWallSkeletonLayerAInputCount?: number
    roomWallSkeletonPolishedUnfilteredCount?: number
    roomWallSkeletonRawSegmentCount?: number
    roomWallSkeletonFilteredSegmentCount?: number
    roomWallSkeletonLayerCSegmentCount?: number
    roomWallJunctionCount?: number
    roomWallJunctionRawCount?: number
    roomWallJunctionFilteredCount?: number
    roomWallEndpointCount?: number
    roomWallConnectedBlobCount?: number
    roomWallSpeckleRemovedCount?: number
    roomWallDemotedRootCount?: number
    inkAssignedPx?: number
    inkUnresolvedPx?: number
  }
}

export function asSegmentCandidates(segments: Segment[], confidence = 0.75) {
  return segments.map((seg) => ({
    type: 'wall' as const,
    a: { ...seg.a },
    b: { ...seg.b },
    confidence,
    templateIndex: seg.templateIndex,
  }))
}
