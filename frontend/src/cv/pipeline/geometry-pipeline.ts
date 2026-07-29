import type { ExampleSample, ExtractionOutput, PreprocessConfig } from '@/core/extraction'
import type { OpenCV } from '@/cv/loadOpenCV'
import { runPreprocessLayer, runPreprocessLayerFromGrayscale, buildGrayscalePreMat } from '@/cv/layers/preprocess-layer'
import { composeLayers } from './compose-layers'
import { getOpenCvCapabilities } from '@/cv/port/opencvCapabilities'
import { resolveLayerPreprocess } from '@/cv/preprocess/layer-preprocess'
import { measureInkBandInBox } from '@/cv/port/wallKernel'
import { runWallJunctionStrategy } from '@/cv/walls/junction-strategy'
import { asSegmentCandidates } from '@/cv/walls/strategy-utils'
import { reportPipelineProgress } from './pipeline-progress'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import { buildRoomReferenceMat } from '@/cv/walls/rooms/room-reference-preprocess'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { WallPipelineVersion } from '@/platform/wall-pipeline-version'
import type { WallStrategyResult } from '@/cv/walls/strategy-utils'

export interface GeometryPipelineConfig {
  detectWalls?: boolean
  wallStyle?: 'solid' | 'open'
  referenceWallThicknessPx?: number
  referenceWallMeasureRect?: { x: number; y: number; width: number; height: number }
  roomInkCoverageThreshold?: number
  roomPipelinePhase?: 'classify' | 'recalculate' | 'finalize' | 'full'
  wallPipelineVersion?: WallPipelineVersion
  roomClassifyState?: SerializedRoomClassifyState
  faceOverrides?: Array<[number, RoomRasterClass]>
  pinnedRoots?: number[]
}

