import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { PreprocessConfig } from '@/platform/image'
import type { WallPipelineVersion } from '@/platform/wall-pipeline-version'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { TemplateTab, PreprocessPanelLayer } from '@/cv/preprocess/layer-preprocess'
import {
  visiblePreprocessLayerTabs,
  visibleResultLayerTabs,
  visibleTemplateLayerTabs,
  type WorkspaceFlowStep,
} from './constants'
import type { useWorkspaceInputMask } from '../useWorkspaceInputMask'
import type { useWorkspaceInkEdit } from '../useWorkspaceInkEdit'
import type { useWorkspaceSignaturePreview } from '../useWorkspaceSignaturePreview'
import type { useWorkspaceOverlays } from '../useWorkspaceOverlays'
import type { useWorkspaceDebugProbe } from './useWorkspaceDebugProbe'
import type { useWorkspaceExports } from '../useWorkspaceExports'
import type { useWorkspaceFml } from '../useWorkspaceFml'
import type { useWorkspacePipeline } from './useWorkspacePipeline'
import type { useWorkspaceScale } from './useWorkspaceScale'
import type { useWorkspaceFlow } from './useWorkspaceFlow'
import type { useWorkspacePdfUpload } from './useWorkspacePdfUpload'
import type { useWorkspaceDevSession } from './useWorkspaceDevSession'
import type { useWorkspaceDetection } from './useWorkspaceDetection'
import type { useWorkspaceRoomFaces } from './useWorkspaceRoomFaces'
import type { useWorkspaceOcr } from './useWorkspaceOcr'
import type { useWorkspacePreprocess } from './useWorkspacePreprocess'
import type { useWorkspaceImage } from './useWorkspaceImage'
import type { usePreprocessPreview } from '../usePreprocessPreview'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { useOpenCvLoader } from '../useOpenCvLoader'
import type { useWorkspaceToolbelt } from './useWorkspaceToolbelt'
import type { useWorkspaceLayerToggles } from './useWorkspaceLayerToggles'
import type { ElementClass, SelectionRect } from '@/platform/selection/types'
import type { DoorSwingStage } from '@/cv/doors'
import type { WindowAxelStage } from '@/cv/windows'

