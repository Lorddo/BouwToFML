import { ref, computed } from 'vue'
import { tally } from '@/core/diagnostics'
import { useImageUpload } from '@/platform/upload'
import { useExampleSelection } from '@/platform/selection'
import { DEFAULT_PREPROCESS } from '@/platform/image'
import {
  detectionPresetForProfile,
  getDrawingProfile,
  loadStoredProfileId,
  type DrawingProfileId,
} from '@/platform/profile'
import { useExtraction } from './useExtraction'
import { useOpenCvLoader } from './useOpenCvLoader'
import { usePreprocessPreview } from './usePreprocessPreview'
import { useHScaleCalibration } from '@/platform/calibration'
import { useWorkspaceSignaturePreview } from './useWorkspaceSignaturePreview'
import { useWorkspaceOverlays } from './useWorkspaceOverlays'
import { useWorkspaceExports } from './useWorkspaceExports'
import { useWorkspaceE2eFixtureExport } from './workspace/useWorkspaceE2eFixtureExport'
import { useWorkspaceFml } from './useWorkspaceFml'
import { useWorkspacePipeline } from './workspace/useWorkspacePipeline'
import { useWorkspaceScale } from './workspace/useWorkspaceScale'
import { useWorkspaceRoomPipeline } from './workspace/useWorkspaceRoomPipeline'
import { useWorkspaceFlow } from './workspace/useWorkspaceFlow'
import { useWorkspaceOcr } from './workspace/useWorkspaceOcr'
import { useWorkspaceDevSession } from './workspace/useWorkspaceDevSession'
import { useWorkspaceWallPipeline } from './workspace/useWorkspaceWallPipeline'
import type { WorkspaceFlowStep } from './workspace/constants'
import { useWorkspaceDebugProbeFromContext } from './workspace/useWorkspaceDebugProbe'
import { useWorkspacePdfUpload } from './workspace/useWorkspacePdfUpload'
import { useWorkspaceLifecycle } from './workspace/useWorkspaceLifecycle'
import { useWorkspaceLayerToggles } from './workspace/useWorkspaceLayerToggles'
import { useWorkspaceToolbelt } from './workspace/useWorkspaceToolbelt'
import { buildWorkspaceDevSessionDeps } from './workspace/buildWorkspaceDevSessionDeps'
import { buildWorkspaceRoomPipelineDeps } from './workspace/buildWorkspaceRoomPipelineDeps'
import { useWorkspacePreprocessWiring } from './workspace/useWorkspacePreprocessWiring'
import { useWorkspaceGapsFaces } from './workspace/useWorkspaceGapsFaces'
import { useWorkspaceDoorSwingFaces } from './workspace/useWorkspaceDoorSwingFaces'
import { useWorkspaceWindowFaces } from './workspace/useWorkspaceWindowFaces'
import { assembleWorkspaceFacadeReturn } from './workspace/assembleWorkspaceFacadeReturn'
import { useGapsInkModePersistence } from './workspace/useGapsInkModePersistence'
import { totalInputRotationDeg } from '@/platform/canvas/rotationPreview'
import {
  emptyTabOutputs,
  type ResultViewTab,
  type TabDetectionOutputs,
} from '@/cv/pipeline/merge-tab-outputs'
import {
  normalizeStoredPreprocess,
  type PreprocessPanelLayer,
  type TemplateTab,
} from '@/cv/preprocess/layer-preprocess'

