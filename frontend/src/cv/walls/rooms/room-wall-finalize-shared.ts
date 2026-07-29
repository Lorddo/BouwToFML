import type { OpenCV } from '@/cv/loadOpenCV'
import type { PreprocessConfig } from '@/core/extraction/types'
import { reportPipelineProgress } from '@/cv/pipeline/pipeline-progress'
import {
  type RoomRasterClass,
  applyFaceClassificationOverrides,
  countClassificationStats,
  mapClassesForWallPipeline,
  pickDoorOverrides,
  pickDoorframeOverrides,
  pickWindowOverrides,
} from './room-ink-classify'
import { buildInkWallMaskMat } from './room-ink-wall-mask'
import { closeWallMaskMat } from './room-wall-merged-mask'
import { splitConnectedWallBlobs, type SplitConnectedWallBlobsResult } from './room-wall-connected-blobs'
import { resolveWallPreprocessThickenPx } from '@/cv/preprocess/layer-preprocess'
import { prepareRoomFinalizeState } from './room-refine-topology'
import type { RoomClassifyResult } from '../strategies/room-first'

export interface RoomFinalizeSharedPrepResult {
  width: number
  height: number
  rawLabelsData: Int32Array
  labelsData: Int32Array
  parentMap: Map<number, number>
  classificationGroupBy: RoomClassifyResult['classificationGroupBy']
  lockedClassification: Map<number, RoomRasterClass>
  lockedStats: ReturnType<typeof countClassificationStats>
  prepared: ReturnType<typeof prepareRoomFinalizeState>
  splitBlobs: SplitConnectedWallBlobsResult
}

export function prepareRoomFinalizeMask(params: {
  cv: OpenCV
  wallMat: OpenCV['Mat']
  classify: RoomClassifyResult
  preprocess?: PreprocessConfig
  wallStyle?: 'solid' | 'open'
  referenceWallThicknessPx?: number
  faceOverrides?: Map<number, RoomRasterClass>
}): RoomFinalizeSharedPrepResult {
  const { cv, classify } = params
  const faceOverrides = params.faceOverrides ?? new Map<number, RoomRasterClass>()
  // Door = UI/Stage-2 tot L11/L12; muur-pipeline ziet ze als unknown (niet in mask).
  // Window / doorframe = UI-class; blijven in L0-mask (isWallMaskClass) en mappen naar wall.
  const doorOverrides = pickDoorOverrides(faceOverrides)
  const windowOverrides = pickWindowOverrides(faceOverrides)
  const doorframeOverrides = pickDoorframeOverrides(faceOverrides)
  const wallPipelineOverrides = mapClassesForWallPipeline(faceOverrides)

  reportPipelineProgress('Vlakken voorbereiden…')
  const rawLabelsData = classify.rawLabelsData
  if (!rawLabelsData) {
    throw new Error(
      'Opgeslagen vlak-topologie ontbreekt — voer eerst opnieuw autoclassificatie uit.',
    )
  }

  const prepared = prepareRoomFinalizeState({
    classify,
    faceOverrides: wallPipelineOverrides,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
  const { width, height, labelsData, parentMap, classificationGroupBy } = {
    width: classify.width,
    height: classify.height,
    labelsData: prepared.labelsData,
    parentMap: prepared.parentMap,
    classificationGroupBy: classify.classificationGroupBy,
  }
  const classificationForMask = prepared.classificationByLabel
  const borderLabels = new Set(
    prepared.components
      .filter((component) => component.touchesBorder)
      .filter((component) => classificationForMask.get(component.label) === 'outside')
      .map((component) => component.label),
  )

  const mergedWallMask = buildInkWallMaskMat({
    cv,
    wallMat: params.wallMat,
    labelsData,
    parentMap,
    classificationByLabel: classificationForMask,
    width,
    height,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    groupBy: classificationGroupBy,
    borderLabels,
  })
  reportPipelineProgress('Muurmasker sluiten…')
  const preprocessThickenPx = params.preprocess
    ? resolveWallPreprocessThickenPx(params.preprocess)
    : 0
  const mergedWallClosedMask = closeWallMaskMat({
    cv,
    mask: mergedWallMask,
    wallStyle: params.wallStyle,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    preprocessThickenPx,
  })
  mergedWallMask.delete()

  reportPipelineProgress('Muurblokken scheiden…')
  const splitBlobs = splitConnectedWallBlobs({
    cv,
    closedMask: mergedWallClosedMask,
    imageWidth: width,
    imageHeight: height,
    keepLargestOnly: true,
    minBlobAreaPx:
      params.referenceWallThicknessPx && params.referenceWallThicknessPx > 0
        ? Math.max(24, Math.round(params.referenceWallThicknessPx ** 2))
        : 0,
  })
  mergedWallClosedMask.delete()

  // Display/stats: door/window/doorframe-class behouden, ondanks pipeline-mapping.
  const lockedClassification = applyFaceClassificationOverrides(
    applyFaceClassificationOverrides(
      applyFaceClassificationOverrides(classificationForMask, doorOverrides),
      windowOverrides,
    ),
    doorframeOverrides,
  )
  const lockedStats = countClassificationStats(lockedClassification)

  return {
    width,
    height,
    rawLabelsData,
    labelsData,
    parentMap,
    classificationGroupBy,
    lockedClassification,
    lockedStats,
    prepared,
    splitBlobs,
  }
}