export type WorkspaceFacadeContext = {
  canvasRef: Ref<unknown>
  imageSrc: Ref<string | null>
  imageName: Ref<string | null>
  profileConfirmed: Ref<boolean>
  activeDrawingProfile: ComputedRef<
    ReturnType<typeof import('@/platform/profile').getDrawingProfile>
  >
  referenceWallThicknessPx: Ref<number | null>
  wallRefThicknessMeasures?: Ref<
    import('@/platform/selection/wall-thickness-ref').WallRefThicknessMeasure[]
  >
  wallPipelineVersion: Ref<WallPipelineVersion>
  preprocess: Ref<PreprocessConfig>
  preprocessTab: Ref<PreprocessPanelLayer>
  templateTab: Ref<TemplateTab>
  resultTab: Ref<import('@/cv/pipeline/merge-tab-outputs').ResultViewTab>
  tabOutputs: Ref<TabDetectionOutputs>
  flowStep: Ref<WorkspaceFlowStep>
  layerToggles: ReturnType<typeof useWorkspaceLayerToggles>
  preprocessPreview: ReturnType<typeof usePreprocessPreview>
  preprocessVectorCache: Ref<unknown>
  preprocessVectorCacheLoading: Ref<boolean>
  scale: ReturnType<typeof useHScaleCalibration>
  cvLoader: ReturnType<typeof useOpenCvLoader>
  error: ComputedRef<string | null>
  rects: Ref<SelectionRect[]>
  selectedRectId: Ref<string | null>
  activeClass: Ref<ElementClass | null>
  previewRect: Ref<SelectionRect | null>
  typeColors: Record<ElementClass, string>
  counts: ComputedRef<Record<ElementClass, number>>
  startDraw: (x: number, y: number) => void
  updateDraw: (x: number, y: number) => void
  cancelDraw: () => void
  selectRect: (id: string | null) => void
  inputMask: ReturnType<typeof useWorkspaceInputMask>
  inkEdit: ReturnType<typeof useWorkspaceInkEdit>
  image: ReturnType<typeof useWorkspaceImage>
  inputRotationPreviewDeg: ComputedRef<number>
  originalImageEl: Ref<HTMLImageElement | null>
  signature: ReturnType<typeof useWorkspaceSignaturePreview>
  overlays: ReturnType<typeof useWorkspaceOverlays>
  debugProbe: ReturnType<typeof useWorkspaceDebugProbe>
  exports: ReturnType<typeof useWorkspaceExports>
  e2eFixture: ReturnType<
    typeof import('./useWorkspaceE2eFixtureExport').useWorkspaceE2eFixtureExport
  >
  fmlUnderlayOpacity: Ref<number>
  fmlContentOpacity: Ref<number>
  fmlHidePlanText: Ref<boolean>
  fmlUnderlaySrc: ComputedRef<string | null>
  fmlUnderlaySize: ComputedRef<{ width: number; height: number } | null>
  fml: ReturnType<typeof useWorkspaceFml>
  pipeline: ReturnType<typeof useWorkspacePipeline>
  scaleUi: ReturnType<typeof useWorkspaceScale>
  preprocessUi: ReturnType<typeof useWorkspacePreprocess>
  detection: ReturnType<typeof useWorkspaceDetection>
  roomFaces: ReturnType<typeof useWorkspaceRoomFaces>
  gapsFaces?: ReturnType<typeof import('./useWorkspaceGapsFaces').useWorkspaceGapsFaces>
  doorSwingFaces?: ReturnType<
    typeof import('./useWorkspaceDoorSwingFaces').useWorkspaceDoorSwingFaces
  >
  windowFaces?: ReturnType<typeof import('./useWorkspaceWindowFaces').useWorkspaceWindowFaces>
  toolbelt: ReturnType<typeof useWorkspaceToolbelt>
  recalculateFaces: () => Promise<boolean>
  bakeOcrIntoInk: () => Promise<boolean>
  clearOcrWithFaceRefresh: () => Promise<void>
  ocr: ReturnType<typeof useWorkspaceOcr>
  flow: ReturnType<typeof useWorkspaceFlow>
  resetWorkspace: () => void
  pdfUpload: ReturnType<typeof useWorkspacePdfUpload>
  devSession: ReturnType<typeof useWorkspaceDevSession>
  gapsInkMode: Ref<import('@/cv/gaps').GapsInkMode>
  gapsInkModeManual: Ref<boolean>
  setGapsInkModeManual: (mode: import('@/cv/gaps').GapsInkMode) => void
}

/** Core shell + tabs + selection (stap-agnostisch). */
function sliceCore(ctx: WorkspaceFacadeContext) {
  return {
    canvasRef: ctx.canvasRef,
    imageSrc: ctx.imageSrc,
    imageName: ctx.imageName,
    profileConfirmed: ctx.profileConfirmed,
    activeDrawingProfile: ctx.activeDrawingProfile,
    referenceWallThicknessPx: ctx.referenceWallThicknessPx,
    wallRefThicknessMeasures: ctx.wallRefThicknessMeasures ?? ref([]),
    wallPipelineVersion: ctx.wallPipelineVersion,
    preprocess: ctx.preprocess,
    preprocessTab: ctx.preprocessTab,
    templateTab: ctx.templateTab,
    resultTab: ctx.resultTab,
    tabOutputs: ctx.tabOutputs,
    flowStep: ctx.flowStep,
    preprocessLayerTabs: computed(() => visiblePreprocessLayerTabs()),
    templateLayerTabs: computed(() =>
      visibleTemplateLayerTabs(ctx.preprocess.value.ocrEnabled ?? false),
    ),
    resultLayerTabs: computed(() => visibleResultLayerTabs()),
  }
}

function sliceLayerToggles(ctx: WorkspaceFacadeContext) {
  const t = ctx.layerToggles
  return {
    showWallLines: t.showWallLines,
    showTemplates: t.showTemplates,
    showLines: t.showLines,
    showSkeleton: t.showSkeleton,
    showSkeletonLayerB: t.showSkeletonLayerB,
    showSemanticLayerC: t.showSemanticLayerC,
    showLayer4: t.showLayer4,
    showLayer5: t.showLayer5,
    showLayer6: t.showLayer6,
    showLayer7: t.showLayer7,
    showLayer8: t.showLayer8,
    showLayer9: t.showLayer9,
    showLayer10: t.showLayer10,
    showLayer11: t.showLayer11,
    showLayer12: t.showLayer12,
    showLayer14: t.showLayer14,
    showOcrText: t.showOcrText,
  }
}