export function useWorkspace() {
  const canvasRef = ref<unknown>(null)
  const { imageSrc, imageName, loadFile, setImageSource } = useImageUpload()

  const drawingProfileId = ref<DrawingProfileId>(loadStoredProfileId())
  const profileConfirmed = ref(true)
  const showOcrDetails = ref(false)
  const {
    gapsInkMode,
    gapsInkModeManual,
    setGapsInkModeManual,
    clearGapsInkModeManual,
    applyAutoGapsInkMode,
  } = useGapsInkModePersistence()

  const activeDetectionPreset = computed(() => detectionPresetForProfile(drawingProfileId.value))
  const activeDrawingProfile = computed(() => getDrawingProfile(drawingProfileId.value))
  const inputRotationPreviewDeg = computed(() =>
    flowStep.value === 'input' ? totalInputRotationDeg(preprocess.value) : 0,
  )
  const signatureExtractOptions = computed(() => {
    if (!profileConfirmed.value) return undefined
    return {
      expectedWallStyles: activeDetectionPreset.value.expectedWallStyles,
    }
  })

  const preprocess = ref(normalizeStoredPreprocess({ ...DEFAULT_PREPROCESS }))
  const preprocessTab = ref<PreprocessPanelLayer>('walls')
  const inputTab = ref<'origineel'>('origineel')
  const templateTab = ref<TemplateTab>('ocr')
  const resultTab = ref<ResultViewTab>('walls')
  const tabOutputs = ref<TabDetectionOutputs>(emptyTabOutputs())
  const flowStep = ref<WorkspaceFlowStep>('input')
  const wallsDetectionComplete = ref(false)
  const referenceWallThicknessPx = ref<number | null>(null)
  const devSessionRestoring = ref(false)

  const layerToggles = useWorkspaceLayerToggles()
  const {
    showWallLines,
    showTemplates,
    showLines,
    showSkeleton,
    showSkeletonLayerB,
    showSemanticLayerC,
    showLayer4,
    showLayer5,
    showLayer6,
    showLayer7,
    showLayer8,
    showLayer9,
    showLayer10,
    showLayer11,
    showLayer12,
    showLayer14,
    showOcrText,
  } = layerToggles

  const { wallPipelineVersion } = useWorkspaceWallPipeline({
    flowStep,
    showLayer7,
    showLayer8,
    showLayer9,
    showLayer10,
  })

  const preprocessPreview = usePreprocessPreview()
  const scale = useHScaleCalibration()
  const extraction = useExtraction('geometry-lbe')
  const cvLoader = useOpenCvLoader()
  const localError = ref<string | null>(null)
  function setLocalError(message: string | null): void {
    localError.value = message
  }
  const error = computed(() => localError.value ?? extraction.error.value)
  const originalImageEl = ref<HTMLImageElement | null>(null)

  const {
    rects,
    selectedRectId,
    activeClass,
    previewRect,
    typeColors,
    counts,
    clearRects,
    clearRectsByType,
    addRect,
    removeRect,
    selectRect,
    updateRectBounds,
    updateRectFmlRefId,
    startDraw,
    updateDraw,
    endDraw,
    cancelDraw,
  } = useExampleSelection()

  const preprocessWiring = useWorkspacePreprocessWiring({
    flowStep,
    inputTab,
    preprocessTab,
    templateTab,
    resultTab,
    originalImageEl,
    preprocessPreview,
    preprocess,
    imageSrc,
    imageName,
    cvLoader,
    scale,
    setImageSource,
    rects,
    setLocalError,
    referenceWallThicknessPx,
    gapsInkMode,
  })
  const {
    inputMask,
    inkEdit,
    wallBw,
    image,
    preprocessVectorCache,
    preprocessUi,
    getImageEl,
    ensureWallBwReady,
    getEffectiveWallBwBytes,
    getBaseWallBw,
    bindSignaturePreview,
    setRemasureWallAfterInputCommit,
  } = preprocessWiring

  function detectionMaskArgs() {
    return {
      ...inputMask.preprocessMaskArgs(),
      precomposedWallBw: getEffectiveWallBwBytes() ?? undefined,
    }
  }

  const pipeline = useWorkspacePipeline({
    flowStep,
    templateTab,
    resultTab,
    tabOutputs,
    lastOutput: extraction.lastOutput,
    rects,
    running: extraction.running,
    scaleLocked: computed(() => !scale.confirmed.value),
    profileConfirmed,
    ocrMaskApplied: computed(() => inputMask.ocrMaskedRegions.value.length > 0),
    wallsDetectionComplete,
  })

  const scaleUi = useWorkspaceScale({
    scale,
    originalImageEl,
  })

  const signature = useWorkspaceSignaturePreview({
    rects,
    flowStep,
    templateElementClass: pipeline.templateElementClass,
    preprocess,
    signatureExtractOptions,
    getImageEl,
    imageDimensions: image.imageDimensions,
    preprocessMaskArgs: inputMask.preprocessMaskArgs,
  })

  bindSignaturePreview(signature)

  const ocr = useWorkspaceOcr({
    preprocess,
    cvLoader,
    getImageEl,
    ensureScaleInitialized: image.ensureScaleInitialized,
    preprocessMaskArgs: inputMask.preprocessMaskArgs,
    applyOcrTextMask: inputMask.applyOcrTextMask,
    clearOcrTextMask: inputMask.clearOcrTextMask,
    refreshOcrPreview: () => preprocessUi.refreshOcrUnderlayPreview(),
    setLocalError,
  })

  const fmlUnderlayOpacity = ref(25)
  /** FML-geometrie opacity in de viewer (percent 0–100). */
  const fmlContentOpacity = ref(80)
  const fmlUnderlaySrc = computed(() => image.workingImageSrc.value ?? null)
  const fmlUnderlaySize = computed(() => {
    const img = originalImageEl.value
    if (!img?.naturalWidth || !img.naturalHeight) return null
    return { width: img.naturalWidth, height: img.naturalHeight }
  })

  /** Late-bind: FML na door/window faces (directe refs; geen mirror-watches). */
  let fmlApi: ReturnType<typeof useWorkspaceFml> | null = null
  let doorSwingFacesApi: ReturnType<typeof useWorkspaceDoorSwingFaces> | null = null
  let windowFacesApi: ReturnType<typeof useWorkspaceWindowFaces> | null = null

  const { detection, roomFaces, semanticWalls } = useWorkspaceRoomPipeline(
    buildWorkspaceRoomPipelineDeps({
      flowStep,
      resultTab,
      templateTab,
      drawingProfileId,
      profileConfirmed,
      activeDetectionPreset,
      preprocess,
      referenceWallThicknessPx,
      wallPipelineVersion,
      tabOutputs,
      preprocessVectorCache: preprocessVectorCache.cache,
      rects,
      signaturePreview: signature.signaturePreview,
      activeClass,
      cvLoader,
      extraction,
      scaleConfirmed: scale.confirmed,
      getImageEl,
      ensureScaleInitialized: image.ensureScaleInitialized,
      preprocessMaskArgs: detectionMaskArgs,
      ensureWallBwReady,
      getEffectiveWallBwBytes,
      getBaseWallBw,
      clearRectsByType,
      removeRect,
      selectRect,
      updateRectBounds,
      updateRectFmlRefId,
      endDraw,
      cancelDraw,
      clearSignatureForRect: signature.clearSignatureForRect,
      pruneSignaturePreview: signature.pruneSignaturePreview,
      refreshSignaturePreview: signature.refreshSignaturePreview,
      preprocessUi,
      setLocalError,
      templateElementClass: pipeline.templateElementClass,
      selectedRectId,
      wallsDetectionComplete,
      wallBwPreviewUrl: preprocessPreview.previewUrl,
      showSkeletonLayerB,
      showLayer4,
      showLayer5,
      showLayer6,
      showLayer7,
      showLayer8,
      showLayer9,
      showLayer10,
      showLayer11,
      showLayer12,
      showLayer14,
      fml: {
        resetGeneratedPreview: () => {
          fmlApi?.resetGeneratedPreview()
        },
      },
      devSessionRestoring,
      applyAutoGapsInkMode,
      clearGapsInkModeManual,
      onDoorFacesDemoted: () => {
        doorSwingFacesApi?.scheduleRefreshDoorSwingFromExistingDoors()
      },
      onWindowFacesDemoted: () => {
        windowFacesApi?.scheduleRefreshWindowsFromExistingClasses()
      },
      // ESC:O-27 (D)
      onAfterFinalize: async () => {
        tally('O-27', 'post_finalize_openings')
        void doorSwingFacesApi?.snapResolvedDoorsToWalls()
        windowFacesApi?.bindResolvedWindowsToWalls()
      },
    }),
  )

  setRemasureWallAfterInputCommit(async () => {
    // Refs worden in stap 2 getekend; geen remasure na input-bake.
  })

  const gapsFaces = useWorkspaceGapsFaces({
    flowStep,
    templateTab,
    preprocess,
    tabOutputs,
    roomRasterCache: roomFaces.roomRasterCache,
    roomPhase: roomFaces.roomPhase,
    wallBwPreviewUrl: preprocessPreview.previewUrl,
    gapsInkMode,
    getImageEl,
    preprocessMaskArgs: inputMask.preprocessMaskArgs,
    examplesWithSignatures: signature.examplesWithSignatures,
    openingRects: () => rects.value,
    setLocalError,
    referenceWallThicknessPx,
    getBaseWallBw,
  })
  const doorSwingFaces = useWorkspaceDoorSwingFaces({
    flowStep,
    templateTab,
    tabOutputs,
    roomRasterCache: roomFaces.roomRasterCache,
    roomPhase: roomFaces.roomPhase,
    wallBwPreviewUrl: preprocessPreview.previewUrl,
    preprocess,
    preprocessMaskArgs: inputMask.preprocessMaskArgs,
    getImageEl,
    openingRects: () => rects.value,
    getPxPerMm: () => ({
      x: scale.pixelsPerMillimeterX.value,
      y: scale.pixelsPerMillimeterY.value,
    }),
    setLocalError,
    referenceWallThicknessPx,
    getBaseWallBw,
    onDoorFacesApplied: () => roomFaces.refreshClassificationPreview(),
    onDoorSwingDemotePruned: (orphanedDoorframeFaceIds) =>
      windowFacesApi?.acknowledgeDoorSwingDemotePrune(orphanedDoorframeFaceIds),
    devSessionRestoring,
  })
  doorSwingFacesApi = doorSwingFaces
  const windowFaces = useWorkspaceWindowFaces({
    flowStep,
    templateTab,
    tabOutputs,
    roomRasterCache: roomFaces.roomRasterCache,
    roomPhase: roomFaces.roomPhase,
    wallBwPreviewUrl: preprocessPreview.previewUrl,
    preprocess,
    preprocessMaskArgs: inputMask.preprocessMaskArgs,
    referenceWallThicknessPx,
    getImageEl,
    openingRects: () => rects.value,
    getDoorArcFaceIds: () => doorSwingFaces.getStage2DoorArcFaceIds(),
    getPxPerMm: () => ({
      x: scale.pixelsPerMillimeterX.value,
      y: scale.pixelsPerMillimeterY.value,
    }),
    setLocalError,
    getBaseWallBw,
    onWindowFacesApplied: () => {
      void roomFaces.refreshClassificationPreview()
      // Window sticky doorframes na deur-Stage-2: IDs meenemen zonder Stage-2 her-run.
      doorSwingFaces.reattachStickyDoorframesToResolved()
    },
  })
  windowFacesApi = windowFaces

  const fml = useWorkspaceFml({
    imageName,
    combinedOutput: pipeline.combinedOutput,
    scale,
    underlaySrc: fmlUnderlaySrc,
    underlaySize: fmlUnderlaySize,
    underlayOpacity: fmlUnderlayOpacity,
    setLocalError,
    orientedDoors: doorSwingFaces.orientedDoors,
    boundWindows: windowFaces.boundWindows,
    referenceWallBandSync: {
      referenceWallThicknessPx,
      devSessionRestoring,
    },
  })
  fmlApi = fml

  const exports = useWorkspaceExports({
    imageName,
    preprocess,
    preprocessTab,
    preprocessPreview,
    effectiveBwUrl: wallBw.effectiveBwUrl,
    tabOutputs,
    combinedOutput: pipeline.combinedOutput,
    scale,
    rects,
    getImageEl,
    preprocessMaskArgs: inputMask.preprocessMaskArgs,
    refreshLayerUnderlayPreview: preprocessUi.refreshLayerUnderlayPreview,
    setLocalError,
    roomRasterCache: roomFaces.roomRasterCache,
    applyAutoGapsInkMode,
    gapsDemoteStats: gapsFaces.gapsDemoteStats,
    boundDoors: doorSwingFaces.boundDoors,
    resolvedDoors: doorSwingFaces.resolvedDoors,
    orientedDoors: doorSwingFaces.orientedDoors,
    boundWindows: windowFaces.boundWindows,
    windowBindRejections: windowFaces.windowBindRejections,
    getDoorArcFaceIds: () => doorSwingFaces.getStage2DoorArcFaceIds(),
    windowAxelStage: windowFaces.windowAxelStage,
    referenceWallThicknessPx,
    getBaseWallBw,
  })

  const e2eFixture = useWorkspaceE2eFixtureExport({
    imageName,
    tabOutputs,
    scale,
    referenceWallThicknessPx,
    resolvedDoors: doorSwingFaces.resolvedDoors,
    resolvedWindows: windowFaces.resolvedWindows,
    appliedFmlThicknessLimits: fml.appliedFmlThicknessLimits,
    appliedFmlBandBoundaries: fml.appliedFmlBandBoundaries,
    appliedFmlWallHeightCm: fml.appliedFmlWallHeightCm,
    appliedFmlDoorHeightCm: fml.appliedFmlDoorHeightCm,
    appliedFmlWindowHeightCm: fml.appliedFmlWindowHeightCm,
    appliedFmlWindowSillZCm: fml.appliedFmlWindowSillZCm,
    setLocalError,
  })

  const overlays = useWorkspaceOverlays({
    flowStep,
    preprocessTab,
    templateTab,
    resultTab,
    templateElementClass: pipeline.templateElementClass,
    activePipelineOutput: pipeline.activePipelineOutput,
    preprocessVectorCache: preprocessVectorCache.cache,
    ocrPreviewCandidates: ocr.ocrCandidates,
    ocrMaskedRegions: inputMask.ocrMaskedRegions,
    showTemplates,
    showWallLines,
    showLines,
    showSkeleton,
    showSkeletonLayerB,
    showSemanticLayerC,
    showLayer4,
    showLayer5,
    showLayer6,
    showLayer7,
    showLayer8,
    showLayer9,
    showLayer10,
    showLayer11,
    showLayer12,
    showLayer14,
    showOcrText,
    roomPreviewMaskCanvas: roomFaces.roomPreviewMaskCanvas,
    roomPreviewMaskRevision: roomFaces.roomPreviewMaskRevision,
    gapsPreviewMaskCanvas: gapsFaces.gapsPreviewMaskCanvas,
    doorSwingPreviewMaskCanvas: doorSwingFaces.doorSwingPreviewMaskCanvas,
    doorSwingPreviewMaskRevision: doorSwingFaces.doorSwingPreviewMaskRevision,
    doorSwingPreviewMaskUrl: doorSwingFaces.doorSwingPreviewMaskUrl,
    windowPreviewMaskCanvas: windowFaces.windowPreviewMaskCanvas,
    windowPreviewMaskRevision: windowFaces.windowPreviewMaskRevision,
    boundDoors: doorSwingFaces.boundDoors,
    orientedDoors: doorSwingFaces.orientedDoors,
    boundWindows: windowFaces.boundWindows,
    roomPhase: roomFaces.roomPhase,
  })

  const toolbelt = useWorkspaceToolbelt({
    inkEdit,
    roomFaces,
    flowStep,
  })

  const debugProbe = useWorkspaceDebugProbeFromContext({
    flowStep,
    resultTab,
    templateTab,
    imageName,
    imageSrc,
    originalImageEl,
    activePipelineOutput: pipeline.activePipelineOutput,
    tabOutputs,
    roomRasterCache: roomFaces.roomRasterCache,
  })

  const flow = useWorkspaceFlow({
    flowStep,
    imageSrc,
    running: extraction.running,
    scaleConfirmed: scale.confirmed,
    profileConfirmed,
    preprocessTab,
    templateTab,
    resultTab,
    showOcrDetails,
    activeClass,
    rects,
    referenceWallThicknessPx,
    ocrEnabled: computed(() => preprocess.value.ocrEnabled ?? false),
    preprocessPreview,
    clearPolygonToolMode: inputMask.clearPolygonToolMode,
    clearRects,
    refreshMaskedWorkingImage: inputMask.refreshMaskedWorkingImage,
    commitInputStepImage: image.commitInputStepImage,
    commitInkEdits: inkEdit.commitInkEdits,
    refreshLayerUnderlayPreview: preprocessUi.refreshLayerUnderlayPreview,
    refreshAllDetectionUnderlays: preprocessUi.refreshAllDetectionUnderlays,
    refreshOcrUnderlayPreview: preprocessUi.refreshOcrUnderlayPreview,
    refreshSignaturePreview: signature.refreshSignaturePreview,
    onApplyPreprocessPreview: preprocessUi.onApplyPreprocessPreview,
    ensureVectorCacheIfNeeded: preprocessUi.ensureVectorCacheIfNeeded,
    vectorCacheLoading: preprocessVectorCache.loading,
    autoClassifyWalls: () => roomFaces.autoClassifyWalls(),
    measureWallReferenceThickness: (rect) => detection.measureWallReferenceThickness(rect),
    wallsDetectionComplete: () => wallsDetectionComplete.value,
    devSessionRestoring,
    onEnterResultStep: () => semanticWalls.buildForResultStep(),
    setLocalError,
    resetInkOverlay: () => inkEdit.resetInkEdit(),
  })

  const lifecycle = useWorkspaceLifecycle({
    clearRects,
    extractionLastOutput: extraction.lastOutput,
    localError,
    preprocess,
    preprocessPreview,
    preprocessVectorCache,
    inputMask,
    inkEdit,
    scaleUi,
    signature,
    tabOutputs,
    fml,
    profileConfirmed,
    showOcrDetails,
    roomFaces,
    referenceWallThicknessPx,
    wallsDetectionComplete,
    flowStep,
    preprocessUi,
    image,
  })

  const pdfUpload = useWorkspacePdfUpload({
    loadFile,
    setImageSource,
    applyNewUnderlayReset: lifecycle.applyNewUnderlayReset,
  })

  const devSession = useWorkspaceDevSession(
    buildWorkspaceDevSessionDeps({
      imageName,
      setImageSource,
      originalImageEl,
      preprocess,
      drawingProfileId,
      wallPipelineVersion,
      scale,
      scaleUi,
      inputMask,
      inkEdit,
      wallBw,
      image,
      flowStep,
      templateTab,
      preprocessTab,
      resultTab,
      profileConfirmed,
      tabOutputs,
      roomFaces,
      wallsDetectionComplete,
      preprocessPreview,
      lifecycle,
      preprocessUi,
      ocr,
      semanticWalls,
      referenceWallThicknessPx,
      rects,
      clearRectsByType,
      addRect,
      detection,
      devSessionRestoring,
      setLocalError,
      doorSwingFaces,
      windowFaces,
    }),
  )

  const recalculateFaces = async () => {
    const ok = await roomFaces.recalculateFaces()
    if (ok) inkEdit.clearInkEditStale()
    return ok
  }

  return assembleWorkspaceFacadeReturn({
    canvasRef,
    imageSrc,
    imageName,
    drawingProfileId,
    profileConfirmed,
    activeDrawingProfile,
    referenceWallThicknessPx,
    wallPipelineVersion,
    showOcrDetails,
    preprocess,
    preprocessTab,
    templateTab,
    resultTab,
    tabOutputs,
    flowStep,
    layerToggles,
    preprocessPreview,
    preprocessVectorCache: preprocessVectorCache.cache,
    preprocessVectorCacheLoading: preprocessVectorCache.loading,
    scale,
    cvLoader,
    error,
    rects,
    selectedRectId,
    activeClass,
    previewRect,
    typeColors,
    counts,
    startDraw,
    updateDraw,
    cancelDraw,
    selectRect,
    inputMask,
    inkEdit,
    image,
    inputRotationPreviewDeg,
    originalImageEl,
    signature,
    overlays,
    debugProbe,
    exports,
    e2eFixture,
    fmlUnderlayOpacity,
    fmlContentOpacity,
    fmlUnderlaySrc,
    fmlUnderlaySize,
    fml,
    pipeline,
    scaleUi,
    preprocessUi,
    detection,
    roomFaces,
    gapsFaces,
    doorSwingFaces,
    windowFaces,
    toolbelt,
    recalculateFaces,
    ocr,
    flow,
    resetWorkspace: lifecycle.resetWorkspace,
    pdfUpload,
    devSession,
    gapsInkMode,
    gapsInkModeManual,
    setGapsInkModeManual,
  })
}
