import type { Segment } from '@/cv/port/wallGraph'
import type { RoomWallFaceSkeleton, RoomWallJunction } from '../room-wall-skeleton-types'

/**
 * V3 owns its layer result shapes — no import from pipeline-v2.
 * Structural parity with CURRENT V2 so cutover can archive V2 without breaking V3.
 */

export type LayerId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export interface PipelineV3Layer1Result {
  facesRaw: RoomWallFaceSkeleton[]
  allSegmentsRaw: Segment[]
  allJunctionsRaw: RoomWallJunction[]
  totalSegmentsRaw: number
  totalJunctionsRaw: number
}

export interface PipelineV3Layer2Result {
  facesClean: RoomWallFaceSkeleton[]
  allSegmentsClean: Segment[]
  allJunctionsClean: RoomWallJunction[]
  totalSegmentsClean: number
  totalJunctionsClean: number
  mergeStats: { mergedJunctionCount: number; dedupedCount: number }
}

export interface PipelineV3Layer3Result {
  facesPruned: RoomWallFaceSkeleton[]
  allSegmentsPruned: Segment[]
  allJunctionsPruned: RoomWallJunction[]
  totalSegmentsPruned: number
  totalJunctionsPruned: number
  pruneStats: { removedPathCount: number; removedSegmentCount: number }
}

export interface PipelineV3Layer4Result {
  facesPositioned: RoomWallFaceSkeleton[]
  allSegmentsPositioned: Segment[]
  allJunctionsPositioned: RoomWallJunction[]
  totalSegmentsPositioned: number
  totalJunctionsPositioned: number
  positionStats: { movedSegmentCount: number; movedJunctionCount: number }
  invariantReport: {
    ok: boolean
    errors: string[]
    junctionKindCountsBefore: Record<'I' | 'L' | 'T' | 'X', number>
    junctionKindCountsAfter: Record<'I' | 'L' | 'T' | 'X', number>
  }
}

export interface PipelineV3Layer5Result {
  facesCleaned: RoomWallFaceSkeleton[]
  allSegmentsCleaned: Segment[]
  allJunctionsCleaned: RoomWallJunction[]
  totalSegmentsCleaned: number
  totalJunctionsCleaned: number
  cleanupStats: {
    sameLineMerged: number
    microRemoved: number
    stairCollapsed: number
    loopCollapsed: number
    weldedNear: number
    zeroLengthRemoved: number
    dedupedCount: number
    endpointSealed: number
    iterations: number
  }
}

export interface PipelineV3Layer6Result {
  facesRepaired: RoomWallFaceSkeleton[]
  allSegmentsRepaired: Segment[]
  allJunctionsRepaired: RoomWallJunction[]
  totalSegmentsRepaired: number
  totalJunctionsRepaired: number
  repairStats: {
    connectorsRemoved: number
    connectorCandidates: number
    connectorRepaired: number
    junctionsRepaired: number
    junctionsSkipped: number
    lRepaired: number
    tRepaired: number
    xRepaired: number
    facesRolledBack: number
    facesUnchanged: number
    zeroLengthRemoved: number
    /** Totaal aantal repair-iteraties over alle faces (convergentie-observability). */
    iterationsRun: number
    lastRollBackReason?: string
  }
}

export interface PipelineV3Layer7Result {
  facesAligned: RoomWallFaceSkeleton[]
  allSegmentsAligned: Segment[]
  allJunctionsAligned: RoomWallJunction[]
  totalSegmentsAligned: number
  totalJunctionsAligned: number
  collapseStats: {
    chainsCollapsed: number
    segmentsRemoved: number
    fakeLRemoved: number
    dedupedCount: number
    facesSkippedTopology: number
  }
}

export interface PipelineV3Layer8Result {
  facesFinalized: RoomWallFaceSkeleton[]
  allSegmentsFinalized: Segment[]
  allJunctionsFinalized: RoomWallJunction[]
  totalSegmentsFinalized: number
  totalJunctionsFinalized: number
  finalizeStats: {
    movedSegmentCount: number
    movedJunctionCount: number
    removedPathCount: number
    removedSegmentCount: number
    zeroLengthRemoved: number
    dedupedCount: number
    junctionKindCountsBeforeHv: Record<'I' | 'L' | 'T' | 'X', number>
    junctionKindCountsAfter: Record<'I' | 'L' | 'T' | 'X', number>
  }
}

export interface PipelineV3Layer9Result {
  facesCollapsed: RoomWallFaceSkeleton[]
  allSegmentsCollapsed: Segment[]
  allJunctionsCollapsed: RoomWallJunction[]
  totalSegmentsCollapsed: number
  totalJunctionsCollapsed: number
  collapseStats: {
    chainsCollapsed: number
    segmentsRemoved: number
    fakeLRemoved: number
    stubsCollapsed: number
    stubSegmentsRemoved: number
    parallelCovered: number
    parallelSegmentsRemoved: number
    dedupedCount: number
    facesSkippedTopology: number
    facesSkippedStubTopology: number
    facesSkippedCoverTopology: number
  }
}

export interface PipelineV3Layer10Result {
  facesReady: RoomWallFaceSkeleton[]
  allSegmentsReady: Segment[]
  allJunctionsReady: RoomWallJunction[]
  totalSegmentsReady: number
  totalJunctionsReady: number
  fmlStats: {
    chainsCollapsed: number
    segmentsRemoved: number
    fakeLRemoved: number
    chainsStraightened: number
    axisSegmentsAdjusted: number
    axisEndpointsAdjusted: number
    microCornersAbsorbed: number
    microCornerSegmentsRemoved: number
    dedupedCount: number
    facesSkippedTopology: number
    facesSkippedMicroTopology: number
    obliqueChainsRebuilt: number
    obliqueSegmentsCreated: number
    obliqueSegmentsRemoved: number
    obliqueStubsRemoved: number
    facesSkippedObliqueTopology: number
  }
}

export type PipelineV3LayerDebug = {
  segments: Segment[]
  junctions: RoomWallJunction[]
}

export type PipelineV3LayerDebugView = PipelineV3LayerDebug

/**
 * Partial V3 result: only native layers are present.
 * incompleteLayers lists everything after `completedThroughLayer`.
 * fmlReady is true only when L10 completed natively.
 */
export interface PipelineV3Result {
  pipelineVersion: 'v3'
  completedThroughLayer: number
  incompleteLayers: number[]
  fmlReady: boolean
  layer1: PipelineV3Layer1Result
  layer2: PipelineV3Layer2Result
  layer3?: PipelineV3Layer3Result
  layer4?: PipelineV3Layer4Result
  layer5?: PipelineV3Layer5Result
  layer6?: PipelineV3Layer6Result
  layer7?: PipelineV3Layer7Result
  layer8?: PipelineV3Layer8Result
  layer9?: PipelineV3Layer9Result
  layer10?: PipelineV3Layer10Result
  debug: {
    layer1: PipelineV3LayerDebugView
    layer2: PipelineV3LayerDebugView
    layer3?: PipelineV3LayerDebugView
    layer4?: PipelineV3LayerDebugView
    layer5?: PipelineV3LayerDebugView
    layer6?: PipelineV3LayerDebugView
    layer7?: PipelineV3LayerDebugView
    layer8?: PipelineV3LayerDebugView
    layer9?: PipelineV3LayerDebugView
    layer10?: PipelineV3LayerDebugView
    incompleteLayers: number[]
  }
}

export type { RoomWallFaceSkeleton, RoomWallJunction, Segment }