/** Preprocess preview + calibration shell (vóór input-mask in flat merge). */
function slicePreprocessShell(ctx: WorkspaceFacadeContext) {
  return {
    preprocessPreview: ctx.preprocessPreview,
    preprocessVectorCache: ctx.preprocessVectorCache,
    scale: ctx.scale,
    cvLoader: ctx.cvLoader,
    error: ctx.error,
    rects: ctx.rects,
    selectedRectId: ctx.selectedRectId,
    activeClass: ctx.activeClass,
    previewRect: ctx.previewRect,
    typeColors: ctx.typeColors,
    counts: ctx.counts,
    startDraw: ctx.startDraw,
    updateDraw: ctx.updateDraw,
    cancelDraw: ctx.cancelDraw,
    selectRect: ctx.selectRect,
  }
}

function sliceDetectionStatus(ctx: WorkspaceFacadeContext) {
  return {
    running: ctx.detection.running,
    status: ctx.detection.status,
    lastOutput: ctx.detection.lastOutput,
  }
}

function sliceInput(ctx: WorkspaceFacadeContext) {
  return {
    ...ctx.inputMask,
    ...ctx.inkEdit,
    displayImageSrc: ctx.image.displayImageSrc,
    inputRotationPreviewDeg: ctx.inputRotationPreviewDeg,
    originalImageEl: ctx.originalImageEl,
    onImageLoaded: ctx.image.onImageLoaded,
    bakeInputRotation: ctx.image.bakeInputRotation,
    canBakeInputRotation: ctx.image.canBakeInputRotation,
    inputCommitBusy: ctx.image.inputCommitBusy,
    ...ctx.signature,
  }
}

function sliceOverlays(ctx: WorkspaceFacadeContext) {
  return {
    ...ctx.overlays,
    ...ctx.debugProbe,
  }
}

function sliceExports(ctx: WorkspaceFacadeContext) {
  return { ...ctx.exports, ...ctx.e2eFixture }
}

function sliceFml(ctx: WorkspaceFacadeContext) {
  return {
    fmlUnderlayOpacity: ctx.fmlUnderlayOpacity,
    fmlContentOpacity: ctx.fmlContentOpacity,
    fmlHidePlanText: ctx.fmlHidePlanText,
    fmlUnderlaySrc: ctx.fmlUnderlaySrc,
    fmlUnderlaySize: ctx.fmlUnderlaySize,
    ...ctx.fml,
  }
}

function slicePipelineScale(ctx: WorkspaceFacadeContext) {
  return {
    ...ctx.pipeline,
    ...ctx.scaleUi,
    onLayerTuneCopied: ctx.preprocessUi.onLayerTuneCopied,
    preprocessVectorCacheLoading: ctx.preprocessVectorCacheLoading,
  }
}

