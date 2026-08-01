import { tally } from '@/core/diagnostics'
import type { PreprocessConfig } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { WallStrategyResult } from '../strategy-utils'
import { buildFaceLabelsFromBw, type RasterRoomComponent } from '../rooms/room-raster'
import { buildEnclosedFaceParentMap, countDistinctMergedFaces } from '../rooms/room-raster-merge'
import { buildInkEaterLabels, resolveInkBetweenFaces } from '../rooms/room-ink-resolve'
import { demoteExteriorPocketFaces } from '../rooms/room-exterior-pocket'
import { buildRoomReferenceMat, finalizeRoomReferenceMat } from '../rooms/room-reference-preprocess'
import {
  buildEffectiveComponentClassification,
  classifyFacesByInkCoverage,
  countClassificationStats,
  type RoomClassificationGroupBy,
  type RoomRasterClass,
  renderClassifiedFaceMask,
} from '../rooms/room-ink-classify'
import { claimWallishAfterInherit } from '../rooms/face-parent-claim'
import type { CanvasLike } from '@/cv/port/canvasEnv'
import { reportPipelineProgress } from '@/cv/pipeline/pipeline-progress'
import { resolveInkFromRawTopology } from '../rooms/room-refine-topology'
import type { WallPipelineVersion } from '@/platform/wall-pipeline-version'
import { prepareRoomFinalizeMask } from '../rooms/room-wall-finalize-shared'
import { runFinalizePipelineV3 } from '../rooms/pipeline-v3/run-finalize-v3'

export interface InkResolveStats {
  assignedPx: number
  unresolvedPx: number
}

export interface RoomClassifyResult {
  width: number
  height: number
  /** CC-topologie vóór ink-resolve (0 = inkt). */
  rawLabelsData: Int32Array
  labelsData: Int32Array
  parentMap: Map<number, number>
  components: RasterRoomComponent[]
  classificationByLabel: Map<number, RoomRasterClass>
  classificationGroupBy: RoomClassificationGroupBy
  classifiedMaskCanvas: CanvasLike
  roomReferenceCanvas: CanvasLike
  threshold: number
  mergedFaceCount: number
  wallCount: number
  surfaceCount: number
  unknownCount: number
  inkResolveStats?: InkResolveStats
  /** Muur-B/W baseline op review-moment; gebruikt voor diff-gedreven herbereken. */
  baselineWallBwData?: Uint8Array
}

export interface SerializedRoomClassifyState {
  width: number
  height: number
  /** CC-topologie vóór ink-resolve (0 = inkt); verplicht voor finalize/live ink-reresolve. */
  rawLabelsData?: Int32Array
  labelsData: Int32Array
  parentMap: Array<[number, number]>
  classificationByLabel: Array<[number, RoomRasterClass]>
  classificationGroupBy?: RoomClassificationGroupBy
  threshold: number
  mergedFaceCount: number
  inkResolveStats?: InkResolveStats
  /** Baseline muur-B/W van laatste classify/recalculate voor diff-gedreven updates. */
  baselineWallBwData?: Uint8Array
  /** Na refine: overrides + structurele wall-erfenis (voor UI-cache). */
  faceOverrides?: Array<[number, RoomRasterClass]>
  pinnedRoots?: number[]
}

/** Stap F: inkt-classificatie op samengevoegde faces (na micro/small-merge). */
const ROOM_INK_CLASSIFICATION_GROUP_BY: RoomClassificationGroupBy = 'merged'
import { normalizeLabelsArray } from '../rooms/room-labels-array'

/** Review/finalize: per-component klikken en overrides. */
const ROOM_MANUAL_CLASSIFICATION_GROUP_BY: RoomClassificationGroupBy = 'component'

/** Gedeelde autoclass-pipeline op muur-B/W + Otsu-referentie (classify én herbereken). */
function classifyRoomFacesFromBwMat(params: {
  cv: OpenCV
  mat: OpenCV['Mat']
  referenceData: Uint8Array
  referenceWallThicknessPx?: number
  roomInkCoverageThreshold?: number
}): Pick<
  RoomClassifyResult,
  | 'width'
  | 'height'
  | 'rawLabelsData'
  | 'labelsData'
  | 'parentMap'
  | 'components'
  | 'classificationByLabel'
  | 'threshold'
  | 'mergedFaceCount'
  | 'wallCount'
  | 'surfaceCount'
  | 'unknownCount'
  | 'inkResolveStats'
