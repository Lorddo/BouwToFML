import type { Ref } from 'vue'
import type { OcrTextCandidate } from '@/core/extraction'
import type { PreprocessConfig } from '@/platform/image'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { DrawingProfileId } from '@/platform/profile'
import type { WallPipelineVersion } from '@/platform/wall-pipeline-version'
import type { ResultViewTab, TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { TemplateTab, PreprocessPanelLayer } from '@/cv/preprocess/layer-preprocess'
import { serializeFaceOverrides, serializePinnedRoots } from '@/cv/walls/rooms/room-raster-cache'
import type { DevWallReferenceRect } from '@/platform/dev-workspace/types'
import type { ElementClass, SelectionRect } from '@/platform/selection/types'
import type { WorkspaceFlowStep } from './constants'
import type { RoomPhase } from './useWorkspaceRoomFaces'
import type { UseWorkspaceDevSessionDeps } from './useWorkspaceDevSession'
import type { useWorkspaceScale } from './useWorkspaceScale'

export type WorkspaceDevSessionDeps = UseWorkspaceDevSessionDeps

export function buildWorkspaceDevSessionDeps(ctx: {
  imageName: Ref<string | null>
  setImageSource: (src: string, name: string) => void
  originalImageEl: Ref<HTMLImageElement | null>
  preprocess: Ref<PreprocessConfig>
  drawingProfileId: Ref<DrawingProfileId>
  wallPipelineVersion: Ref<WallPipelineVersion>
  scale: ReturnType<typeof useHScaleCalibration>
  scaleUi: Pick<
    ReturnType<typeof useWorkspaceScale>,
    'resetScaleFull' | 'restoreFromSessionSnapshot'
  >
  inputMask: {
    eraserMask: Ref<Uint8Array | null>
    eraserTouched: Ref<boolean>
    ocrMask: Ref<Uint8Array | null>
    ocrMaskedRegions: Ref<OcrTextCandidate[]>
    hydrateMaskState: WorkspaceDevSessionDeps['hydrateMaskState']
    refreshMaskedWorkingImage: () => void
  }
  inkEdit: {
    resetInkEdit: () => void
  }
  wallBw: {
    serializeInkOverlay: () => number[] | null
    hydrateInkOverlay: (runs: number[] | null | undefined, width: number, height: number) => void
    rebuildBaseWallBw: (options?: { force?: boolean }) => Promise<boolean>
    composeAndPublish: (options?: { includeOcr?: boolean }) => Promise<string | null>
  }
  serializeWallStamp: () => import('./useWallStamp').WallStampSerialized | null
  hydrateWallStamp: (
    data: import('./useWallStamp').WallStampSerialized | null | undefined,
    width: number,
    height: number,
  ) => void
  image: {
    loadExactWorkingImage: (dataUrl: string) => Promise<HTMLImageElement>
    prepareExactImageSrcLoad: () => void
  }
  flowStep: Ref<WorkspaceFlowStep>
  templateTab: Ref<TemplateTab>
  preprocessTab: Ref<PreprocessPanelLayer>
  resultTab: Ref<ResultViewTab>
  profileConfirmed: Ref<boolean>
  tabOutputs: Ref<TabDetectionOutputs>
  roomFaces: {
    roomPhase: Ref<RoomPhase>
    roomRasterCache: Ref<import('@/cv/walls/rooms/room-raster-cache').RoomRasterCache | null>
    syncFromTabOutputs: () => Promise<void>
    autoClassifyWalls: (force?: boolean) => Promise<boolean>
    finalizeWallDetection: () => Promise<boolean>
    refreshClassificationPreview: () => Promise<void>
  }
  wallsDetectionComplete: Ref<boolean>
  preprocessPreview: { clearPreview: () => void; clearOcrPreview: () => void }
  lifecycle: { clearWorkspaceForSession: () => void }
  preprocessUi: {
    refreshAllDetectionUnderlays: () => Promise<void>
    ensureVectorCacheIfNeeded: () => Promise<void>
  }
  ocr: {
    runOcrScan: () => Promise<void>
    restoreOcrFromRegions: (regions: OcrTextCandidate[]) => void
  }
  semanticWalls: { buildForResultStep: () => Promise<void> }
  fml: {
    updatePreviewPlan: (
      plan: import('@/core/fml/types').FloorPlan,
      layout?: import('@/ui/composables/project/types').PreviewUnderlayLayout | null,
    ) => void
    setFmlNulpuntImageCm: (point: { x: number; y: number } | null) => void
  }
  referenceWallThicknessPx: Ref<number | null>
  wallRefThicknessMeasures: Ref<
    Array<{ band: 'min' | 'mid' | 'max'; thicknessPx: number; rectId?: string }>
  >
  rects: Ref<SelectionRect[]>
  clearRectsByType: (type: ElementClass) => void
  replaceWallRects: (
    walls: Array<{
      x: number
      y: number
      width: number
      height: number
      wallThicknessBand?: 'min' | 'mid' | 'max'
    }>,
  ) => void
  addRect: (rect: Omit<SelectionRect, 'id'>) => void
  detection: {
    roomInkCoverageThreshold: Ref<number>
    setRoomInkCoverageThreshold: (value: number) => void
  }
  devSessionRestoring: Ref<boolean>
  setLocalError: (message: string | null) => void
  doorSwingFaces: {
    markAutoDoorPassApplied: () => void
    resetAutoDoorPassGate: () => void
    refreshDoorSwingOverlayExistingOnly: () => Promise<void>
    refreshDoorSwingFromExistingDoors: () => Promise<void>
    snapResolvedDoorsToWalls: () => void | Promise<void>
  }
  windowFaces: {
    markAutoWindowPassApplied: () => void
    invalidateAutoWindowPass: () => void
    refreshWindowOverlay: () => Promise<void>
    refreshWindowsFromExistingClasses: () => Promise<void>
  }
}): WorkspaceDevSessionDeps {
  return {
    imageName: ctx.imageName,
    setImageSource: ctx.setImageSource,
    originalImageEl: ctx.originalImageEl,
    preprocess: ctx.preprocess,
    drawingProfileId: ctx.drawingProfileId,
    wallPipelineVersion: ctx.wallPipelineVersion,
    scale: ctx.scale,
    scaleUi: ctx.scaleUi,
    eraserMask: ctx.inputMask.eraserMask,
    eraserTouched: ctx.inputMask.eraserTouched,
    ocrMask: ctx.inputMask.ocrMask,
    ocrMaskedRegions: ctx.inputMask.ocrMaskedRegions,
    resetInkEdit: ctx.inkEdit.resetInkEdit,
    serializeInkOverlay: ctx.wallBw.serializeInkOverlay,
    hydrateInkOverlay: ctx.wallBw.hydrateInkOverlay,
    serializeWallStamp: ctx.serializeWallStamp,
    hydrateWallStamp: ctx.hydrateWallStamp,
    rebuildBaseWallBw: ctx.wallBw.rebuildBaseWallBw,
    composeWallBwPublish: async () => {
      await ctx.wallBw.composeAndPublish({ includeOcr: true })
    },
    hydrateMaskState: ctx.inputMask.hydrateMaskState,
    loadExactWorkingImage: ctx.image.loadExactWorkingImage,
    prepareExactImageSrcLoad: ctx.image.prepareExactImageSrcLoad,
    flowStep: ctx.flowStep,
    templateTab: ctx.templateTab,
    preprocessTab: ctx.preprocessTab,
    resultTab: ctx.resultTab,
    profileConfirmed: ctx.profileConfirmed,
    tabOutputs: ctx.tabOutputs,
    roomPhase: ctx.roomFaces.roomPhase,
    wallsDetectionComplete: ctx.wallsDetectionComplete,
    getRoomRasterCache: () => ctx.roomFaces.roomRasterCache.value,
    refreshClassificationPreview: () => ctx.roomFaces.refreshClassificationPreview(),
    clearWorkspaceForSession: ctx.lifecycle.clearWorkspaceForSession,
    refreshMaskedWorkingImage: ctx.inputMask.refreshMaskedWorkingImage,
    refreshAllDetectionUnderlays: ctx.preprocessUi.refreshAllDetectionUnderlays,
    ensureVectorCacheIfNeeded: ctx.preprocessUi.ensureVectorCacheIfNeeded,
    clearPreprocessPreview: () => {
      ctx.preprocessPreview.clearPreview()
      ctx.preprocessPreview.clearOcrPreview()
    },
    syncFromTabOutputs: () => ctx.roomFaces.syncFromTabOutputs(),
    runOcrScan: () => ctx.ocr.runOcrScan(),
    restoreOcrFromRegions: (regions) => ctx.ocr.restoreOcrFromRegions(regions),
    autoClassifyWalls: (force) => ctx.roomFaces.autoClassifyWalls(force),
    finalizeWallDetection: () => ctx.roomFaces.finalizeWallDetection(),
    onEnterResultStep: () => ctx.semanticWalls.buildForResultStep(),
    updatePreviewPlan: (plan, layout) => ctx.fml.updatePreviewPlan(plan, layout),
    setFmlNulpuntImageCm: (point) => ctx.fml.setFmlNulpuntImageCm(point),
    serializeFaceOverrides: () => {
      const cache = ctx.roomFaces.roomRasterCache.value
      return cache ? serializeFaceOverrides(cache) : []
    },
    serializePinnedRoots: () => {
      const cache = ctx.roomFaces.roomRasterCache.value
      return cache ? serializePinnedRoots(cache) : []
    },
    referenceWallThicknessPx: ctx.referenceWallThicknessPx,
    wallRefThicknessMeasures: ctx.wallRefThicknessMeasures,
    rects: ctx.rects,
    restoreWallReferenceRects: (rects: DevWallReferenceRect[]) => {
      ctx.replaceWallRects(
        rects.map((rect) => ({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          ...(rect.wallThicknessBand ? { wallThicknessBand: rect.wallThicknessBand } : {}),
        })),
      )
    },
    restoreOpeningReferenceRects: (rects) => {
      ctx.clearRectsByType('door')
      ctx.clearRectsByType('window')
      for (const rect of rects) {
        ctx.addRect({
          type: rect.type,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          ...(rect.type === 'door' ? { fmlRefId: rect.fmlRefId } : {}),
        })
      }
    },
    roomInkCoverageThreshold: ctx.detection.roomInkCoverageThreshold,
    setRoomInkCoverageThreshold: ctx.detection.setRoomInkCoverageThreshold,
    devSessionRestoring: ctx.devSessionRestoring,
    setLocalError: ctx.setLocalError,
    markAutoDoorPassApplied: () => ctx.doorSwingFaces.markAutoDoorPassApplied(),
    markAutoWindowPassApplied: () => ctx.windowFaces.markAutoWindowPassApplied(),
    resetAutoDoorPassGate: () => ctx.doorSwingFaces.resetAutoDoorPassGate(),
    refreshDoorSwingOverlayExistingOnly: () =>
      ctx.doorSwingFaces.refreshDoorSwingOverlayExistingOnly(),
    refreshDoorSwingFromExistingDoors: () => ctx.doorSwingFaces.refreshDoorSwingFromExistingDoors(),
    invalidateAutoWindowPass: () => ctx.windowFaces.invalidateAutoWindowPass(),
    refreshWindowOverlay: () => ctx.windowFaces.refreshWindowOverlay(),
    refreshWindowsFromExistingClasses: () => ctx.windowFaces.refreshWindowsFromExistingClasses(),
    snapResolvedDoorsToWalls: () => ctx.doorSwingFaces.snapResolvedDoorsToWalls(),
  }
}
