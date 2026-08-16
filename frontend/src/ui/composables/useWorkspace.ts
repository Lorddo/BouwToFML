import { ref, computed, watch, onMounted } from 'vue'
import { tally } from '@/core/diagnostics'
import { useImageUpload } from '@/platform/upload'
import { imageElementToPngDataUrl } from '@/platform/dev-workspace/image-capture'
import { useExampleSelection } from '@/platform/selection'
import { DEFAULT_PREPROCESS } from '@/platform/image'
import {
  detectionPresetForProfile,
  getDrawingProfile,
  loadStoredProfileId,
  storeProfileId,
  type DrawingProfileId,
} from '@/platform/profile'
import { useExtraction } from './useExtraction'
import { useOpenCvLoader } from './useOpenCvLoader'
import { tGlobal } from '@/ui/i18n'
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
import { bakeOcrMaskIntoInkOverlay } from '@/cv/preprocess/compose-wall-bw'
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
import { useWallStamp } from './workspace/useWallStamp'
import { useWorkspaceGapsFaces } from './workspace/useWorkspaceGapsFaces'
import { useWorkspaceDoorSwingFaces } from './workspace/useWorkspaceDoorSwingFaces'
import { useWorkspaceWindowFaces } from './workspace/useWorkspaceWindowFaces'
import { assembleWorkspaceFacadeReturn } from './workspace/assembleWorkspaceFacadeReturn'
import { useGapsInkModePersistence } from './workspace/useGapsInkModePersistence'
import { totalInputRotationDeg } from '@/platform/canvas/rotationPreview'
import { useWorkspaceProject } from './project/useWorkspaceProject'
import { loadUserSettings } from './settings/user-settings'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { loadFmlWallThicknessLimits } from '@/core/fml/fml-wall-thickness-limits'
import {
  deleteProject,
  listProjectIndex,
  loadProject,
  type PersistedProjectIndexEntry,
} from '@/platform/project-store'
import { downloadFml } from '@/core/fml/downloadFml'
import { sanitizeFilename } from './workspace/workspace-fml-generate'
import { isWallsClassifyOutput, isWallsOutputFinalized } from './workspace/room-faces-cache-sync'
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
  const { imageSrc, imageName, loadFile, setImageSource, clearImageSource } = useImageUpload()

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
  const resultTab = ref<ResultViewTab>('vector')
  const tabOutputs = ref<TabDetectionOutputs>(emptyTabOutputs())
  const flowStep = ref<WorkspaceFlowStep>('project')
  const wallsDetectionComplete = ref(false)
  const referenceWallThicknessPx = ref<number | null>(null)
  const wallRefThicknessMeasures = ref<
    import('@/platform/selection/wall-thickness-ref').WallRefThicknessMeasure[]
  >([])
  const wallThicknessBandBoundariesPx = ref<{
    midBoundaryPx: number
    maxBoundaryPx: number
  } | null>(null)
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
    replaceWallRects,
    addRect,
    removeRect,
    selectRect,
    updateRectBounds,
    updateRectFmlRefId,
    updateRectWallThicknessBand,
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
    bindStampBwGetter,
  } = preprocessWiring

  const wallStamp = useWallStamp({
    cvLoader,
    preprocess,
    imageWidth: () => originalImageEl.value?.naturalWidth ?? 0,
    imageHeight: () => originalImageEl.value?.naturalHeight ?? 0,
    pxPerMmX: () => scale.pixelsPerMillimeterX.value,
    pxPerMmY: () => scale.pixelsPerMillimeterY.value,
    onStampBwChanged: () => {
      void wallBw.composeAndPublish()
      void preprocessUi.publishWallBwUnderlay()
    },
  })
  bindStampBwGetter(() => wallStamp.getComposeStampBw())

  watch(
    () => [
      preprocess.value.wallLayer?.brightness,
      preprocess.value.wallLayer?.contrast,
      preprocess.value.wallLayer?.threshold,
      preprocess.value.wallLayer?.useAdaptive,
      preprocess.value.wallLayer?.adaptiveBlockSize,
      preprocess.value.brightness,
      preprocess.value.contrast,
      preprocess.value.threshold,
      preprocess.value.useAdaptive,
      preprocess.value.adaptiveBlockSize,
    ],
    () => {
      wallStamp.retuneFromPreprocess()
    },
  )

  function detectionMaskArgs() {
    return {
      ...inputMask.preprocessMaskArgs(),
      precomposedWallBw: getEffectiveWallBwBytes() ?? undefined,
      wallStampMask: wallStamp.getOtsuStampMask() ?? undefined,
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

  const initialViewer = loadUserSettings().fmlViewer
  const initialConversion = loadUserSettings().fmlConversion
  const fmlUnderlayOpacity = ref(initialViewer.underlayOpacityPct)
  /** FML-geometrie opacity in de viewer (percent 0–100). */
  const fmlContentOpacity = ref(initialViewer.fmlOpacityPct)
  const mergeDoubleDoors = ref(initialConversion.mergeDoubleDoors)
  const mergeMultiWindows = ref(initialConversion.mergeMultiWindows)

  function applyUserViewerSettings(): void {
    const settings = loadUserSettings()
    fmlUnderlayOpacity.value = settings.fmlViewer.underlayOpacityPct
    fmlContentOpacity.value = settings.fmlViewer.fmlOpacityPct
    mergeDoubleDoors.value = settings.fmlConversion.mergeDoubleDoors
    mergeMultiWindows.value = settings.fmlConversion.mergeMultiWindows
    scaleUi.applyScaleInputUnitFromSettings()
  }
  const fmlUnderlaySrc = computed(() => image.workingImageSrc.value ?? null)
  const fmlUnderlaySize = computed(() => {
    const img = originalImageEl.value
    if (!img?.naturalWidth || !img.naturalHeight) return null
    return { width: img.naturalWidth, height: img.naturalHeight }
  })

  /** Late-bind: FML na door/window faces (directe refs; geen mirror-watches). */
  let fmlApi: ReturnType<typeof useWorkspaceFml> | null = null
  let syncThicknessCmToFloorDefaults: ((band: 'min' | 'mid' | 'max', cm: number) => void) | null =
    null
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
      getWallStampMask: () => wallStamp.getOtsuStampMask(),
      getBaseWallBw,
      clearRectsByType,
      removeRect,
      selectRect,
      updateRectBounds,
      updateRectFmlRefId,
      updateRectWallThicknessBand,
      getWallThicknessLimits: () => {
        if (fmlApi) {
          return {
            minCm: fmlApi.fmlThicknessMinCm.value,
            midCm: fmlApi.fmlThicknessMidCm.value,
            maxCm: fmlApi.fmlThicknessMaxCm.value,
          }
        }
        return loadFmlWallThicknessLimits()
      },
      setWallThicknessCm: (band, cm) => {
        if (!fmlApi || !(cm > 0)) return
        if (band === 'min') fmlApi.setFmlThicknessMinCm(cm)
        else if (band === 'mid') fmlApi.setFmlThicknessMidCm(cm)
        else fmlApi.setFmlThicknessMaxCm(cm)
        // Floor-defaults meenemen — anders overschrijft resume/sync de stap-2 override
        // weer met oude project-defaults.
        syncThicknessCmToFloorDefaults?.(band, cm)
      },
      wallRefThicknessMeasures,
      wallThicknessBandBoundariesPx,
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
      onAfterFinalize: async (setFinalizePhase) => {
        tally('O-27', 'post_finalize_openings')
        setFinalizePhase('doors')
        await doorSwingFacesApi?.snapResolvedDoorsToWalls()
        setFinalizePhase('windows')
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
    getOrientedDoors: () => doorSwingFaces.orientedDoors.value,
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

  const fmlPlanName = ref<string | null>(null)
  const fmlFloorName = ref<string | null>(null)
  const fmlFloorLevel = ref<number | null>(null)
  const fmlFloorId = ref<string | null>(null)

  const fml = useWorkspaceFml({
    imageName,
    combinedOutput: pipeline.combinedOutput,
    scale,
    underlaySrc: fmlUnderlaySrc,
    underlaySize: fmlUnderlaySize,
    underlayOpacity: fmlUnderlayOpacity,
    setLocalError,
    getBaseWallBw,
    orientedDoors: doorSwingFaces.orientedDoors,
    boundWindows: windowFaces.boundWindows,
    mergeDoubleDoors,
    mergeMultiWindows,
    referenceWallBandSync: {
      referenceWallThicknessPx,
      wallRefThicknessMeasures,
      wallThicknessBandBoundariesPx,
      devSessionRestoring,
    },
    planName: fmlPlanName,
    floorName: fmlFloorName,
    floorLevel: fmlFloorLevel,
  })
  fmlApi = fml

  const exports = useWorkspaceExports({
    imageName,
    flowStep,
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
    resolvedWindows: windowFaces.resolvedWindows,
    windowBindRejections: windowFaces.windowBindRejections,
    getDoorArcFaceIds: () => doorSwingFaces.getStage2DoorArcFaceIds(),
    windowAxelStage: windowFaces.windowAxelStage,
    referenceWallThicknessPx,
    getBaseWallBw,
    projectName: fmlPlanName,
    floorId: fmlFloorId,
    floorName: fmlFloorName,
    floorLevel: fmlFloorLevel,
    getPreviewPlan: () => fml.previewPlan.value ?? null,
    getGeneratedFmlText: () => fml.generatedFmlText.value ?? '',
    appVersion: '1.0.0',
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
    ocrEnabled: computed(() => preprocess.value.ocrEnabled ?? false),
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

  /** Late-bound: project bestaat pas ná lifecycle; nodig na underlay-reset. */
  let restoreFmlDefaultsFromActiveFloor: (() => void) | null = null
  const lifecycle = useWorkspaceLifecycle({
    clearRects,
    extractionLastOutput: extraction.lastOutput,
    localError,
    preprocess,
    preprocessPreview,
    preprocessVectorCache,
    inputMask,
    inkEdit,
    clearWallStamp: () => wallStamp.clear(),
    scaleUi,
    signature,
    tabOutputs,
    fml,
    profileConfirmed,
    showOcrDetails,
    roomFaces,
    doorSwingFaces,
    windowFaces,
    referenceWallThicknessPx,
    wallRefThicknessMeasures,
    wallsDetectionComplete,
    flowStep,
    preprocessUi,
    image,
    imageSrc,
    restoreFmlDefaultsFromActiveFloor: () => restoreFmlDefaultsFromActiveFloor?.(),
  })

  const pdfUpload = useWorkspacePdfUpload({
    loadFile,
    setImageSource,
    applyNewUnderlayReset: lifecycle.applyNewUnderlayReset,
    setPdfUnderlaySource: image.setPdfUnderlaySource,
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
      serializeWallStamp: () => wallStamp.serialize(),
      hydrateWallStamp: (data, width, height) => wallStamp.hydrate(data, width, height),
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
      fml,
      referenceWallThicknessPx,
      wallRefThicknessMeasures,
      rects,
      clearRectsByType,
      replaceWallRects,
      addRect,
      detection,
      devSessionRestoring,
      setLocalError,
      doorSwingFaces,
      windowFaces,
    }),
  )

  const project = useWorkspaceProject({
    flowStep,
    imageSrc,
    imageName,
    preprocess,
    drawingProfileId,
    rects,
    captureCurrentSession: (options) => devSession.captureCurrentSession(options),
    restoreSession: (session, options) => devSession.restoreSessionInMemory(session, options),
    resetToEmptyFloor: () => {
      lifecycle.applyNewUnderlayReset()
      clearImageSource()
      image.resetImageSource()
      flowStep.value = 'input'
    },
    loadUnderlayWithScale: async (src, name, scaleSnapshot) => {
      clearRects()
      doorSwingFaces.resetDoorSwingState()
      doorSwingFaces.resetAutoDoorPassGate()
      windowFaces.resetWindowState()
      windowFaces.invalidateAutoWindowPass()
      roomFaces.resetRoomState()
      tabOutputs.value = emptyTabOutputs()
      wallsDetectionComplete.value = false
      image.clearPdfUnderlaySource()
      image.prepareExactImageSrcLoad()
      setImageSource(src, name)
      await image.loadExactWorkingImage(src)
      if (scaleSnapshot) {
        scaleUi.restoreFromSessionSnapshot(scaleSnapshot)
      }
    },
    applyPreprocessTune: ({ preprocess: nextPreprocess, drawingProfileId: nextProfile }) => {
      preprocess.value = normalizeStoredPreprocess({ ...nextPreprocess })
      drawingProfileId.value = nextProfile
      storeProfileId(nextProfile)
      clearRects()
      void preprocessUi.refreshLayerUnderlayPreview('walls')
    },
    setLocalError,
    getPreviewPlan: () => fml.previewPlan.value ?? null,
    getPreviewUnderlayLayout: () => fml.previewUnderlayLayout.value ?? null,
    getFmlNulpuntImageCm: () => fml.fmlNulpuntImageCm.value ?? null,
    setFmlNulpuntImageCm: (point) => fml.setFmlNulpuntImageCm(point),
    getFmlOrient: () => fml.persistOrientState(),
    setFmlOrient: (state) => fml.setFmlOrient(state),
    clearLiveFmlPreview: () => fml.clearLiveFmlPreview(),
    applyFmlDefaultsToUi: (defaults) => {
      fml.setFmlWallHeightCm(defaults.wallHeightCm)
      fml.setFmlDoorHeightCm(defaults.doorHeightCm)
      fml.setFmlWindowHeightCm(defaults.windowHeightCm)
      fml.setFmlWindowSillZCm(defaults.windowSillZCm)
      fml.setFmlBovenlichtDefault(defaults.bovenlichtDefault)
      fml.setFmlWindowBovenlichtDefault(defaults.windowBovenlichtDefault)
      fml.setFmlBovenlichtHeightCm(defaults.bovenlichtHeightCm)
      fml.setFmlBovenlichtGapCm(defaults.bovenlichtGapCm)
      fml.setFmlThicknessMinCm(defaults.thicknessMinCm)
      fml.setFmlThicknessMidCm(defaults.thicknessMidCm)
      fml.setFmlThicknessMaxCm(defaults.thicknessMaxCm)
      // Meetbanden blijven uit muur-REF (niet floor-defaults) — anders false dirty na meting.
      // Programmatische sync = geen «gewijzigd»-hint; alleen handmatige FmlPanel-edits.
      fml.syncAppliedFromDraft()
    },
    shouldSkipPersist: () => extraction.running.value || devSessionRestoring.value,
    getPdfUnderlaySource: () => image.pdfUnderlaySource.value,
    setPdfUnderlaySource: image.setPdfUnderlaySource,
  })

  restoreFmlDefaultsFromActiveFloor = () => project.syncActiveFloorDefaultsToUi()
  // Eerste sync: factory-FML-UI → actieve vloer-/user-defaults (o.a. bovenlicht).
  restoreFmlDefaultsFromActiveFloor()
  syncThicknessCmToFloorDefaults = (band, cm) => {
    if (!(cm > 0)) return
    if (band === 'min') project.updateActiveFloorDefaults({ thicknessMinCm: cm }, { syncUi: false })
    else if (band === 'mid')
      project.updateActiveFloorDefaults({ thicknessMidCm: cm }, { syncUi: false })
    else project.updateActiveFloorDefaults({ thicknessMaxCm: cm }, { syncUi: false })
  }

  const resumeCandidate = ref<PersistedProjectIndexEntry | null>(null)

  onMounted(() => {
    void listProjectIndex()
      .then((entries) => {
        resumeCandidate.value = entries[0] ?? null
      })
      .catch((error) => {
        console.warn('[project-store] list index failed', error)
      })
  })

  async function resumePersistedProject(): Promise<void> {
    const candidate = resumeCandidate.value
    if (!candidate) return
    setLocalError(null)
    try {
      const restored = await loadProject(candidate.id)
      if (!restored) {
        resumeCandidate.value = null
        setLocalError(tGlobal('project.errors.resumeFailed'))
        return
      }
      project.applyPersistedState(restored)
      resumeCandidate.value = null
      await project.enterActiveFloorFromProject({ keepActiveFloor: true })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setLocalError(tGlobal('project.errors.resumeFailedDetail', { message }))
    }
  }

  async function discardPersistedProject(): Promise<void> {
    const candidate = resumeCandidate.value
    if (!candidate) return
    try {
      await deleteProject(candidate.id)
    } catch (error) {
      console.warn('[project-store] discard failed', error)
    }
    resumeCandidate.value = null
  }

  watch(
    () => fml.previewPlan.value,
    (plan) => {
      if (project.switchingFloor.value || devSessionRestoring.value) return
      if (flowStep.value === 'result' && plan?.floors[0]) {
        project.storeGeneratedFloorForActive(plan.floors[0])
      }
    },
  )

  watch(
    () => wallsDetectionComplete.value,
    (complete, wasComplete) => {
      if (complete && !wasComplete && !devSessionRestoring.value && !project.switchingFloor.value) {
        project.persistProject('wallsDetectionComplete')
      }
    },
  )

  watch(
    [project.projectMeta, project.activeFloor],
    () => {
      fmlPlanName.value = project.projectMeta.value.name.trim() || null
      fmlFloorId.value = project.activeFloor.value?.id ?? null
      fmlFloorName.value = project.activeFloor.value?.name ?? null
      fmlFloorLevel.value = project.activeFloor.value?.level ?? null
    },
    { immediate: true, deep: true },
  )

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
    runOcrScan: () => ocr.runOcrScan(),
    measureWallReferenceThickness: (rect) => detection.measureWallReferenceThickness(rect),
    wallsDetectionComplete: () => wallsDetectionComplete.value,
    hasTemplatesDetection: () => {
      const phase = roomFaces.roomPhase.value
      if (phase === 'review' || phase === 'done' || phase === 'finalizing') return true
      const walls = tabOutputs.value.walls
      return isWallsClassifyOutput(walls) || isWallsOutputFinalized(walls)
    },
    devSessionRestoring,
    onEnterResultStep: async () => {
      await semanticWalls.buildForResultStep()
      // Store vóór download: previewPlan kan al bestaan vóór flowStep=result (watch mist dan).
      const plan = fml.previewPlan.value
      if (plan?.floors[0]) {
        project.storeGeneratedFloorForActive(plan.floors[0])
      }
      // Capture refs/dikte/detectie op result — preserve bij floor-switch/resume/stap-terug.
      project.persistProject('enterResult')
    },
    setLocalError,
    resetInkOverlay: () => inkEdit.resetInkEdit(),
    projectCanProceed: () => project.canProceedFromProject.value,
    onLeaveProjectStep: () => project.enterActiveFloorFromProject(),
    onEnterProjectStep: () => project.leaveFloorToProject(),
    onFlowCheckpoint: () => project.persistProject('flowCheckpoint'),
    onResultDownload: () => downloadProjectFml(),
  })

  function resetWorkspace() {
    project.resetProject()
    resumeCandidate.value = null
    lifecycle.resetWorkspace()
    flowStep.value = 'project'
  }

  const recalculateFaces = async () => {
    const ok = await roomFaces.recalculateFaces()
    if (ok) inkEdit.clearInkEditStale()
    return ok
  }

  async function bakeOcrIntoInk(): Promise<boolean> {
    const mask = inputMask.ocrMask.value
    const ready = await ensureWallBwReady()
    if (!ready) return false
    const w = wallBw.baseBwWidth.value
    const h = wallBw.baseBwHeight.value
    if (w <= 0 || h <= 0) return false
    if (mask) {
      const overlay = wallBw.ensureInkOverlaySize(w, h)
      bakeOcrMaskIntoInkOverlay(mask, overlay)
    }
    ocr.clearOcrScan()
    await wallBw.composeAndPublish({ includeOcr: false })
    const phase = roomFaces.roomPhase.value
    if (phase === 'review' || phase === 'done') {
      return recalculateFaces()
    }
    return true
  }

  async function clearOcrWithFaceRefresh(): Promise<void> {
    ocr.clearOcrScan()
    const phase = roomFaces.roomPhase.value
    if (phase === 'review' || phase === 'done') {
      await recalculateFaces()
    }
  }

  /**
   * FmlPanel-checkbox → UI-ref + actieve vloer-defaults (zonder UI-resync-loop).
   * Zonder write-through bleef project-download op defaults.bovenlichtDefault=false.
   */
  function setFmlBovenlichtDefault(value: boolean): void {
    const on = value === true
    fml.setFmlBovenlichtDefault(on)
    project.updateActiveFloorDefaults({ bovenlichtDefault: on }, { syncUi: false })
  }

  function setFmlWindowBovenlichtDefault(value: boolean): void {
    const on = value === true
    fml.setFmlWindowBovenlichtDefault(on)
    project.updateActiveFloorDefaults({ windowBovenlichtDefault: on }, { syncUi: false })
  }

  function downloadProjectFml(): void {
    // Dirty hoogte/dikte meenemen zonder canvas-edits te wissen (bovenlicht is live).
    if (fml.fmlLimitsDirty.value) {
      fml.syncAppliedFromDraft()
    }
    const plan = project.buildMergedProjectPlan()
    if (!plan) {
      setLocalError(tGlobal('project.errors.noFloorReadyForFml'))
      return
    }
    // Bron van waarheid = floor.defaults (schrijft FmlPanel write-through + project-setup).
    // Live UI alleen als fallback wanneer floor-meta niet matcht (niet actieve-floor override:
    // underlay-reset wist UI naar false terwijl defaults true konden blijven).
    const floorsMeta = project.projectFloors.value
    const liveBovenlicht = fml.fmlBovenlichtDefault.value
    const liveWindowBovenlicht = fml.fmlWindowBovenlichtDefault.value
    const liveBovenlichtHeight = fml.fmlBovenlichtHeightCm.value
    const liveBovenlichtGap = fml.fmlBovenlichtGapCm.value
    const text = buildFmlV3(plan, {
      name: plan.name,
      bovenlichtDefault: (floor) => {
        const meta = floorsMeta.find((f) => f.level === floor.level && f.name === floor.name)
        if (!meta) return liveBovenlicht
        return meta.defaults.bovenlichtDefault === true
      },
      windowBovenlichtDefault: (floor) => {
        const meta = floorsMeta.find((f) => f.level === floor.level && f.name === floor.name)
        if (!meta) return liveWindowBovenlicht
        return meta.defaults.windowBovenlichtDefault === true
      },
      bovenlichtHeightCm: (floor) => {
        const meta = floorsMeta.find((f) => f.level === floor.level && f.name === floor.name)
        if (!meta) return liveBovenlichtHeight
        return meta.defaults.bovenlichtHeightCm
      },
      bovenlichtGapCm: (floor) => {
        const meta = floorsMeta.find((f) => f.level === floor.level && f.name === floor.name)
        if (!meta) return liveBovenlichtGap
        return meta.defaults.bovenlichtGapCm
      },
    })
    setLocalError(null)
    downloadFml(text, `${sanitizeFilename(plan.name)}.fml`)
  }

  const facade = assembleWorkspaceFacadeReturn({
    canvasRef,
    imageSrc,
    imageName,
    drawingProfileId,
    profileConfirmed,
    activeDrawingProfile,
    referenceWallThicknessPx,
    wallRefThicknessMeasures,
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
    bakeOcrIntoInk,
    clearOcrWithFaceRefresh,
    ocr,
    flow,
    resetWorkspace,
    pdfUpload,
    devSession,
    gapsInkMode,
    gapsInkModeManual,
    setGapsInkModeManual,
  })

  return {
    ...facade,
    applyUserViewerSettings,
    onConfirmScale: () => {
      scaleUi.onConfirmScale()
      if (!scale.confirmed.value) return
      // Duurzame PNG — nooit blob:-URL (die wordt revoked bij crop/nieuwe upload).
      const img = originalImageEl.value
      if (!img?.complete || img.naturalWidth <= 0) return
      try {
        const durableSrc = imageElementToPngDataUrl(img)
        project.ensureSourceUnderlay({
          src: durableSrc,
          name: imageName.value ?? 'onderlegger.png',
          scale: {
            state: scale.state.value ? { ...scale.state.value } : undefined,
            distanceMmX: scale.distanceMmX.value,
            distanceMmY: scale.distanceMmY.value,
            confirmed: scale.confirmed.value,
            ...(scale.confirmedPixelsPerMillimeterX.value != null
              ? { confirmedPixelsPerMillimeterX: scale.confirmedPixelsPerMillimeterX.value }
              : {}),
            ...(scale.confirmedPixelsPerMillimeterY.value != null
              ? { confirmedPixelsPerMillimeterY: scale.confirmedPixelsPerMillimeterY.value }
              : {}),
          },
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        setLocalError(tGlobal('input.errors.couldNotSaveProjectSource', { message }))
      }
    },
    projectMeta: project.projectMeta,
    projectFloors: project.projectFloors,
    activeFloorId: project.activeFloorId,
    activeFloor: project.activeFloor,
    sourceUnderlay: project.sourceUnderlay,
    activeFloorDefaults: project.activeFloorDefaults,
    canProceedFromProject: project.canProceedFromProject,
    canReuseUnderlay: project.canReuseUnderlay,
    underlayDonorOptions: computed(() => project.listUnderlayDonorFloors()),
    canCopyPreprocessRefs: project.canCopyPreprocessRefs,
    preprocessDonorOptions: computed(() => project.listPreprocessDonorFloors()),
    switchingFloor: project.switchingFloor,
    resumeCandidate,
    resumePersistedProject,
    discardPersistedProject,
    updateProjectMeta: project.updateProjectMeta,
    updateActiveFloorDefaults: project.updateActiveFloorDefaults,
    resetActiveFloorDefaults: project.resetActiveFloorDefaults,
    switchFloor: project.switchFloor,
    addFloor: project.addFloor,
    removeFloor: project.removeFloor,
    renameFloor: project.renameFloor,
    reorderFloors: project.reorderFloors,
    reuseUnderlayFromProject: (donorFloorId: string) =>
      project.reuseUnderlayFromProject(donorFloorId),
    copyPreprocessAndRefsFromDonor: (donorFloorId: string) =>
      project.copyPreprocessAndRefsFromDonor(donorFloorId),
    setFmlBovenlichtDefault,
    setFmlWindowBovenlichtDefault,
    setFmlNulpuntImageCm: (point: { x: number; y: number } | null) =>
      fml.setFmlNulpuntImageCm(point),
    updatePreviewPlan: fml.updatePreviewPlan,
    downloadProjectFml,
    // Muurstempel (stap 2)
    wallStampActive: wallStamp.active,
    wallStampBaked: wallStamp.baked,
    wallStampBands: wallStamp.bands,
    wallStampBounds: wallStamp.bounds,
    wallStampPreviewUrl: wallStamp.previewUrl,
    wallStampGumMode: wallStamp.gumMode,
    wallStampBrushRadius: wallStamp.brushRadius,
    wallStampBusy: wallStamp.busy,
    wallStampError: wallStamp.error,
    wallStampHasInk: wallStamp.hasStamp,
    wallStampDonorFloorId: wallStamp.donorFloorId,
    canStartWallStamp: computed(() => project.listStampDonorFloors().length > 0),
    wallStampDonorOptions: computed(() => project.listStampDonorFloors()),
    /** Canvas: polygoon-gum tijdens stempel-mode (stap 2). */
    wallStampCanvasPolygonMode: computed(() =>
      wallStamp.active.value && wallStamp.gumMode.value === 'polygon' ? ('erase' as const) : null,
    ),
    wallStampCanvasEraserEnabled: computed(
      () => wallStamp.active.value && wallStamp.gumMode.value === 'brush',
    ),
    startWallStamp: (donorFloorId: string) => {
      const donor = project.getStampDonorWalls(donorFloorId)
      if (!donor) {
        setLocalError(tGlobal('preprocess.stampErrors.noFmlWalls'))
        return false
      }
      return wallStamp.beginFromDonor({
        donorFloorId,
        walls: donor.walls,
        originCm: donor.originCm,
      })
    },
    setWallStampBands: wallStamp.setBands,
    setWallStampBounds: wallStamp.setBounds,
    setWallStampGumMode: (mode: 'off' | 'brush' | 'polygon') => {
      wallStamp.gumMode.value = mode
    },
    setWallStampBrushRadius: (radius: number) => {
      wallStamp.brushRadius.value = Math.max(1, Math.round(radius))
    },
    applyWallStampBrushErase: wallStamp.applyBrushErase,
    applyWallStampPolygonErase: wallStamp.applyPolygonErasePoints,
    bakeWallStamp: wallStamp.bake,
    cancelWallStamp: wallStamp.cancelActive,
    clearWallStamp: wallStamp.clear,
    serializeWallStamp: wallStamp.serialize,
    hydrateWallStamp: wallStamp.hydrate,
  }
}