> {
  const { cv, mat, referenceData, referenceWallThicknessPx, roomInkCoverageThreshold } = params
  const width = mat.cols
  const height = mat.rows

  reportPipelineProgress('Vlakken detecteren…')
  const faceLabels = buildFaceLabelsFromBw({ cv, mat })
  const { components, width: faceWidth, height: faceHeight } = faceLabels

  reportPipelineProgress('Inkt tussen vlakken oplossen…')
  const matData = mat.data as Uint8Array
  const rawLabelsData = normalizeLabelsArray(faceLabels.labelsData)
  const inkEaters = buildInkEaterLabels({
    components,
    labelsData: rawLabelsData,
    referenceData: matData,
    inkCoverageThreshold: roomInkCoverageThreshold,
  })
  const bootstrap = resolveInkBetweenFaces({
    labelsData: rawLabelsData,
    components,
    width: faceWidth,
    height: faceHeight,
    labelClass: inkEaters.labelClass,
    referenceWallThicknessPx,
  })
  let labelsData = bootstrap.labelsData
  const labelAtBootstrap = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0
    return labelsData[y * width + x] ?? 0
  }
  let parentMap = buildEnclosedFaceParentMap(components, width, height, {
    labelAt: labelAtBootstrap,
  })
  faceLabels.labels.delete()

  reportPipelineProgress('Inkt-classificatie…')
  const classified = classifyFacesByInkCoverage({
    labelsData,
    referenceData,
    components,
    parentMap,
    threshold: roomInkCoverageThreshold,
    groupBy: ROOM_INK_CLASSIFICATION_GROUP_BY,
  })

  reportPipelineProgress('Buiten-pockets filteren…')
  const pocketDemoted = demoteExteriorPocketFaces({
    components,
    rawLabelsData,
    width: faceWidth,
    height: faceHeight,
    classificationByLabel: classified.classificationByLabel,
    parentMap,
    referenceWallThicknessPx,
  })

  // ESC:W-03 (A)
  reportPipelineProgress('Inkt opnieuw toewijzen (muur-booster)…')
  const effectiveForResolve = buildEffectiveComponentClassification({
    components,
    classificationByLabel: pocketDemoted.classificationByLabel,
    faceOverrides: new Map(),
    priorParentMap: parentMap,
  })
  const finalInk = resolveInkFromRawTopology({
    rawLabelsData,
    components,
    width: faceWidth,
    height: faceHeight,
    classificationByLabel: effectiveForResolve,
    referenceWallThicknessPx,
  })
  tally('W-03', finalInk.inkResolveStats.assignedPx > 0 ? 'booster_assigned' : 'booster_noop')
  labelsData = finalInk.labelsData
  parentMap = finalInk.parentMap

  reportPipelineProgress('Classificatie bijwerken…')
  const classifiedFinal = classifyFacesByInkCoverage({
    labelsData,
    referenceData,
    components,
    parentMap,
    threshold: roomInkCoverageThreshold,
    groupBy: ROOM_INK_CLASSIFICATION_GROUP_BY,
  })

  // Materialiseer wallish-erfenis op children, claim ze los als individuele roots.
  const wallish = claimWallishAfterInherit({
    classificationByLabel: classifiedFinal.classificationByLabel,
    parentMap,
    faceOverrides: new Map(),
  })
  const classificationByLabel = wallish.classificationByLabel
  parentMap = wallish.parentMap
  const mergedFaceCount = countDistinctMergedFaces(components, parentMap)
  const stats = countClassificationStats(classificationByLabel)

  return {
    width,
    height,
    rawLabelsData,
    labelsData,
    parentMap,
    components,
    classificationByLabel,
    threshold: classifiedFinal.threshold,
    mergedFaceCount,
    wallCount: stats.wallCount,
    surfaceCount: stats.surfaceCount,
    unknownCount: stats.unknownCount,
    inkResolveStats: finalInk.inkResolveStats,
  }
}

export function serializeRoomClassifyState(
  result: RoomClassifyResult,
): SerializedRoomClassifyState {
  return {
    width: result.width,
    height: result.height,
    rawLabelsData: result.rawLabelsData,
    labelsData: result.labelsData,
    parentMap: [...result.parentMap.entries()],
    classificationByLabel: [...result.classificationByLabel.entries()],
    classificationGroupBy: result.classificationGroupBy,
    threshold: result.threshold,
    mergedFaceCount: result.mergedFaceCount,
    inkResolveStats: result.inkResolveStats,
    baselineWallBwData: result.baselineWallBwData,
  }
}