function sliceDetectionUi(ctx: WorkspaceFacadeContext) {
  // ESC:O-40 (D)
  const fallbackDoorSwingStage = ref<DoorSwingStage>('stage2')
  const fallbackWindowAxelStage = ref<WindowAxelStage>('stage2')
  return {
    onProfileSelected: ctx.detection.onProfileSelected,
    setTemplatePanMode: ctx.detection.setTemplatePanMode,
    setTemplateDrawMode: ctx.detection.setTemplateDrawMode,
    setReferencePanMode: ctx.detection.setReferencePanMode,
    setReferenceDrawMode: ctx.detection.setReferenceDrawMode,
    onDoorFmlRefIdChange: ctx.detection.onDoorFmlRefIdChange,
    onWallThicknessBandChange: ctx.detection.onWallThicknessBandChange,
    onWallThicknessCmChange: ctx.detection.onWallThicknessCmChange,
    clearTemplateTypeRects: ctx.detection.clearTemplateTypeRects,
    measuringReferenceWall: ctx.detection.measuringReferenceWall,
    onRectUpdate: ctx.detection.onRectUpdate,
    onRectDelete: ctx.detection.onRectDelete,
    onLbeEndDraw: ctx.detection.onLbeEndDraw,
    onDetectTemplateTab: ctx.detection.onDetectTemplateTab,
    roomPhase: ctx.roomFaces.roomPhase,
    finalizePhase: ctx.roomFaces.finalizePhase,
    roomClassificationStats: ctx.roomFaces.roomClassificationStats,
    hasReferenceWallRect: ctx.roomFaces.hasReferenceWallRect,
    classifyingInFlight: ctx.roomFaces.classifyingInFlight,
    autoclassifyWalls: () => ctx.roomFaces.requestAutoclassifyWalls(),
    finalizeWallDetection: ctx.roomFaces.finalizeWallDetection,
    onFaceClick: ctx.roomFaces.toggleFaceAt,
    onFaceBoxSelect: ctx.roomFaces.classifyFacesInBox,
    activeFaceBoxTool: ctx.roomFaces.activeFaceBoxTool,
    faceToolbeltVisible: ctx.roomFaces.faceToolbeltVisible,
    gapsDemoteStats: ctx.gapsFaces?.gapsDemoteStats ?? null,
    doorSwingStats: ctx.doorSwingFaces?.doorSwingStats ?? null,
    doorSwingStage: ctx.doorSwingFaces?.doorSwingStage ?? fallbackDoorSwingStage,
    resolvedDoors: ctx.doorSwingFaces?.resolvedDoors ?? [],
    boundDoors: ctx.doorSwingFaces?.boundDoors ?? [],
    orientedDoors: ctx.doorSwingFaces?.orientedDoors ?? [],
    wallsClassifyReadyForDoors: ctx.doorSwingFaces?.wallsClassifyReady ?? null,
    doorInitialPassReady: computed(() => ctx.doorSwingFaces?.initialPassReady.value ?? true),
    windowFaceStats: ctx.windowFaces?.windowFaceStats ?? null,
    windowAxelStage: ctx.windowFaces?.windowAxelStage ?? fallbackWindowAxelStage,
    resolvedWindows: ctx.windowFaces?.resolvedWindows ?? [],
    boundWindows: ctx.windowFaces?.boundWindows ?? [],
    windowBindRejections: ctx.windowFaces?.windowBindRejections ?? [],
    stage1WindowRejections: ctx.windowFaces?.stage1Rejections ?? [],
    stage1WindowCandidateEvals: ctx.windowFaces?.stage1CandidateEvals ?? [],
    wallsClassifyReadyForWindows: ctx.windowFaces?.wallsClassifyReady ?? null,
    windowInitialPassReady: computed(() => ctx.windowFaces?.initialPassReady.value ?? true),
    gapsInkMode: ctx.gapsInkMode,
    gapsInkModeManual: ctx.gapsInkModeManual,
    setGapsInkModeManual: ctx.setGapsInkModeManual,
    toolbeltCanvasHint: ctx.toolbelt.toolbeltCanvasHint,
    toolbeltCanvasHintStale: ctx.toolbelt.toolbeltCanvasHintStale,
    canvasFaceTool: ctx.toolbelt.canvasFaceTool,
    recalculateFaces: ctx.recalculateFaces,
  }
}

function sliceOcr(ctx: WorkspaceFacadeContext) {
  return {
    ocrScanning: ctx.ocr.ocrScanning,
    ocrCandidateCount: computed(() => ctx.ocr.ocrCandidates.value.length),
    ocrMaskedRegionCount: computed(() => ctx.inputMask.ocrMaskedRegions.value.length),
    ocrHitList: ctx.ocr.ocrHitList,
    runOcrScan: ctx.ocr.runOcrScan,
    clearOcrCandidates: ctx.clearOcrWithFaceRefresh,
    bakeOcrIntoInk: ctx.bakeOcrIntoInk,
    removeOcrHit: ctx.ocr.removeOcrHit,
  }
}

function sliceFlowDev(ctx: WorkspaceFacadeContext) {
  return {
    ...ctx.flow,
    resetWorkspace: ctx.resetWorkspace,
    ...ctx.pdfUpload,
    ...ctx.devSession,
  }
}

/**
 * Flat consumer API for WorkspaceView (proxyRefs).
 * Construction is sliced per concern; public keys + merge precedence stay identical.
 */
export function assembleWorkspaceFacadeReturn(ctx: WorkspaceFacadeContext) {
  return {
    ...sliceCore(ctx),
    ...sliceLayerToggles(ctx),
    ...slicePreprocessShell(ctx),
    ...sliceDetectionStatus(ctx),
    ...sliceInput(ctx),
    ...sliceOverlays(ctx),
    ...sliceExports(ctx),
    ...sliceFml(ctx),
    ...slicePipelineScale(ctx),
    ...sliceDetectionUi(ctx),
    ...sliceOcr(ctx),
    ...sliceFlowDev(ctx),
  }
}
