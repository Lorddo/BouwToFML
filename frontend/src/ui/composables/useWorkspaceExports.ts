import type { Ref } from 'vue'
import type { PreprocessConfig } from '@/platform/image'
import type { PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import type { PreprocessPanelLayer } from '@/cv/preprocess/layer-preprocess'
import type { SelectionRect } from '@/platform/selection'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { ExtractionOutput } from '@/core/extraction'
import type { FloorPlan } from '@/core/fml/types'
import type { usePreprocessPreview } from './usePreprocessPreview'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { RoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import type { BoundDoor, OrientedDoor, ResolvedDoorCandidate } from '@/cv/doors'
import type {
  BoundWindow,
  WindowBindRejection,
  WindowAxelStage,
  ResolvedWindowCandidate,
} from '@/cv/windows'
import type { GapsInkMode } from '@/cv/gaps'
import type { WorkspaceFlowStep } from './workspace/constants'
import { createWorkspaceExportUnderlay } from './workspace/workspace-export-underlay'
import { createWorkspaceExportLayerDebug } from './workspace/workspace-export-layer-debug'
import { createWorkspaceExportReferenceAnalysis } from './workspace/workspace-export-reference-analysis'
import { createWorkspaceExportDoorSwingReport } from './workspace/workspace-export-door-swing-report'
import { createWorkspaceExportWindowFaceReport } from './workspace/workspace-export-window-face-report'
import { createWorkspaceExportDiagnosis } from './workspace/workspace-export-diagnosis'

export type UseWorkspaceExportsDeps = {
  imageName: Ref<string | null>
  flowStep: Ref<WorkspaceFlowStep>
  preprocess: Ref<PreprocessConfig>
  preprocessTab: Ref<PreprocessPanelLayer>
  preprocessPreview: ReturnType<typeof usePreprocessPreview>
  /** Composed wall B/W URL (base ⊕ OCR ⊕ ink). */
  effectiveBwUrl?: Ref<string | null>
  tabOutputs: Ref<TabDetectionOutputs>
  combinedOutput: Ref<ExtractionOutput | null>
  scale: ReturnType<typeof useHScaleCalibration>
  rects: Ref<SelectionRect[]>
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  preprocessMaskArgs: () => PreprocessMaskInput
  refreshLayerUnderlayPreview: (layer?: PreprocessPanelLayer) => Promise<void>
  setLocalError: (message: string | null) => void
  roomRasterCache?: Ref<RoomRasterCache | null>
  applyAutoGapsInkMode?: (mode: GapsInkMode) => void
  gapsDemoteStats?: Ref<{
    demotedCount: number
    keptCount: number
    oversizedDemotedCount?: number
    maxRefFaceAreaPx?: number | null
    refFaceAreaCapPx?: number | null
  } | null>
  boundDoors?: Ref<BoundDoor[]>
  resolvedDoors?: Ref<ResolvedDoorCandidate[]>
  orientedDoors?: Ref<OrientedDoor[]>
  boundWindows?: Ref<BoundWindow[]>
  resolvedWindows?: Ref<ResolvedWindowCandidate[]>
  windowBindRejections?: Ref<WindowBindRejection[]>
  getDoorArcFaceIds?: () => ReadonlySet<number>
  windowAxelStage?: Ref<WindowAxelStage>
  referenceWallThicknessPx?: Ref<number | null>
  getBaseWallBw?: () => { data: Uint8Array; width: number; height: number } | null
  projectName?: Ref<string | null>
  floorId?: Ref<string | null>
  floorName?: Ref<string | null>
  floorLevel?: Ref<number | null>
  getPreviewPlan?: () => FloorPlan | null
  getGeneratedFmlText?: () => string
  appVersion?: string
}

export function useWorkspaceExports(deps: UseWorkspaceExportsDeps) {
  const underlay = createWorkspaceExportUnderlay(deps)
  const layerDebug = createWorkspaceExportLayerDebug(deps)
  const referenceAnalysis = createWorkspaceExportReferenceAnalysis(deps)
  const doorSwingReport = createWorkspaceExportDoorSwingReport(deps)
  const windowFaceReport = createWorkspaceExportWindowFaceReport(deps)
  const diagnosis = createWorkspaceExportDiagnosis(deps)

  return {
    downloadUnderlay: underlay.downloadUnderlay,
    downloadPreprocessedUnderlay: underlay.downloadPreprocessedUnderlay,
    downloadUsedWallMask: underlay.downloadUsedWallMask,
    exportExamplesReport: layerDebug.exportExamplesReport,
    exportReferenceAnalysis: referenceAnalysis.exportReferenceAnalysis,
    exportDoorSwingReport: doorSwingReport.exportDoorSwingReport,
    exportWindowFaceReport: windowFaceReport.exportWindowFaceReport,
    exportDiagnosisReport: diagnosis.exportDiagnosisReport,
  }
}
