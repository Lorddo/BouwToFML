import { ref, computed, watch, onMounted } from 'vue'
import { tally } from '@/core/diagnostics'
import { renderPdfPageFromBytes, useImageUpload, type PdfUnderlaySource } from '@/platform/upload'
import { imageElementToPngDataUrl } from '@/platform/dev-workspace/image-capture'
import { useExampleSelection } from '@/platform/selection'
import {
  addThicknessToCatalog,
  catalogFromLegacyLimits,
  FACTORY_THICKNESS_CMS,
  limitsFromCatalog,
  normalizeThicknessCatalog,
} from '@/core/plan/wall-thickness-catalog'
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
import { useWorkspacePlan } from './useWorkspacePlan'
import {
  createEditorSessionUndo,
  type EditorSessionUndoSnapshot,
} from './editor/editor-session-undo'
import { cloneUnderlayOriginLayout } from '@/core/plan/drawing-to-underlay-layout'
import { useWorkspacePipeline } from './workspace/useWorkspacePipeline'
import { useWorkspaceScale } from './workspace/useWorkspaceScale'
import { useWorkspaceRoomPipeline } from './workspace/useWorkspaceRoomPipeline'
import { useWorkspaceFlow } from './workspace/useWorkspaceFlow'
import { useWorkspaceOcr } from './workspace/useWorkspaceOcr'
import { bakeOcrMaskIntoInkOverlay } from '@/cv/preprocess/compose-wall-bw'
import { useWorkspaceDevSession } from './workspace/useWorkspaceDevSession'
import { useWorkspaceWallPipeline } from './workspace/useWorkspaceWallPipeline'
import type { WorkspaceFlowStep } from './workspace/constants'
import { PLAN_AREA_SURFACE_EDIT_VISIBLE } from './workspace/constants'
import { useWorkspaceDebugProbeFromContext } from './workspace/useWorkspaceDebugProbe'
import { useWorkspacePdfUpload } from './workspace/useWorkspacePdfUpload'
import { useWorkspaceLifecycle } from './workspace/useWorkspaceLifecycle'
import { useWorkspaceLayerToggles } from './workspace/useWorkspaceLayerToggles'
import { useWorkspaceToolbelt } from './workspace/useWorkspaceToolbelt'
import { buildWorkspaceDevSessionDeps } from './workspace/buildWorkspaceDevSessionDeps'
import { buildWorkspaceRoomPipelineDeps } from './workspace/buildWorkspaceRoomPipelineDeps'
import { useWorkspacePreprocessWiring } from './workspace/useWorkspacePreprocessWiring'
import { useWallStamp } from './workspace/useWallStamp'
import { expandUnderlayForStamp } from './workspace/expand-underlay-for-stamp'
import { useWorkspaceGapsFaces } from './workspace/useWorkspaceGapsFaces'
import { useWorkspaceDoorSwingFaces } from './workspace/useWorkspaceDoorSwingFaces'
import { useWorkspaceWindowFaces } from './workspace/useWorkspaceWindowFaces'
import { assembleWorkspaceFacadeReturn } from './workspace/assembleWorkspaceFacadeReturn'
import { useGapsInkModePersistence } from './workspace/useGapsInkModePersistence'
import { hasPendingInputRotation, totalInputRotationDeg } from '@/platform/canvas/rotationPreview'
import { useWorkspaceProject } from './project/useWorkspaceProject'
import { resolveBlobSourceToWorking } from './project/attach-workspace-underlay'
import {
  compactInputRotation,
  snapshotSourceUnderlayReuse,
  type ReuseUnderlayLoadOptions,
} from './project/reuse-underlay-pdf'
import { loadUserSettings } from './settings/user-settings'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { factoryRoomTypeColor } from '@/core/plan/roomtype-catalog'
import { loadWallThicknessLimits } from '@/core/plan/wall-thickness-limits'
import {
  deleteProject,
  listProjectIndex,
  loadProject,
  type PersistedProjectIndexEntry,
} from '@/platform/project-store'
import { downloadFml, downloadText } from '@/core/fml/downloadFml'
import {
  createPlgDocument,
  toPlgFloorDefaults,
  writePlg,
  type PlgSettings,
} from '@/core/plg/plg-document'
import { clonePlain } from '@/platform/dev-workspace'
import type { FloorPlan } from '@/core/plan/types'
import {
  applyInputRotationToTransform,
  hasBakeRotation,
  identitySourceToWorkingTransform,
  resolveSourceUnderlayLayout,
} from '@/core/plan/source-underlay-transform'
import { promptPlanExportFormat } from '@/ui/composables/plan-chrome-dialog'
import { getConfiguredAccessPassword } from '@/ui/access-gate'
import {
  ensurePlanUnderlaysUploaded,
  isHttpsDrawingUrl,
  pngBytesFromUnderlaySrc,
  uploadPlanUnderlayBytes,
} from '@/platform/underlay-upload'
import { sanitizeFilename } from './workspace/workspace-plan-generate'
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
  const templateTab = ref<TemplateTab>('walls')
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
    updateRectWallThicknessCm,
    startDraw,
    updateDraw,
    endDraw,
    cancelDraw,
    pendingWallThicknessCm,
    setPendingWallThicknessCm,
  } = useExampleSelection(undefined, {
    getThicknessCatalog: () => getThicknessCatalogCms(),
  })

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
    imageWidth: () => originalImageEl.value?.naturalWidth ?? 0,
    imageHeight: () => originalImageEl.value?.naturalHeight ?? 0,
    pxPerMmX: () => scale.pixelsPerMillimeterX.value,
    pxPerMmY: () => scale.pixelsPerMillimeterY.value,
    onStampBwChanged: () => {
      void wallBw.composeAndPublish()
      void preprocessUi.publishWallBwUnderlay()
    },
    onBakeNulpunt: (nulpunt) => {
      // Zaai current nulpunt alleen als leeg; bakeNulpuntImageCm zit in wallStamp.
      if (planApi && planApi.planNulpuntImageCm.value == null) {
        planApi.setPlanNulpuntImageCm(nulpunt)
      }
    },
  })
  /** Stap-2: Stempelset van donor gebruiken wanneer beschikbaar (default aan). */
  const wallStampUseStampSet = ref(true)
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

  const initialViewer = loadUserSettings().planDisplay
  const initialConversion = loadUserSettings().openingMerge
  const underlayOpacityPct = ref(initialViewer.underlayOpacityPct)
  /** FML-geometrie opacity in de viewer (percent 0–100). */
  const contentOpacityPct = ref(initialViewer.contentOpacityPct)
  /** Sesssie-only: kamer-/FML-labels verbergen (niet in user-settings). */
  const hidePlanText = ref(false)
  /** Viewport-vast hulpraster op stap 1–3 canvas. */
  const showCanvasGrid = ref(initialViewer.showCanvasGrid !== false)
  const mergeDoubleDoors = ref(initialConversion.mergeDoubleDoors)
  const mergeMultiWindows = ref(initialConversion.mergeMultiWindows)

  function applyUserViewerSettings(): void {
    const settings = loadUserSettings()
    underlayOpacityPct.value = settings.planDisplay.underlayOpacityPct
    contentOpacityPct.value = settings.planDisplay.contentOpacityPct
    showCanvasGrid.value = settings.planDisplay.showCanvasGrid !== false
    mergeDoubleDoors.value = settings.openingMerge.mergeDoubleDoors
    mergeMultiWindows.value = settings.openingMerge.mergeMultiWindows
    scaleUi.applyScaleInputUnitFromSettings()
  }
  const activeFloorBlob = computed(
    () => project.projectState.value.blobs[project.activeFloorId.value] ?? null,
  )
  const underlaySrc = computed(() => {
    if (flowStep.value === 'result') {
      return (
        activeFloorBlob.value?.planUnderlay?.src ??
        activeFloorBlob.value?.sourceUnderlay?.src ??
        image.workingImageSrc.value ??
        null
      )
    }
    return image.workingImageSrc.value ?? null
  })
  const underlaySize = computed(() => {
    if (flowStep.value === 'result') {
      const plate = activeFloorBlob.value?.planUnderlay
      if (plate && plate.width > 0 && plate.height > 0) {
        return { width: plate.width, height: plate.height }
      }
    }
    const img = originalImageEl.value
    if (!img?.naturalWidth || !img.naturalHeight) return null
    return { width: img.naturalWidth, height: img.naturalHeight }
  })

  function syncPlanPlate(): void {
    const bake = image.planPlateBake.value
    const plate = image.sourcePlate.value
    const blob = activeFloorBlob.value
    const sourceSrc = plate?.src ?? blob?.sourceUnderlay?.src ?? bake?.plateSrc ?? null
    const plateWidth = plate?.width ?? bake?.plateWidth ?? 0
    const plateHeight = plate?.height ?? bake?.plateHeight ?? 0
    if (!bake?.plateSrc && !(sourceSrc && plateWidth > 0 && plateHeight > 0)) return

    const pending = compactInputRotation(preprocess.value)
    const storedRot = compactInputRotation(blob?.sourceUnderlay?.inputRotation)
    const existing = blob?.sourceToWorking ?? null
    let transform = bake?.sourceToWorking
    if (transform && !hasBakeRotation(transform) && existing && hasBakeRotation(existing)) {
      transform = existing
    }
    if (!transform) {
      const base = existing ?? identitySourceToWorkingTransform(plateWidth, plateHeight)
      transform = applyInputRotationToTransform(base, pending ?? storedRot)
      if (existing && hasBakeRotation(existing) && !hasBakeRotation(transform)) {
        transform = existing
      }
    }
    const inputRotation =
      compactInputRotation({
        rotationDeg: transform.rotationDeg,
        rotate180: transform.rotate180,
      }) ??
      pending ??
      storedRot
    // Alleen een echte hoek schrijven — nooit null over een bestaande rotatie.
    const patchRotation = inputRotation ?? undefined

    if (bake?.plateSrc) {
      project.setPlanPlate({
        planUnderlay: {
          src: bake.plateSrc,
          width: bake.plateWidth,
          height: bake.plateHeight,
        },
        sourceToWorking: transform,
        inputRotation: patchRotation,
      })
    } else {
      project.setPlanPlate({
        planUnderlay: {
          src: sourceSrc!,
          width: plateWidth,
          height: plateHeight,
        },
        sourceToWorking: transform,
        inputRotation: patchRotation,
      })
    }
    void uploadActivePlanPlate()
  }

  async function uploadActivePlanPlate(): Promise<void> {
    const floorId = project.activeFloorId.value
    const plate = project.projectState.value.blobs[floorId]?.planUnderlay
    if (!plate) return
    if (isHttpsDrawingUrl(plate.remoteUrl) || isHttpsDrawingUrl(plate.src)) return
    const bytes = pngBytesFromUnderlaySrc(plate.src)
    if (!bytes) return
    try {
      const url = await uploadPlanUnderlayBytes({
        bytes,
        projectId: project.projectMeta.value.id,
        floorId,
        token: getConfiguredAccessPassword(),
      })
      project.setPlanUnderlayRemoteUrl(floorId, url)
    } catch {
      // Download probeert het opnieuw.
    }
  }

  /** Late-bind: FML na door/window faces (directe refs; geen mirror-watches). */
  let planApi: ReturnType<typeof useWorkspacePlan> | null = null
  let getThicknessCatalogCms = (): number[] => [...FACTORY_THICKNESS_CMS]
  let syncThicknessCmToFloorDefaults: ((cm: number) => void) | null = null
  let writeCatalogToFloorDefaults: ((cms: number[]) => void) | null = null
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
      updateRectWallThicknessCm,
      getWallThicknessLimits: () => {
        if (planApi) {
          return {
            minCm: planApi.planThicknessMinCm.value,
            midCm: planApi.planThicknessMidCm.value,
            maxCm: planApi.planThicknessMaxCm.value,
            thicknessCms: [...planApi.planThicknessCms.value],
          }
        }
        return loadWallThicknessLimits()
      },
      getThicknessCatalog: () => getThicknessCatalogCms(),
      getPxPerMm: () => ({
        x: scale.pixelsPerMillimeterX.value,
        y: scale.pixelsPerMillimeterY.value,
      }),
      addThicknessToCatalog: (cm) => {
        if (!planApi || !(cm > 0)) return
        planApi.setPlanThicknessCms(addThicknessToCatalog(planApi.planThicknessCms.value, cm))
        syncThicknessCmToFloorDefaults?.(cm)
      },
      replaceCatalogThickness: (cms) => {
        if (!planApi) return
        planApi.setPlanThicknessCms(cms)
        writeCatalogToFloorDefaults?.(cms)
      },
      setPendingWallThicknessCm,
      getPendingWallThicknessCm: () => pendingWallThicknessCm.value,
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
          planApi?.resetGeneratedPreview()
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
      getAcceptedDoorHyps: () => doorSwingFacesApi?.getStage2AcceptedHyps() ?? [],
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

  const planName = ref<string | null>(null)
  const floorName = ref<string | null>(null)
  const floorLevel = ref<number | null>(null)
  const floorId = ref<string | null>(null)

  const fml = useWorkspacePlan({
    imageName,
    combinedOutput: pipeline.combinedOutput,
    scale,
    underlaySrc: underlaySrc,
    underlaySize: underlaySize,
    underlayOpacity: underlayOpacityPct,
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
    planName: planName,
    floorName: floorName,
    floorLevel: floorLevel,
    getStampVectorInject: () => {
      if (!wallStamp.baked.value || !wallStamp.skipBandFilter.value) return null
      const bake = wallStamp.bakeNulpuntImageCm.value
      const walls = wallStamp.getFilteredInjectWalls()
      if (!bake || walls.length === 0) return null
      const donorId = wallStamp.donorFloorId.value
      const donor = donorId ? project.getStampDonorWalls(donorId) : null
      return {
        walls,
        bakeNulpuntImageCm: { ...bake },
        facadeLookupPlan: donor?.plan ?? null,
      }
    },
  })
  planApi = fml
  const planPlateLayout = computed(() =>
    resolveSourceUnderlayLayout(
      fml.previewUnderlayLayout.value,
      activeFloorBlob.value ? resolveBlobSourceToWorking(activeFloorBlob.value) : null,
    ),
  )
  watch(
    () => image.sourcePlate.value,
    (plate) => {
      if (!plate) return
      if (activeFloorBlob.value?.planUnderlay?.src) return
      syncPlanPlate()
    },
  )
  watch(
    () => image.planPlateBake.value,
    (bake) => {
      if (!bake) return
      syncPlanPlate()
    },
  )

  async function expandUnderlayForStampIfNeeded() {
    return expandUnderlayForStamp({
      originalImageEl,
      imageName,
      setImageSource,
      image,
      wallStamp,
      wallBw,
      scale,
      rects,
      eraserMask: inputMask.eraserMask,
      ocrMask: inputMask.ocrMask,
      ocrMaskedRegions: inputMask.ocrMaskedRegions,
      getPlanNulpuntImageCm: () => fml.planNulpuntImageCm.value ?? null,
      setPlanNulpuntImageCm: (point) => fml.setPlanNulpuntImageCm(point),
      publishWallBwUnderlay: () => preprocessUi.publishWallBwUnderlay(),
    })
  }

  async function startWallStamp(donorFloorId: string, useStampSet?: boolean): Promise<boolean> {
    const donor = project.getStampDonorWalls(donorFloorId)
    if (!donor) {
      setLocalError(tGlobal('preprocess.stampErrors.noPlanWalls'))
      return false
    }
    const preferStamp =
      (useStampSet ?? wallStampUseStampSet.value) !== false && donor.stampWalls.length > 0
    const walls = preferStamp ? donor.stampWalls : donor.walls
    const ok = wallStamp.beginFromDonor({
      donorFloorId,
      walls,
      originCm: donor.originCm,
      skipBandFilter: preferStamp,
    })
    if (ok) await expandUnderlayForStampIfNeeded()
    return ok
  }

  async function bakeWallStamp(): Promise<boolean> {
    const padResult = await expandUnderlayForStampIfNeeded()
    if (padResult === 'too-large' || padResult === 'failed') return false
    return wallStamp.bake()
  }

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
    projectName: planName,
    floorId: floorId,
    floorName: floorName,
    floorLevel: floorLevel,
    getPreviewPlan: () => fml.previewPlan.value ?? null,
    getGeneratedFmlText: () => fml.buildGeneratedFmlText() ?? '',
    appVersion: '1.0.0',
  })

  const e2eFixture = useWorkspaceE2eFixtureExport({
    imageName,
    tabOutputs,
    scale,
    referenceWallThicknessPx,
    resolvedDoors: doorSwingFaces.resolvedDoors,
    resolvedWindows: windowFaces.resolvedWindows,
    appliedThicknessLimits: fml.appliedThicknessLimits,
    appliedBandBoundaries: fml.appliedBandBoundaries,
    appliedWallHeightCm: fml.appliedWallHeightCm,
    appliedDoorHeightCm: fml.appliedDoorHeightCm,
    appliedWindowHeightCm: fml.appliedWindowHeightCm,
    appliedWindowSillZCm: fml.appliedWindowSillZCm,
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
  let restorePlanDefaultsFromActiveFloor: (() => void) | null = null
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
    restorePlanDefaultsFromActiveFloor: () => restorePlanDefaultsFromActiveFloor?.(),
  })

  let projectSetPdf: ((source: PdfUnderlaySource | null) => void) | null = null
  const pdfUpload = useWorkspacePdfUpload({
    loadFile,
    setImageSource,
    applyNewUnderlayReset: lifecycle.applyNewUnderlayReset,
    setPdfUnderlaySource: (source) => {
      image.setPdfUnderlaySource(source)
      projectSetPdf?.(source)
    },
  })

  async function loadUnderlayWithScale(
    src: string,
    name: string,
    scaleSnapshot?: Parameters<typeof scaleUi.restoreFromSessionSnapshot>[0],
    pdfSource?: PdfUnderlaySource | null,
    reuseOpts?: ReuseUnderlayLoadOptions,
  ): Promise<void> {
    clearRects()
    doorSwingFaces.resetDoorSwingState()
    doorSwingFaces.resetAutoDoorPassGate()
    windowFaces.resetWindowState()
    windowFaces.invalidateAutoWindowPass()
    roomFaces.resetRoomState()
    tabOutputs.value = emptyTabOutputs()
    wallsDetectionComplete.value = false
    image.setPdfUnderlaySource(pdfSource ?? null)
    image.prepareExactImageSrcLoad()
    setImageSource(src, name)
    await image.loadExactWorkingImage(src)
    const rot = reuseOpts?.inputRotation
    preprocess.value = {
      ...preprocess.value,
      rotationDeg: rot?.rotationDeg ?? 0,
      rotate180: rot?.rotate180 ?? false,
      autoRotationDeg: rot?.autoRotationDeg ?? 0,
    }
    // Schaal ná «Rotatie vastzetten»: eerst dezelfde bake, dan de linialen.
    if (reuseOpts?.scaleSpace === 'working' && hasPendingInputRotation(preprocess.value)) {
      await image.bakeInputRotation()
    }
    if (scaleSnapshot) {
      scaleUi.restoreFromSessionSnapshot(scaleSnapshot)
    }
  }

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
    loadUnderlayWithScale,
    loadUnderlayFromPdf: async (pdfSource, name, scaleSnapshot, reuseOpts) => {
      const rendered = await renderPdfPageFromBytes({
        bytes: pdfSource.bytes,
        pageNumber: pdfSource.pageNumber,
        pageRenderScale: pdfSource.pageRenderScale,
      })
      await loadUnderlayWithScale(
        rendered.dataUrl,
        name,
        scaleSnapshot,
        {
          bytes: pdfSource.bytes,
          pageNumber: pdfSource.pageNumber,
          fileName: pdfSource.fileName,
          pageRenderScale: rendered.pageRenderScale,
          pageWidthPx: rendered.pageWidthPx,
          pageHeightPx: rendered.pageHeightPx,
        },
        reuseOpts,
      )
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
    updatePreviewPlan: (plan, layout) => fml.updatePreviewPlan(plan, layout),
    getPlanNulpuntImageCm: () => fml.planNulpuntImageCm.value ?? null,
    setPlanNulpuntImageCm: (point) => fml.setPlanNulpuntImageCm(point),
    getPlanOrient: () => fml.persistOrientState(),
    setPlanOrient: (state) => fml.setPlanOrient(state),
    clearLivePlanCanvas: () => fml.clearLivePlanCanvas(),
    applyPlanDefaultsToUi: (defaults) => {
      fml.hydratePlanWallHeightCm(defaults.wallHeightCm)
      fml.hydratePlanDoorHeightCm(defaults.doorHeightCm)
      fml.hydratePlanWindowHeightCm(defaults.windowHeightCm)
      fml.hydratePlanWindowSillZCm(defaults.windowSillZCm)
      fml.hydratePlanBovenlichtDefault(defaults.bovenlichtDefault)
      fml.hydratePlanWindowBovenlichtDefault(defaults.windowBovenlichtDefault)
      fml.setPlanBovenlichtHeightCm(defaults.bovenlichtHeightCm)
      fml.setPlanBovenlichtGapCm(defaults.bovenlichtGapCm)
      fml.setPlanThicknessCms(
        normalizeThicknessCatalog(
          defaults.thicknessCms ??
            catalogFromLegacyLimits({
              minCm: defaults.thicknessMinCm,
              midCm: defaults.thicknessMidCm,
              maxCm: defaults.thicknessMaxCm,
            }),
        ),
      )
      // Meetbanden blijven uit muur-REF (niet floor-defaults) — anders false dirty na meting.
      // Programmatische sync = geen «gewijzigd»-hint; alleen handmatige PlanPanel-edits.
      fml.syncAppliedFromDraft()
    },
    shouldSkipPersist: () =>
      extraction.running.value || roomFaces.classifyingInFlight.value || devSessionRestoring.value,
    getPdfUnderlaySource: () => image.pdfUnderlaySource.value,
    setPdfUnderlaySource: image.setPdfUnderlaySource,
  })
  projectSetPdf = project.setSourcePdfUnderlay

  restorePlanDefaultsFromActiveFloor = () => project.syncActiveFloorDefaultsToUi()
  // Eerste sync: factory-FML-UI → actieve vloer-/user-defaults (o.a. bovenlicht).
  restorePlanDefaultsFromActiveFloor()
  getThicknessCatalogCms = () =>
    fml.planThicknessCms?.value ? [...fml.planThicknessCms.value] : [...FACTORY_THICKNESS_CMS]
  writeCatalogToFloorDefaults = (cms) => {
    const catalog = normalizeThicknessCatalog(cms)
    const limits = limitsFromCatalog(catalog)
    project.updateActiveFloorDefaults(
      {
        thicknessCms: catalog,
        thicknessMinCm: limits.minCm,
        thicknessMidCm: limits.midCm,
        thicknessMaxCm: limits.maxCm,
      },
      { syncUi: false },
    )
  }
  syncThicknessCmToFloorDefaults = (cm) => {
    if (!(cm > 0)) return
    const current = project.activeFloorDefaults.value
    const existing = normalizeThicknessCatalog(
      current.thicknessCms ??
        catalogFromLegacyLimits({
          minCm: current.thicknessMinCm,
          midCm: current.thicknessMidCm,
          maxCm: current.thicknessMaxCm,
        }),
    )
    writeCatalogToFloorDefaults?.(addThicknessToCatalog(existing, cm))
  }

  const resumeCandidate = ref<PersistedProjectIndexEntry | null>(null)

  const planSessionUndo = createEditorSessionUndo({
    getPlan: () => fml.previewPlan.value,
    getFloorIndex: () => 0,
    getFloorId: () => project.activeFloorId.value,
    apply: (snap: EditorSessionUndoSnapshot) => {
      const targetId = snap.floorId ?? project.activeFloorId.value
      if (targetId && targetId !== project.activeFloorId.value) {
        project.writePreviewPlanToFloorBlob(
          targetId,
          snap.plan,
          'layoutOrigin' in snap ? { layoutOrigin: snap.layoutOrigin ?? null } : undefined,
        )
        void project.switchFloor(targetId)
        return
      }
      if ('layoutOrigin' in snap) {
        const cur = fml.previewUnderlayLayout.value
        const layout = cur
          ? cloneUnderlayOriginLayout({
              ...cur,
              origin: snap.layoutOrigin
                ? { x: snap.layoutOrigin.x, y: snap.layoutOrigin.y }
                : cur.origin,
            })
          : null
        fml.updatePreviewPlan(snap.plan, layout)
        return
      }
      fml.updatePreviewPlan(snap.plan)
    },
  })

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
      planSessionUndo.clearStacks()
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
      planName.value = project.projectMeta.value.name.trim() || null
      floorId.value = project.activeFloor.value?.id ?? null
      floorName.value = project.activeFloor.value?.name ?? null
      floorLevel.value = project.activeFloor.value?.level ?? null
    },
    { immediate: true, deep: true },
  )

  const flow = useWorkspaceFlow({
    flowStep,
    imageSrc,
    running: computed(() => extraction.running.value || roomFaces.classifyingInFlight.value),
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
    commitInputStepImage: async () => {
      await image.commitInputStepImage()
      syncPlanPlate()
    },
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
    hasResultPlan: () => project.hasActiveFloorPlan(),
    hasTemplatesDetection: () => {
      const phase = roomFaces.roomPhase.value
      if (
        phase === 'review' ||
        phase === 'done' ||
        phase === 'finalizing' ||
        phase === 'classifying' ||
        phase === 'recalculating'
      ) {
        return true
      }
      const walls = tabOutputs.value.walls
      return isWallsClassifyOutput(walls) || isWallsOutputFinalized(walls)
    },
    onStartTemplatesDetection: () => {
      // Nieuwe 2→3-run: live preview weg, blob-FML blijft voor 3→4 als classify faalt.
      fml.clearLivePlanCanvas()
    },
    devSessionRestoring,
    onEnterResultStep: async () => {
      await semanticWalls.buildForResultStep()
      // Alleen resume zonder verse finalize: anders kan stale blob-FML een nieuwe generate overschrijven.
      if (!wallsDetectionComplete.value) {
        project.restoreActiveFloorPreviewIfNeeded()
      }
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
    onResultDownload: () => {
      void downloadProjectExport()
    },
  })

  function buildWorkspacePlgSettings(): PlgSettings {
    const settings = loadUserSettings()
    const catalog = project.mergedThicknessCatalog()
    return {
      unitSystem: settings.unitSystem,
      scaleInputUnit: settings.scaleInputUnit,
      planDisplayStyle: settings.planDisplay.planDisplayStyle ?? 'editor',
      showCanvasGrid: settings.planDisplay.showCanvasGrid !== false,
      defaults: toPlgFloorDefaults({
        ...project.activeFloorDefaults.value,
        thicknessCms: catalog,
      }),
    }
  }

  async function prepareExportedProjectPlan(): Promise<FloorPlan | null> {
    if (fml.planLimitsDirty.value) {
      fml.syncAppliedFromDraft()
    }
    const plan = project.buildMergedProjectPlan()
    if (!plan) {
      setLocalError(tGlobal('project.errors.noFloorReadyForPlan'))
      return null
    }
    try {
      const plateSrcs = project.projectFloors.value.map((floor) => {
        const blob = project.projectState.value.blobs[floor.id]
        return blob?.planUnderlay?.src ?? blob?.sourceUnderlay?.src ?? null
      })
      const uploaded = await ensurePlanUnderlaysUploaded(plan, {
        projectId: project.projectMeta.value.id,
        floorIds: project.projectFloors.value.map((f) => f.id),
        token: getConfiguredAccessPassword(),
        plateSrcs,
      })
      for (const { floorIndex, url } of uploaded.urls) {
        const floorId = project.projectFloors.value[floorIndex]?.id
        if (floorId) project.setPlanUnderlayRemoteUrl(floorId, url)
      }
      return uploaded.plan
    } catch {
      return plan
    }
  }

  async function downloadProjectPlg(): Promise<void> {
    const plan = await prepareExportedProjectPlan()
    if (!plan) return
    const meta = project.projectMeta.value
    const doc = createPlgDocument({
      project: { id: meta.id, name: meta.name || plan.name, address: meta.address },
      settings: buildWorkspacePlgSettings(),
      plan,
    })
    setLocalError(null)
    downloadText(writePlg(doc), `${sanitizeFilename(plan.name)}.plg`, 'application/json')
  }

  async function downloadProjectExport(): Promise<void> {
    const format = await promptPlanExportFormat()
    if (format === 'plg') await downloadProjectPlg()
    else if (format === 'fml') await downloadProjectFml()
  }

  function resetWorkspace() {
    planSessionUndo.clearStacks()
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

  async function setPlanWallHeightCm(value: number): Promise<void> {
    const applied = await fml.setPlanWallHeightCm(value)
    if (!applied) return
    const wallPatch = { wallHeightCm: Math.round(value) }
    if (applied === 'project') project.updateAllFloorDefaults(wallPatch, { syncUi: false })
    else project.updateActiveFloorDefaults(wallPatch, { syncUi: false })
  }

  async function setPlanDoorHeightCm(value: number): Promise<void> {
    const applied = await fml.setPlanDoorHeightCm(value)
    if (!applied) return
    const patch = { doorHeightCm: Math.round(value) }
    if (applied === 'project') project.updateAllFloorDefaults(patch, { syncUi: false })
    else project.updateActiveFloorDefaults(patch, { syncUi: false })
  }

  async function setPlanWindowHeightCm(value: number): Promise<void> {
    const applied = await fml.setPlanWindowHeightCm(value)
    if (!applied) return
    const patch = { windowHeightCm: Math.round(value) }
    if (applied === 'project') project.updateAllFloorDefaults(patch, { syncUi: false })
    else project.updateActiveFloorDefaults(patch, { syncUi: false })
  }

  async function setPlanWindowSillZCm(value: number): Promise<void> {
    const applied = await fml.setPlanWindowSillZCm(value)
    if (!applied) return
    const patch = { windowSillZCm: Math.round(value) }
    if (applied === 'project') project.updateAllFloorDefaults(patch, { syncUi: false })
    else project.updateActiveFloorDefaults(patch, { syncUi: false })
  }

  /**
   * PlanPanel-checkbox → overwrite-confirm op live plan + actieve vloer-defaults.
   * Zonder write-through bleef project-download op defaults.bovenlichtDefault=false.
   */
  async function setPlanBovenlichtDefault(value: boolean): Promise<void> {
    const on = value === true
    const applied = await fml.setPlanBovenlichtDefault(on)
    if (!applied) return
    const patch = { bovenlichtDefault: on }
    if (applied === 'project') project.updateAllFloorDefaults(patch, { syncUi: false })
    else project.updateActiveFloorDefaults(patch, { syncUi: false })
  }

  async function setPlanWindowBovenlichtDefault(value: boolean): Promise<void> {
    const on = value === true
    const applied = await fml.setPlanWindowBovenlichtDefault(on)
    if (!applied) return
    const patch = { windowBovenlichtDefault: on }
    if (applied === 'project') project.updateAllFloorDefaults(patch, { syncUi: false })
    else project.updateActiveFloorDefaults(patch, { syncUi: false })
  }

  function exportMergedProjectPlan(): { plan: FloorPlan; thicknessCms: number[] } | null {
    if (fml.planLimitsDirty.value) {
      fml.syncAppliedFromDraft()
    }
    const plan = project.buildMergedProjectPlan()
    if (!plan) {
      setLocalError(tGlobal('project.errors.noFloorReadyForPlan'))
      return null
    }
    setLocalError(null)
    return {
      plan: clonePlain(plan),
      thicknessCms: project.mergedThicknessCatalog(),
    }
  }

  async function downloadProjectFml(): Promise<void> {
    const plan = await prepareExportedProjectPlan()
    if (!plan) return
    const text = buildFmlV3(plan, {
      name: plan.name,
      useMetric: loadUserSettings().unitSystem === 'metric',
      ...(PLAN_AREA_SURFACE_EDIT_VISIBLE ? {} : { forceAreaFillColor: factoryRoomTypeColor(0) }),
    })
    setLocalError(null)
    downloadFml(text, `${sanitizeFilename(plan.name)}.fml`)
  }

  const facade = assembleWorkspaceFacadeReturn({
    canvasRef,
    imageSrc,
    imageName,
    profileConfirmed,
    activeDrawingProfile,
    referenceWallThicknessPx,
    wallRefThicknessMeasures,
    wallPipelineVersion,
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
    pendingWallThicknessCm,
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
    underlayOpacityPct,
    contentOpacityPct,
    hidePlanText,
    showCanvasGrid,
    underlaySrc,
    underlaySize,
    planPlateLayout,
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
    planSessionUndo,
    regeneratePlan: () => {
      planSessionUndo.clearStacks()
      fml.regeneratePlan()
    },
    resetGeneratedPreview: () => {
      planSessionUndo.clearStacks()
      fml.resetGeneratedPreview()
    },
    clearImportedFml: () => {
      planSessionUndo.clearStacks()
      fml.clearImportedFml()
    },
    applyUserViewerSettings,
    onConfirmScale: () => {
      scaleUi.onConfirmScale()
      if (!scale.confirmed.value) return
      // Duurzame bronplaat — niet de gecropte werkplaat ná bake.
      const plate = image.sourcePlate.value
      const img = originalImageEl.value
      const durableSrc = plate?.src ?? (img?.complete ? imageElementToPngDataUrl(img) : null)
      if (!durableSrc) return
      try {
        const reuseSnap = snapshotSourceUnderlayReuse({
          preprocess: preprocess.value,
          sourceToWorking:
            image.planPlateBake.value?.sourceToWorking ??
            activeFloorBlob.value?.sourceToWorking ??
            null,
          storedInputRotation: activeFloorBlob.value?.sourceUnderlay?.inputRotation ?? null,
        })
        project.ensureSourceUnderlay(
          {
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
            inputRotation: reuseSnap.inputRotation,
            scaleSpace: reuseSnap.scaleSpace,
          },
          image.pdfUnderlaySource.value,
        )
        syncPlanPlate()
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        setLocalError(tGlobal('input.errors.couldNotSaveProjectSource', { message }))
      }
    },
    projectMeta: project.projectMeta,
    projectFloors: project.projectFloors,
    activeFloorId: project.activeFloorId,
    activeFloor: project.activeFloor,
    activeFloorDefaults: project.activeFloorDefaults,
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
    setPlanBovenlichtDefault,
    setPlanWindowBovenlichtDefault,
    setPlanWallHeightCm,
    setPlanDoorHeightCm,
    setPlanWindowHeightCm,
    setPlanWindowSillZCm,
    setPlanNulpuntImageCm: (point: { x: number; y: number } | null) =>
      fml.setPlanNulpuntImageCm(point),
    updatePreviewPlan: fml.updatePreviewPlan,
    downloadProjectFml,
    downloadProjectPlg,
    exportMergedProjectPlan,
    applyProjectMirrorVertical: () => {
      const count = project.applyProjectMirrorVertical()
      if (count === 0) {
        setLocalError(tGlobal('project.errors.noFloorReadyForPlan'))
        return false
      }
      return true
    },
    hasAnyFloorPlan: computed(() => project.hasAnyFloorPlan()),
    projectOrientFlipX: computed(() => project.projectOrientFlipXActive()),
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
    wallStampBakedInjectCount: wallStamp.bakedInjectCount,
    wallStampDonorFloorId: wallStamp.donorFloorId,
    wallStampUseStampSet,
    /** Stempelset: geen resize-handles (alleen sleep). */
    wallStampAllowResize: computed(() => !wallStamp.skipBandFilter.value),
    canStartWallStamp: computed(() => project.listStampDonorFloors().length > 0),
    wallStampDonorOptions: computed(() => project.listStampDonorFloors()),
    /** Canvas: polygoon-gum tijdens stempel-mode (stap 2). */
    wallStampCanvasPolygonMode: computed(() =>
      wallStamp.active.value && wallStamp.gumMode.value === 'polygon' ? ('erase' as const) : null,
    ),
    wallStampCanvasEraserEnabled: computed(
      () => wallStamp.active.value && wallStamp.gumMode.value === 'brush',
    ),
    startWallStamp,
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
    bakeWallStamp,
    cancelWallStamp: wallStamp.cancelActive,
    clearWallStamp: wallStamp.clear,
  }
}
