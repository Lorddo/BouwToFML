import type { ComputedRef, Ref } from 'vue'
import type { DrawingProfileId } from '@/platform/profile'
import { detectionPresetForProfile } from '@/platform/profile'
import type { GeometricSignature } from '@/core/extraction/geometric-signature'
import type { ElementClass } from '@/core/extraction/types'
import type { PreprocessConfig } from '@/platform/image'
import type { PreprocessVectorCache } from '@/cv/preprocess/preprocess-vector-cache'
import type { ResultViewTab, TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { SelectionRect } from '@/platform/selection'
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import type { useExtraction } from '../useExtraction'
import type { useOpenCvLoader } from '../useOpenCvLoader'
import type { useWorkspaceFml } from '../useWorkspaceFml'
import type { useWorkspacePreprocess } from './useWorkspacePreprocess'
import type { useWorkspaceRoomPipeline } from './useWorkspaceRoomPipeline'
import type { WorkspaceFlowStep } from './constants'
import type { WallPipelineVersion } from '@/platform/wall-pipeline-version'

export type WorkspaceRoomPipelineDeps = Parameters<typeof useWorkspaceRoomPipeline>[0]

export function buildWorkspaceRoomPipelineDeps(ctx: {
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
  getBaseWallBw?: () => { data: Uint8Array; width: number; height: number } | null
  clearRectsByType: (type: ElementClass) => void
  removeRect: (id: string) => void
  selectRect: (id: string | null) => void
  updateRectBounds: (id: string, bounds: { x: number; y: number; width: number; height: number }) => void
  updateRectFmlRefId: (id: string, fmlRefId: string) => void
  endDraw: () => void
  cancelDraw: () => void
  clearSignatureForRect: (id: string) => void
  pruneSignaturePreview: () => void
  refreshSignaturePreview: () => Promise<void>
  preprocessUi: Pick<
    ReturnType<typeof useWorkspacePreprocess>,
    'scheduleLivePreprocessPreview' | 'refreshAllDetectionUnderlays' | 'refreshLayerUnderlayPreview'
  >
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
  fml: Pick<ReturnType<typeof useWorkspaceFml>, 'resetGeneratedPreview'>
  devSessionRestoring: Ref<boolean>
  applyAutoGapsInkMode?: (mode: import('@/cv/gaps').GapsInkMode) => void
  clearGapsInkModeManual?: () => void
  onDoorFacesDemoted?: () => void | Promise<void>
  onWindowFacesDemoted?: () => void | Promise<void>
  onAfterFinalize?: () => void | Promise<void>
}): WorkspaceRoomPipelineDeps {
  return {
    flowStep: ctx.flowStep,
    resultTab: ctx.resultTab,
    templateTab: ctx.templateTab,
    drawingProfileId: ctx.drawingProfileId,
    profileConfirmed: ctx.profileConfirmed,
    activeDetectionPreset: ctx.activeDetectionPreset,
    preprocess: ctx.preprocess,
    referenceWallThicknessPx: ctx.referenceWallThicknessPx,
    wallPipelineVersion: ctx.wallPipelineVersion,
    tabOutputs: ctx.tabOutputs,
    preprocessVectorCache: ctx.preprocessVectorCache,
    rects: ctx.rects,
    signaturePreview: ctx.signaturePreview,
    activeClass: ctx.activeClass,
    cvLoader: ctx.cvLoader,
    extraction: ctx.extraction,
    scaleConfirmed: ctx.scaleConfirmed,
    getImageEl: ctx.getImageEl,
    ensureScaleInitialized: ctx.ensureScaleInitialized,
    preprocessMaskArgs: ctx.preprocessMaskArgs,
    ensureWallBwReady: ctx.ensureWallBwReady,
    getEffectiveWallBwBytes: ctx.getEffectiveWallBwBytes,
    getBaseWallBw: ctx.getBaseWallBw,
    clearRectsByType: ctx.clearRectsByType,
    removeRect: ctx.removeRect,
    selectRect: ctx.selectRect,
    updateRectBounds: ctx.updateRectBounds,
    updateRectFmlRefId: ctx.updateRectFmlRefId,
    endDraw: ctx.endDraw,
    cancelDraw: ctx.cancelDraw,
    clearSignatureForRect: ctx.clearSignatureForRect,
    pruneSignaturePreview: ctx.pruneSignaturePreview,
    refreshSignaturePreview: ctx.refreshSignaturePreview,
    scheduleLivePreprocessPreview: ctx.preprocessUi.scheduleLivePreprocessPreview,
    refreshAllDetectionUnderlays: ctx.preprocessUi.refreshAllDetectionUnderlays,
    setLocalError: ctx.setLocalError,
    templateElementClass: ctx.templateElementClass,
    selectedRectId: ctx.selectedRectId,
    wallsDetectionComplete: ctx.wallsDetectionComplete,
    wallBwPreviewUrl: ctx.wallBwPreviewUrl,
    showSkeletonLayerB: ctx.showSkeletonLayerB,
    showLayer4: ctx.showLayer4,
    showLayer5: ctx.showLayer5,
    showLayer6: ctx.showLayer6,
    showLayer7: ctx.showLayer7,
    showLayer8: ctx.showLayer8,
    showLayer9: ctx.showLayer9,
    showLayer10: ctx.showLayer10,
    showLayer11: ctx.showLayer11,
    showLayer12: ctx.showLayer12,
    showLayer14: ctx.showLayer14,
    resetFmlPreview: () => ctx.fml.resetGeneratedPreview(),
    refreshWallUnderlayPreview: () => ctx.preprocessUi.refreshLayerUnderlayPreview('walls'),
    devSessionRestoring: ctx.devSessionRestoring,
    applyAutoGapsInkMode: ctx.applyAutoGapsInkMode,
    clearGapsInkModeManual: ctx.clearGapsInkModeManual,
    onDoorFacesDemoted: ctx.onDoorFacesDemoted,
    onWindowFacesDemoted: ctx.onWindowFacesDemoted,
    onAfterFinalize: ctx.onAfterFinalize,
  }
}
