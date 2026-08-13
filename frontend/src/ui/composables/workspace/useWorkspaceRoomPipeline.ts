import { ref, watch, type ComputedRef, type Ref } from 'vue'
import type { DrawingProfileId } from '@/platform/profile'
import { detectionPresetForProfile } from '@/platform/profile'
import type { ResultViewTab, TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { PreprocessConfig } from '@/platform/image'
import type { PreprocessVectorCache } from '@/cv/preprocess/preprocess-vector-cache'
import type { SelectionRect } from '@/platform/selection'
import type { GeometricSignature } from '@/core/extraction/geometric-signature'
import type { ElementClass } from '@/core/extraction/types'
import type { WorkspaceFlowStep } from './constants'
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import type { useExtraction } from '../useExtraction'
import type { useOpenCvLoader } from '../useOpenCvLoader'
import { useWorkspaceDetection } from './useWorkspaceDetection'
import { useWorkspaceRoomFaces } from './useWorkspaceRoomFaces'
import { useWorkspaceSemanticWalls } from './useWorkspaceSemanticWalls'
import type { WallPipelineVersion } from '@/platform/wall-pipeline-version'

export function useWorkspaceRoomPipeline(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  resultTab: Ref<ResultViewTab>
  templateTab: Ref<TemplateTab>
  drawingProfileId: Ref<DrawingProfileId>
  profileConfirmed: Ref<boolean>
  activeDetectionPreset: ComputedRef<ReturnType<typeof detectionPresetForProfile>>
  preprocess: Ref<PreprocessConfig>
  referenceWallThicknessPx: Ref<number | null>
  wallPipelineVersion: Ref<WallPipelineVersion>
  tabOutputs: Ref<TabDetectionOutputs>
  preprocessVectorCache: Ref<PreprocessVectorCache | null>
  rects: Ref<SelectionRect[]>
  signaturePreview: Ref<Record<string, GeometricSignature>>
  activeClass: Ref<ElementClass | null>
  cvLoader: ReturnType<typeof useOpenCvLoader>
  extraction: ReturnType<typeof useExtraction>
  scaleConfirmed: Ref<boolean>
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  ensureScaleInitialized: (img: HTMLImageElement | HTMLCanvasElement) => void
  preprocessMaskArgs: () => import('@/cv/tools/preparePreprocessMasks').PreprocessMaskInput
  ensureWallBwReady?: () => Promise<boolean>
  getEffectiveWallBwBytes?: () => Uint8Array | null
  getWallStampMask?: () => Uint8Array | null
  getBaseWallBw?: () => { data: Uint8Array; width: number; height: number } | null
  clearRectsByType: (type: ElementClass) => void
  removeRect: (id: string) => void
  selectRect: (id: string | null) => void
  updateRectBounds: (
    id: string,
    bounds: { x: number; y: number; width: number; height: number },
  ) => void
  updateRectFmlRefId: (id: string, fmlRefId: string) => void
  updateRectWallThicknessBand: (
    id: string,
    band: import('@/core/fml/fml-wall-thickness-tiers').FmlThicknessBand,
  ) => void
  /** Project/export diktes voor max-equivalent schaal. */
  getWallThicknessLimits: () => import('@/core/fml/fml-wall-thickness-limits').FmlWallThicknessLimits
  setWallThicknessCm?: (
    band: import('@/core/fml/fml-wall-thickness-tiers').FmlThicknessBand,
    cm: number,
  ) => void
  /** Laatste multi-ref metingen (voor bandgrenzen). */
  wallRefThicknessMeasures: Ref<
    import('@/platform/selection/wall-thickness-ref').WallRefThicknessMeasure[]
  >
  wallThicknessBandBoundariesPx?: Ref<{ midBoundaryPx: number; maxBoundaryPx: number } | null>
  endDraw: () => void
  cancelDraw: () => void
  clearSignatureForRect: (id: string) => void
  pruneSignaturePreview: () => void
  refreshSignaturePreview: () => Promise<void>
  scheduleLivePreprocessPreview: () => void
  refreshAllDetectionUnderlays: () => Promise<void>
  setLocalError: (message: string | null) => void
  templateElementClass: ComputedRef<'wall' | null>
  selectedRectId: Ref<string | null>
  wallsDetectionComplete: Ref<boolean>
  wallBwPreviewUrl: Ref<string | null>
  showSkeletonLayerB: Ref<boolean>
  showLayer4: Ref<boolean>
  showLayer5: Ref<boolean>
  showLayer6: Ref<boolean>
  showLayer7: Ref<boolean>
  showLayer8: Ref<boolean>
  showLayer9: Ref<boolean>
  showLayer10: Ref<boolean>
  showLayer11: Ref<boolean>
  showLayer12: Ref<boolean>
  showLayer14: Ref<boolean>
  resetFmlPreview: () => void
  refreshWallUnderlayPreview: () => Promise<void>
  devSessionRestoring?: Ref<boolean>
  applyAutoGapsInkMode?: (mode: import('@/cv/gaps').GapsInkMode) => void
  clearGapsInkModeManual?: () => void
  onDoorFacesDemoted?: () => void | Promise<void>
  onWindowFacesDemoted?: () => void | Promise<void>
  onAfterFinalize?: (
    setFinalizePhase: (phase: import('./workspace-view-visibility').TemplatesFinalizePhase) => void,
  ) => void | Promise<void>
}) {
  const roomFacesRef = ref<ReturnType<typeof useWorkspaceRoomFaces> | null>(null)

  const detection = useWorkspaceDetection({
    flowStep: deps.flowStep,
    templateTab: deps.templateTab,
    templateElementClass: deps.templateElementClass,
    drawingProfileId: deps.drawingProfileId,
    profileConfirmed: deps.profileConfirmed,
    activeDetectionPreset: deps.activeDetectionPreset,
    preprocess: deps.preprocess,
    referenceWallThicknessPx: deps.referenceWallThicknessPx,
    wallPipelineVersion: deps.wallPipelineVersion,
    tabOutputs: deps.tabOutputs,
    preprocessVectorCache: deps.preprocessVectorCache,
    rects: deps.rects,
    signaturePreview: deps.signaturePreview,
    activeClass: deps.activeClass,
    cvLoader: deps.cvLoader,
    extraction: deps.extraction,
    scaleConfirmed: deps.scaleConfirmed,
    getImageEl: deps.getImageEl,
    ensureScaleInitialized: deps.ensureScaleInitialized,
    preprocessMaskArgs: deps.preprocessMaskArgs,
    ensureWallBwReady: deps.ensureWallBwReady,
    getBaseWallBw: deps.getBaseWallBw,
    clearRectsByType: deps.clearRectsByType,
    removeRect: deps.removeRect,
    selectRect: deps.selectRect,
    updateRectBounds: deps.updateRectBounds,
    updateRectFmlRefId: deps.updateRectFmlRefId,
    updateRectWallThicknessBand: deps.updateRectWallThicknessBand,
    getWallThicknessLimits: deps.getWallThicknessLimits,
    setWallThicknessCm: deps.setWallThicknessCm,
    wallRefThicknessMeasures: deps.wallRefThicknessMeasures,
    wallThicknessBandBoundariesPx: deps.wallThicknessBandBoundariesPx,
    endDraw: deps.endDraw,
    cancelDraw: deps.cancelDraw,
    clearSignatureForRect: deps.clearSignatureForRect,
    pruneSignaturePreview: deps.pruneSignaturePreview,
    refreshSignaturePreview: deps.refreshSignaturePreview,
    scheduleLivePreprocessPreview: deps.scheduleLivePreprocessPreview,
    refreshAllDetectionUnderlays: deps.refreshAllDetectionUnderlays,
    setLocalError: deps.setLocalError,
    applyAutoGapsInkMode: deps.applyAutoGapsInkMode,
    clearGapsInkModeManual: deps.clearGapsInkModeManual,
    onRoomInkThresholdChanged: () => {
      roomFacesRef.value?.onThresholdChanged()
    },
    onRoomPipelineReset: () => {
      roomFacesRef.value?.resetRoomState()
      deps.wallsDetectionComplete.value = false
    },
    onReferenceWallRectReady: async () => {
      if (deps.devSessionRestoring?.value) return
      await deps.refreshWallUnderlayPreview()
      await roomFacesRef.value?.autoclassifyWalls()
    },
  })

  const semanticWalls = useWorkspaceSemanticWalls({ tabOutputs: deps.tabOutputs })

  const roomFaces = useWorkspaceRoomFaces({
    flowStep: deps.flowStep,
    templateTab: deps.templateTab,
    profileConfirmed: deps.profileConfirmed,
    selectedRectId: deps.selectedRectId,
    rects: deps.rects,
    preprocess: deps.preprocess,
    tabOutputs: deps.tabOutputs,
    wallsDetectionComplete: deps.wallsDetectionComplete,
    wallBwPreviewUrl: deps.wallBwPreviewUrl,
    referenceWallThicknessPx: deps.referenceWallThicknessPx,
    cvLoader: deps.cvLoader,
    getImageEl: deps.getImageEl,
    ensureScaleInitialized: deps.ensureScaleInitialized,
    preprocessMaskArgs: deps.preprocessMaskArgs,
    ensureWallBwReady: deps.ensureWallBwReady,
    getEffectiveWallBwBytes: deps.getEffectiveWallBwBytes,
    getWallStampMask: deps.getWallStampMask,
    onExtractTargets: detection.onExtractTargets,
    setStatus: (message) => {
      detection.status.value = message
    },
    onInvalidateResult: () => {
      deps.resetFmlPreview()
      deps.wallsDetectionComplete.value = false
    },
    onFinalizeSuccess: async () => {
      deps.showLayer7.value = false
      deps.showLayer8.value = false
      deps.showLayer9.value = false
      // Alleen laatste laag per detectie standaard aan: muren L10, deuren L12, ramen L14.
      deps.showLayer10.value = true
      deps.showLayer11.value = false
      deps.showLayer12.value = true
      deps.showLayer14.value = true
      deps.resetFmlPreview()
      await semanticWalls.buildAfterFinalize()
      await deps.onAfterFinalize?.((phase) => {
        roomFacesRef.value?.setFinalizePhase(phase)
      })
      roomFacesRef.value?.setFinalizePhase(null)
      deps.resultTab.value = 'vector'
      deps.flowStep.value = 'result'
    },
    onDoorFacesDemoted: deps.onDoorFacesDemoted,
    onWindowFacesDemoted: deps.onWindowFacesDemoted,
    refreshWallUnderlayPreview: deps.refreshWallUnderlayPreview,
  })
  roomFacesRef.value = roomFaces

  watch(
    () =>
      [
        deps.flowStep.value,
        deps.templateTab.value,
        deps.tabOutputs.value.walls?.meta?.roomPipelinePhase,
      ] as const,
    () => {
      void roomFaces.syncFromTabOutputs()
    },
  )

  return { detection, roomFaces, semanticWalls }
}