export async function runGeometryPipeline(params: {
  cv: OpenCV
  image: HTMLCanvasElement | HTMLImageElement | OffscreenCanvas
  examples: ExampleSample[]
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  /** Al gecomposeerde muur-B/W (base ⊕ OCR ⊕ ink) — skip wall-rethreshold. */
  precomposedWallBw?: Uint8Array
  workScale?: number
  originalWidth?: number
  originalHeight?: number
  config?: GeometryPipelineConfig
}): Promise<ExtractionOutput> {
  const started = performance.now()
  const capabilities = getOpenCvCapabilities(params.cv)
  const detectWalls = params.config?.detectWalls ?? true
  const phase = params.config?.roomPipelinePhase ?? 'full'
  const isFinalize = phase === 'finalize'
  const isRecalculate = phase === 'recalculate'
  const classifyState = params.config?.roomClassifyState
  const needsWallMat =
    phase === 'classify' || phase === 'full' || phase === 'finalize' || phase === 'recalculate'

  let wallPreMat: OpenCV['Mat'] | null = null
  let prebuiltReferenceMat: OpenCV['Mat'] | undefined

  if (needsWallMat) {
    reportPipelineProgress('B/W voorbewerking…')
    const wallPreprocess = resolveLayerPreprocess(params.preprocess, 'walls')
    const layerCtx = {
      cv: params.cv,
      image: params.image,
      examples: [],
      eraserMask: params.eraserMask,
      preprocess: wallPreprocess,
    }

    const imageWidth =
      params.image instanceof HTMLCanvasElement || params.image instanceof OffscreenCanvas
        ? params.image.width
        : (params.image as HTMLImageElement).naturalWidth
    const imageHeight =
      params.image instanceof HTMLCanvasElement || params.image instanceof OffscreenCanvas
        ? params.image.height
        : (params.image as HTMLImageElement).naturalHeight
    const precomposed = params.precomposedWallBw
    const canUsePrecomposed =
      precomposed != null &&
      precomposed.length === imageWidth * imageHeight &&
      imageWidth > 0 &&
      imageHeight > 0

    if (canUsePrecomposed && precomposed) {
      wallPreMat = new params.cv.Mat(imageHeight, imageWidth, params.cv.CV_8UC1)
      wallPreMat.data.set(precomposed)
      if (phase === 'classify' || phase === 'recalculate') {
        const referenceResult = buildRoomReferenceMat({
          cv: params.cv,
          image: params.image,
          eraserMask: params.eraserMask,
          preprocess: params.preprocess,
          referenceWallThicknessPx: params.config?.referenceWallThicknessPx,
          wallStyle: params.config?.wallStyle,
        })
        prebuiltReferenceMat = referenceResult.mat
      }
    } else if (phase === 'classify' || phase === 'recalculate') {
      const sharedGray = buildGrayscalePreMat(layerCtx)
      try {
        const wallPreResult = runPreprocessLayerFromGrayscale(layerCtx, sharedGray)
        wallPreMat = wallPreResult.mat
        const referenceResult = buildRoomReferenceMat({
          cv: params.cv,
          image: params.image,
          eraserMask: params.eraserMask,
          preprocess: params.preprocess,
          referenceWallThicknessPx: params.config?.referenceWallThicknessPx,
          wallStyle: params.config?.wallStyle,
          sharedGrayscale: sharedGray,
        })
        prebuiltReferenceMat = referenceResult.mat
      } finally {
        sharedGray.delete()
      }
    } else {
      const wallPreResult = runPreprocessLayer(layerCtx)
      wallPreMat = wallPreResult.mat
    }

    reportPipelineProgress(
      phase === 'classify'
        ? 'Ruimte-classificatie…'
        : phase === 'recalculate'
          ? 'Vlakken herberekenen…'
          : 'Muur-detectie…',
    )
  }

  let referenceWallThicknessPx = params.config?.referenceWallThicknessPx
  if (
    wallPreMat &&
    (!referenceWallThicknessPx || referenceWallThicknessPx <= 0) &&
    params.config?.referenceWallMeasureRect
  ) {
    const rect = params.config.referenceWallMeasureRect
    const orientation = rect.width >= rect.height ? 'horizontal' : 'vertical'
    const measure = measureInkBandInBox(wallPreMat, rect, orientation)
    if (measure) {
      referenceWallThicknessPx = Math.max(1, Math.round(measure.thicknessPx))
    }
  }

  const wallLayer: WallStrategyResult = detectWalls
    ? await runWallJunctionStrategy({
        cv: params.cv,
        image: params.image,
        mat: wallPreMat ?? undefined,
        preprocess: params.preprocess,
        eraserMask: params.eraserMask,
        wallStyle: params.config?.wallStyle,
        referenceWallThicknessPx,
        roomInkCoverageThreshold: params.config?.roomInkCoverageThreshold,
        roomPipelinePhase: phase,
        wallPipelineVersion: params.config?.wallPipelineVersion,
        roomClassifyState: classifyState,
        faceOverrides: params.config?.faceOverrides,
        pinnedRoots: params.config?.pinnedRoots,
        prebuiltReferenceMat,
      })
    : {}

  if (isFinalize || isRecalculate) {
    reportPipelineProgress('Resultaat samenstellen…')
  }

  // Compose = meta-shell zonder wall-segments; semantic komt post-finalize (L10/fmlReady).
  const output = composeLayers({
    extractorId: 'geometry-lbe',
    elapsedMs: performance.now() - started,
    workScale: params.workScale,
  })

  wallPreMat?.delete()

  return {
    ...output,
    debugSkeleton: wallLayer.roomWallSkeletonSegmentsRaw
      ? asSegmentCandidates(wallLayer.roomWallSkeletonSegmentsRaw, 0.7)
      : output.debugSkeleton,
    pipelineV3Debug: wallLayer.pipelineV3Debug,
    roomWallMaskRle: wallLayer.roomWallMaskRle,
    meta: {
      extractorId: 'geometry-lbe',
      elapsedMs: output.meta?.elapsedMs ?? performance.now() - started,
      workScale: output.meta?.workScale,
      lsdAvailable: capabilities.lsd,
      ocrWordCount: 0,
      wallJunctionStrategy: 'room_first',
      roomGraphEdgeCount: wallLayer.roomStats?.graphEdgeCount,
      roomFaceCount: wallLayer.roomStats?.faceCount,
      roomSurfaceCount: wallLayer.roomStats?.surfaceCount,
      roomWallCount: wallLayer.roomStats?.wallCount,
      roomUnknownCount: wallLayer.roomStats?.unknownCount,
      roomInkCoverageThreshold: wallLayer.roomInkCoverageThreshold,
      wallStyle: params.config?.wallStyle,
      referenceWallThicknessPx,
      roomPipelinePhase: wallLayer.roomPipelinePhase,
      wallPipelineVersion: wallLayer.wallPipelineVersion,
      roomClassifyState: wallLayer.roomClassifyState,
      roomWallSkeletonSegmentCount: wallLayer.roomStats?.roomWallSkeletonFilteredSegmentCount,
      roomWallSkeletonWasmSegmentCount: wallLayer.roomStats?.roomWallSkeletonWasmSegmentCount,
      roomWallSkeletonLayerAInputCount: wallLayer.roomStats?.roomWallSkeletonLayerAInputCount,
      roomWallSkeletonPolishedUnfilteredCount:
        wallLayer.roomStats?.roomWallSkeletonPolishedUnfilteredCount,
      roomWallSkeletonRawSegmentCount: wallLayer.roomStats?.roomWallSkeletonLayerAInputCount,
      roomWallSkeletonFilteredSegmentCount: wallLayer.roomStats?.roomWallSkeletonFilteredSegmentCount,
      roomWallSkeletonLayerCSegmentCount: wallLayer.roomStats?.roomWallSkeletonLayerCSegmentCount,
      roomWallJunctionCount: wallLayer.roomStats?.roomWallJunctionFilteredCount,
      roomWallJunctionRawCount: wallLayer.roomStats?.roomWallJunctionRawCount,
      roomWallJunctionFilteredCount: wallLayer.roomStats?.roomWallJunctionFilteredCount,
      roomWallEndpointCount: wallLayer.roomStats?.roomWallEndpointCount,
      roomWallConnectedBlobCount: wallLayer.roomStats?.roomWallConnectedBlobCount,
      roomWallSpeckleRemovedCount: wallLayer.roomStats?.roomWallSpeckleRemovedCount,
      roomWallDemotedRootCount: wallLayer.roomStats?.roomWallDemotedRootCount,
    },
  }
}