export function deserializeRoomClassifyState(
  state: SerializedRoomClassifyState,
): RoomClassifyResult {
  const classificationByLabel = new Map(state.classificationByLabel)
  const classificationGroupBy = state.classificationGroupBy ?? ROOM_MANUAL_CLASSIFICATION_GROUP_BY
  const parentMap = new Map(state.parentMap)
  const labelsData = normalizeLabelsArray(state.labelsData)
  const rawLabelsData = state.rawLabelsData ? normalizeLabelsArray(state.rawLabelsData) : labelsData
  // Deserialize has no separate Otsu reference — both canvases share the classified preview.
  const classifiedPreviewCanvas = renderClassifiedFaceMask({
    width: state.width,
    height: state.height,
    labelsData: state.labelsData,
    parentMap,
    classificationByLabel,
    groupBy: classificationGroupBy,
  })
  const stats = countClassificationStats(classificationByLabel)
  return {
    width: state.width,
    height: state.height,
    rawLabelsData,
    labelsData,
    parentMap,
    components: [],
    classificationByLabel,
    classificationGroupBy,
    classifiedMaskCanvas: classifiedPreviewCanvas,
    roomReferenceCanvas: classifiedPreviewCanvas,
    threshold: state.threshold,
    mergedFaceCount: state.mergedFaceCount,
    inkResolveStats: state.inkResolveStats,
    baselineWallBwData: state.baselineWallBwData
      ? state.baselineWallBwData instanceof Uint8Array
        ? state.baselineWallBwData
        : new Uint8Array(state.baselineWallBwData)
      : undefined,
    wallCount: stats.wallCount,
    surfaceCount: stats.surfaceCount,
    unknownCount: stats.unknownCount,
  }
}

/** Fase 1: topologie + Otsu-referentie + inkt-classificatie. */
export async function runRoomClassifyPhase(params: {
  cv: OpenCV
  image: HTMLCanvasElement | HTMLImageElement | OffscreenCanvas
  mat: OpenCV['Mat']
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  wallStyle?: 'solid' | 'open'
  referenceWallThicknessPx?: number
  roomInkCoverageThreshold?: number
  /** Vooraf gebouwde Otsu-referentie (classify deelt grijswaarden met muur-preprocess). */
  prebuiltReferenceMat?: OpenCV['Mat']
}): Promise<RoomClassifyResult> {
  const { cv, image, mat, preprocess, eraserMask } = params
  const width = mat.cols
  const height = mat.rows

  reportPipelineProgress('Referentiebeeld opbouwen…')
  const reference = params.prebuiltReferenceMat
    ? { mat: params.prebuiltReferenceMat }
    : buildRoomReferenceMat({
        cv,
        image,
        eraserMask,
        preprocess,
        referenceWallThicknessPx: params.referenceWallThicknessPx,
        wallStyle: params.wallStyle,
      })
  const roomReferenceCanvas = finalizeRoomReferenceMat(cv, reference.mat)
  const classifiedReferenceData = reference.mat.data as Uint8Array

  const classified = classifyRoomFacesFromBwMat({
    cv,
    mat,
    referenceData: classifiedReferenceData,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    roomInkCoverageThreshold: params.roomInkCoverageThreshold,
  })

  const classifiedMaskCanvas = renderClassifiedFaceMask({
    width,
    height,
    labelsData: classified.labelsData,
    parentMap: classified.parentMap,
    classificationByLabel: classified.classificationByLabel,
    groupBy: ROOM_INK_CLASSIFICATION_GROUP_BY,
  })

  reference.mat.delete()

  return {
    ...classified,
    classificationGroupBy: ROOM_MANUAL_CLASSIFICATION_GROUP_BY,
    classifiedMaskCanvas,
    roomReferenceCanvas,
    baselineWallBwData: new Uint8Array(mat.data as Uint8Array),
  }
}

