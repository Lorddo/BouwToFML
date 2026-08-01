import type { Ref } from 'vue'
import type { PreprocessConfig } from '@/platform/image'
import type { PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import type { SelectionRect } from '@/platform/selection'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { usePreprocessPreview } from '../usePreprocessPreview'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { PreprocessPanelLayer } from '@/cv/preprocess/layer-preprocess'
import { downloadText } from '@/core/fml/downloadFml'
import { formatCvError } from '@/cv/formatCvError'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { buildWindowFaceReportHtml } from '@/platform/export/window-face-report'
import {
  collectWindowAxelRefBands,
  renderWindowOverlayWithUrlUnderlay,
  runWindowStagePipelineWithBands,
  type WindowAxelStage,
} from '@/cv/windows'
import { resolveFloorDual, type RoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import {
  normalizeDoorSwingState,
  resolvePriorDoorClassification,
} from './useWorkspaceDoorSwingHelpers'
import {
  countIntersectingRootsInRect,
  downloadDataUrl,
  exportBasename,
} from './workspace-export-shared'

export type WorkspaceExportWindowFaceReportDeps = {
  imageName: Ref<string | null>
  preprocess: Ref<PreprocessConfig>
  preprocessPreview: ReturnType<typeof usePreprocessPreview>
  tabOutputs: Ref<TabDetectionOutputs>
  scale: ReturnType<typeof useHScaleCalibration>
  rects: Ref<SelectionRect[]>
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  preprocessMaskArgs: () => PreprocessMaskInput
  refreshLayerUnderlayPreview: (layer?: PreprocessPanelLayer) => Promise<void>
  setLocalError: (message: string | null) => void
  roomRasterCache?: Ref<RoomRasterCache | null>
  getDoorArcFaceIds?: () => ReadonlySet<number>
  windowAxelStage?: Ref<WindowAxelStage>
  referenceWallThicknessPx?: Ref<number | null>
  getBaseWallBw?: () => { data: Uint8Array; width: number; height: number } | null
}

export function createWorkspaceExportWindowFaceReport(deps: WorkspaceExportWindowFaceReportDeps) {
  async function exportWindowFaceReport() {
    deps.setLocalError(null)
    try {
      const rawState = deps.tabOutputs.value.walls?.meta?.roomClassifyState
      if (!rawState?.labelsData) {
        throw new Error('Geen roomClassifyState — rond eerst Muren detectie af.')
      }
      const windowRects = deps.rects.value
        .filter((rect) => rect.type === 'window')
        .map((rect) => ({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        }))
      if (windowRects.length === 0) {
        throw new Error('Geen raam-referenties gevonden — teken eerst raam-vakken in stap 2.')
      }

      await deps.refreshLayerUnderlayPreview('walls')
      const underlayUrl = deps.preprocessPreview.previewUrl.value
      const state = normalizeDoorSwingState(rawState)
      const ppm = {
        x: deps.scale.pixelsPerMillimeterX.value,
        y: deps.scale.pixelsPerMillimeterY.value,
      }
      const cv = await waitForOpenCV()
      const img = await deps.getImageEl()
      const refBands = await collectWindowAxelRefBands({
        cv,
        image: img,
        windowRects,
        preprocess: deps.preprocess.value,
        eraserMask: deps.preprocessMaskArgs().eraserMask ?? undefined,
        baseBw: deps.getBaseWallBw?.() ?? undefined,
      })
      if (refBands.length === 0) {
        throw new Error('Geen bruikbare raam-axel-ref gevonden in de raam-vakken.')
      }

      const wallClassification = resolvePriorDoorClassification(
        state,
        deps.roomRasterCache?.value ?? null,
      )
      const cache = deps.roomRasterCache?.value
      const dual = resolveFloorDual({
        state,
        cache,
        classificationByLabel: wallClassification,
      })
      const pipeline = runWindowStagePipelineWithBands({
        dual,
        refBands,
        windowRects,
        ppm,
        doorArcFaceIds: deps.getDoorArcFaceIds?.() ?? new Set<number>(),
        wallThicknessPx: Math.max(0, deps.referenceWallThicknessPx?.value ?? 0),
      })
      const {
        components,
        detachedParentMap,
        stage1: filtered,
        stage2,
        stage3,
        stage3Doorframes,
        stage4: stage4Resolved,
        stage4Doorframes,
      } = pipeline
      const activeStage: WindowAxelStage = deps.windowAxelStage?.value ?? 'stage2'
      const activeHypotheses =
        activeStage === 'stage3'
          ? stage3.kept
          : activeStage === 'stage2'
            ? stage2.kept
            : filtered.hypotheses
      const rejectedFaceIds = new Set<number>()
      const rejectedFaceBBoxes: Array<{ x: number; y: number; width: number; height: number }> = []
      if (activeStage === 'stage1') {
        for (const rejection of filtered.rejections) {
          for (const faceId of rejection.faceIds) {
            if (!(faceId > 0) || rejectedFaceIds.has(faceId)) continue
            rejectedFaceIds.add(faceId)
            if (rejection.faceIds.length === 1) {
              rejectedFaceBBoxes.push({ ...rejection.unionBBox })
            }
          }
        }
      }
      const overlayPng = await renderWindowOverlayWithUrlUnderlay({
        width: state.width,
        height: state.height,
        labelsData: pipeline.pipeDual.ink.labelsData,
        parentMap: detachedParentMap,
        hypotheses: activeHypotheses,
        rejectedFaceIds: activeStage === 'stage1' ? rejectedFaceIds : undefined,
        rejectedFaceBBoxes: activeStage === 'stage1' ? rejectedFaceBBoxes : undefined,
        underlayUrl,
      })
      const byRefStats = new Map(filtered.stats.byRef.map((entry) => [entry.refIndex, entry]))
      const byRefAcceptedCount = new Map<number, number>()
      const byRefRejectedCount = new Map<number, number>()
      for (const hypothesis of filtered.hypotheses) {
        byRefAcceptedCount.set(
          hypothesis.matchedRefIndex,
          (byRefAcceptedCount.get(hypothesis.matchedRefIndex) ?? 0) + 1,
        )
      }
      for (const rejection of filtered.rejections) {
        byRefRejectedCount.set(
          rejection.refIndex,
          (byRefRejectedCount.get(rejection.refIndex) ?? 0) + 1,
        )
      }
      const refProbes = windowRects.map((rect, refIndex) => {
        const refStats = byRefStats.get(refIndex)
        const hasRefBand = refBands.some((ref) => ref.refIndex === refIndex)
        return {
          refIndex,
          rect,
          hasRefBand,
          intersectingRoots: countIntersectingRootsInRect({
            components,
            parentMap: detachedParentMap,
            rect,
          }),
          candidateRoots: refStats?.candidateRoots ?? 0,
          matchedHypotheses: byRefAcceptedCount.get(refIndex) ?? 0,
          rejectedClusters: byRefRejectedCount.get(refIndex) ?? 0,
        }
      })

      const exportedAtIso = new Date().toISOString()
      const safe = exportBasename(deps.imageName.value, 'ramen-stage123')
      const payload = {
        drawing: deps.imageName.value,
        exportedAtIso,
        activeStage,
        refBands,
        stage1Stats: filtered.stats,
        stage2Stats: stage2.stats,
        stage3Stats: stage3.stats,
        stage3DoorframeStats: stage3Doorframes.stats,
        refProbes,
        candidateEvals: filtered.candidateEvals,
        hypotheses: {
          stage1: filtered.hypotheses,
          stage2: stage2.kept,
          stage3: stage3.kept,
          active: activeHypotheses,
        },
        rejections: filtered.rejections,
        stage2DoorframeCandidates: stage2.doorframeCandidates,
        stage3Accepted: stage3.accepted,
        stage3Rejections: stage3.rejected,
        stage3DoorframesAccepted: stage3Doorframes.accepted,
        stage4Resolved,
        stage4Doorframes,
      }
      downloadText(
        JSON.stringify(payload, null, 2),
        `${safe}-ramen-stage123-report.json`,
        'application/json',
      )
      downloadText(
        buildWindowFaceReportHtml({
          drawing: deps.imageName.value,
          exportedAtIso,
          activeStage,
          refBands,
          stage1Stats: filtered.stats,
          stage2Stats: stage2.stats,
          stage3Stats: stage3.stats,
          refProbes,
          hypotheses: {
            stage1: filtered.hypotheses,
            stage2: stage2.kept,
            stage3: stage3.kept,
            active: activeHypotheses,
          },
          rejections: filtered.rejections,
          candidateEvals: filtered.candidateEvals,
          stage2DoorframeCandidates: stage2.doorframeCandidates,
          stage3Accepted: stage3.accepted,
          stage3Rejections: stage3.rejected,
          stage3DoorframesAccepted: stage3Doorframes.accepted,
          stage4Resolved,
          stage4Doorframes,
          overlayPng,
        }),
        `${safe}-ramen-stage123-report.html`,
        'text/html',
      )
      if (overlayPng) {
        downloadDataUrl(overlayPng, `${safe}-ramen-stage123-overlay.png`)
      }
    } catch (e) {
      deps.setLocalError(formatCvError(e))
    }
  }

  return { exportWindowFaceReport }
}
