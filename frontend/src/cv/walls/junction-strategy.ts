import type { PreprocessConfig } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { RoomRasterClass } from './rooms/room-ink-classify'
import {
  runRoomClassifyPhase,
  runRoomFinalizePhase,
  runRoomFirstStrategy,
  deserializeRoomClassifyState,
  serializeRoomClassifyState,
  type SerializedRoomClassifyState,
} from './strategies/room-first'
import { runInkProcessAfterEdits } from './rooms/room-ink-process'
import {
  finalizeRoomReferenceMat,
} from './rooms/room-reference-preprocess'
import type { RoomPipelinePhase, WallStrategyResult } from './strategy-utils'
import type { WallPipelineVersion } from '@/platform/wall-pipeline-version'
import { DEFAULT_WALL_PIPELINE_VERSION } from '@/platform/wall-pipeline-version'

export async function runWallJunctionStrategy(params: {
  cv: OpenCV
  image: HTMLCanvasElement | HTMLImageElement | OffscreenCanvas
  /** Vereist bij classify/recalculate/finalize. */
  mat?: OpenCV['Mat']
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  wallStyle?: 'solid' | 'open'
  referenceWallThicknessPx?: number
  roomInkCoverageThreshold?: number
  roomPipelinePhase?: RoomPipelinePhase
  wallPipelineVersion?: WallPipelineVersion
  roomClassifyState?: SerializedRoomClassifyState
  faceOverrides?: Array<[number, RoomRasterClass]>
  pinnedRoots?: number[]
  prebuiltReferenceMat?: OpenCV['Mat']
}): Promise<WallStrategyResult> {
  const phase = params.roomPipelinePhase ?? 'full'

  if (phase === 'classify') {
    if (!params.mat) {
      throw new Error('mat is vereist voor classify-fase')
    }
    const classified = await runRoomClassifyPhase({
      cv: params.cv,
      mat: params.mat,
      image: params.image,
      preprocess: params.preprocess,
      eraserMask: params.eraserMask,
      wallStyle: params.wallStyle,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
      roomInkCoverageThreshold: params.roomInkCoverageThreshold,
      prebuiltReferenceMat: params.prebuiltReferenceMat,
    })
    return {
      roomInkCoverageThreshold: classified.threshold,
      roomPipelinePhase: 'classify',
      wallPipelineVersion: params.wallPipelineVersion ?? DEFAULT_WALL_PIPELINE_VERSION,
      roomClassifyState: serializeRoomClassifyState(classified),
      roomStats: {
        graphEdgeCount: 0,
        faceCount: classified.mergedFaceCount,
        surfaceCount: classified.surfaceCount,
        wallCount: classified.wallCount,
        unknownCount: classified.unknownCount,
        inkAssignedPx: classified.inkResolveStats?.assignedPx,
        inkUnresolvedPx: classified.inkResolveStats?.unresolvedPx,
      },
    }
  }

  if (phase === 'recalculate') {
    if (!params.mat) {
      throw new Error('mat is vereist voor recalculate-fase')
    }
    if (!params.roomClassifyState) {
      throw new Error('roomClassifyState is vereist voor recalculate-fase')
    }
    if (!params.prebuiltReferenceMat) {
      throw new Error('prebuiltReferenceMat is vereist voor recalculate-fase')
    }
    const classify = deserializeRoomClassifyState(params.roomClassifyState)
    const faceOverrides = new Map(params.faceOverrides ?? [])
    const pinnedRoots = new Set(params.pinnedRoots ?? [])
    const roomReferenceCanvas = finalizeRoomReferenceMat(params.cv, params.prebuiltReferenceMat)
    const referenceData = new Uint8Array(params.prebuiltReferenceMat.data as Uint8Array)
    const recalculated = await runInkProcessAfterEdits({
      cv: params.cv,
      mat: params.mat,
      classify,
      faceOverrides,
      pinnedRoots,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
      referenceData,
      roomReferenceCanvas,
      skipClassifiedMask: true,
    })
    const lockedStats = {
      wallCount: recalculated.wallCount,
      surfaceCount: recalculated.surfaceCount,
      unknownCount: recalculated.unknownCount,
    }
    return {
      roomInkCoverageThreshold: recalculated.threshold,
      roomPipelinePhase: 'recalculate',
      wallPipelineVersion: params.wallPipelineVersion ?? DEFAULT_WALL_PIPELINE_VERSION,
      roomClassifyState: {
        ...serializeRoomClassifyState(recalculated),
        faceOverrides: [...recalculated.refinedFaceOverrides.entries()],
        pinnedRoots: [...recalculated.refinedPinnedRoots],
      },
      roomStats: {
        graphEdgeCount: 0,
        faceCount: recalculated.mergedFaceCount,
        surfaceCount: lockedStats.surfaceCount,
        wallCount: lockedStats.wallCount,
        unknownCount: lockedStats.unknownCount,
        inkAssignedPx: recalculated.inkResolveStats?.assignedPx,
        inkUnresolvedPx: recalculated.inkResolveStats?.unresolvedPx,
      },
    }
  }

  if (phase === 'finalize') {
    if (!params.mat) {
      throw new Error('mat is vereist voor finalize-fase')
    }
    if (!params.roomClassifyState) {
      throw new Error('roomClassifyState is vereist voor finalize-fase')
    }
    const classify = deserializeRoomClassifyState(params.roomClassifyState)
    const result = await runRoomFinalizePhase({
      cv: params.cv,
      wallMat: params.mat,
      classify,
      preprocess: params.preprocess,
      wallStyle: params.wallStyle,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
      wallPipelineVersion: params.wallPipelineVersion ?? DEFAULT_WALL_PIPELINE_VERSION,
      faceOverrides: new Map(params.faceOverrides ?? []),
      pinnedRoots: new Set(params.pinnedRoots ?? []),
    })
    return { ...result, roomPipelinePhase: 'finalize' }
  }

  if (!params.mat) {
    throw new Error('mat is vereist voor full pipeline-fase')
  }
  const result = await runRoomFirstStrategy({
    cv: params.cv,
    mat: params.mat,
    image: params.image,
    preprocess: params.preprocess,
    eraserMask: params.eraserMask,
    wallStyle: params.wallStyle,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    roomInkCoverageThreshold: params.roomInkCoverageThreshold,
  })
  return { ...result, roomPipelinePhase: 'full', wallPipelineVersion: params.wallPipelineVersion ?? DEFAULT_WALL_PIPELINE_VERSION }
}