/** Fase 2: huidige vlakken → mask → blob split → skeleton (geen re-classify). */
export async function runRoomFinalizePhase(params: {
  cv: OpenCV
  wallMat: OpenCV['Mat']
  classify: RoomClassifyResult
  preprocess?: PreprocessConfig
  wallStyle?: 'solid' | 'open'
  referenceWallThicknessPx?: number
  wallPipelineVersion?: WallPipelineVersion
  faceOverrides?: Map<number, RoomRasterClass>
  pinnedRoots?: Set<number>
}): Promise<WallStrategyResult> {
  const { cv, classify } = params
  const faceOverrides = params.faceOverrides ?? new Map<number, RoomRasterClass>()
  const prep = prepareRoomFinalizeMask({
    cv,
    wallMat: params.wallMat,
    classify,
    preprocess: params.preprocess,
    wallStyle: params.wallStyle,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    faceOverrides,
  })
  const updatedClassifyState = serializeRoomClassifyState({
    ...classify,
    rawLabelsData: prep.rawLabelsData,
    labelsData: prep.labelsData,
    parentMap: prep.parentMap,
    components: prep.prepared.components,
    classificationByLabel: prep.lockedClassification,
    wallCount: prep.lockedStats.wallCount,
    surfaceCount: prep.lockedStats.surfaceCount,
    unknownCount: prep.lockedStats.unknownCount,
    inkResolveStats: prep.prepared.inkResolveStats ?? classify.inkResolveStats,
  })

  const finalizedV3 = await runFinalizePipelineV3({
    cv,
    prep,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
  const lastFaces =
    finalizedV3.layer10?.facesReady ??
    finalizedV3.layer9?.facesCollapsed ??
    finalizedV3.layer8?.facesFinalized ??
    finalizedV3.layer7?.facesAligned ??
    finalizedV3.layer6?.facesRepaired ??
    finalizedV3.layer5?.facesCleaned ??
    finalizedV3.layer4?.facesPositioned ??
    finalizedV3.layer3?.facesPruned ??
    finalizedV3.layer2.facesClean
  const lastSegments =
    finalizedV3.layer10?.allSegmentsReady ??
    finalizedV3.layer9?.allSegmentsCollapsed ??
    finalizedV3.layer8?.allSegmentsFinalized ??
    finalizedV3.layer7?.allSegmentsAligned ??
    finalizedV3.layer6?.allSegmentsRepaired ??
    finalizedV3.layer5?.allSegmentsCleaned ??
    finalizedV3.layer4?.allSegmentsPositioned ??
    finalizedV3.layer3?.allSegmentsPruned ??
    finalizedV3.layer2.allSegmentsClean
  const lastJunctions =
    finalizedV3.layer10?.allJunctionsReady ??
    finalizedV3.layer9?.allJunctionsCollapsed ??
    finalizedV3.layer8?.allJunctionsFinalized ??
    finalizedV3.layer7?.allJunctionsAligned ??
    finalizedV3.layer6?.allJunctionsRepaired ??
    finalizedV3.layer5?.allJunctionsCleaned ??
    finalizedV3.layer4?.allJunctionsPositioned ??
    finalizedV3.layer3?.allJunctionsPruned ??
    finalizedV3.layer2.allJunctionsClean
  const lastSegCount = lastSegments.length
  const lastJuncCount = lastJunctions.length
  return {
    roomWallFaceSkeletons: lastFaces,
    roomWallFaceSkeletonsLayerA: finalizedV3.layer1.facesRaw,
    roomWallFaceSkeletonsFiltered: finalizedV3.layer2.facesClean,
    roomWallFaceSkeletonsLayerC: finalizedV3.layer3?.facesPruned,
    roomWallSkeletonSegments: lastSegments,
    roomWallSkeletonSegmentsRaw: finalizedV3.layer1.allSegmentsRaw,
    roomWallSkeletonSegmentsFiltered: finalizedV3.layer2.allSegmentsClean,
    roomWallJunctions: lastJunctions,
    roomWallJunctionsRaw: finalizedV3.layer1.allJunctionsRaw,
    roomWallJunctionsFiltered: finalizedV3.layer2.allJunctionsClean,
    pipelineV3Debug: finalizedV3.pipelineV3Debug,
    roomWallMaskRle: finalizedV3.roomWallMaskRle,
    roomInkCoverageThreshold: classify.threshold,
    roomClassifyState: updatedClassifyState,
    wallPipelineVersion: 'v3',
    roomStats: {
      graphEdgeCount: lastSegCount,
      faceCount: classify.mergedFaceCount,
      surfaceCount: prep.lockedStats.surfaceCount,
      wallCount: prep.lockedStats.wallCount,
      unknownCount: prep.lockedStats.unknownCount,
      roomWallSkeletonSegmentCount: lastSegCount,
      roomWallSkeletonWasmSegmentCount: finalizedV3.layer1.totalSegmentsRaw,
      roomWallSkeletonLayerAInputCount: finalizedV3.layer1.totalSegmentsRaw,
      roomWallSkeletonRawSegmentCount: finalizedV3.layer1.totalSegmentsRaw,
      roomWallSkeletonFilteredSegmentCount: lastSegCount,
      roomWallJunctionRawCount: finalizedV3.layer1.totalJunctionsRaw,
      roomWallJunctionFilteredCount: lastJuncCount,
      roomWallConnectedBlobCount: finalizedV3.blobCount,
      roomWallSpeckleRemovedCount: finalizedV3.removedBlobCount,
      roomWallDemotedRootCount: 0,
      inkAssignedPx: prep.prepared.inkResolveStats?.assignedPx,
      inkUnresolvedPx: prep.prepared.inkResolveStats?.unresolvedPx,
    },
  }
}

/** Volledige room-first pipeline (backward compat / tests). */
export async function runRoomFirstStrategy(params: {
  cv: OpenCV
  image: HTMLCanvasElement | HTMLImageElement | OffscreenCanvas
  mat: OpenCV['Mat']
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  wallStyle?: 'solid' | 'open'
  referenceWallThicknessPx?: number
  roomInkCoverageThreshold?: number
}): Promise<WallStrategyResult> {
  const classified = await runRoomClassifyPhase(params)
  return runRoomFinalizePhase({
    cv: params.cv,
    wallMat: params.mat,
    classify: classified,
    preprocess: params.preprocess,
    wallStyle: params.wallStyle,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
}
