import type { Ref } from 'vue'
import type { PreprocessConfig } from '@/platform/image'
import type { PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import type { SelectionRect } from '@/platform/selection'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { PreprocessPanelLayer } from '@/cv/preprocess/layer-preprocess'
import type { usePreprocessPreview } from '../usePreprocessPreview'
import type { useHScaleCalibration } from '@/platform/calibration'
import { downloadText } from '@/core/fml/downloadFml'
import { decodeMaskRle } from '@/cv/util/binary-mask-rle'
import { formatCvError } from '@/cv/formatCvError'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { grayMatFromBwBytes } from '@/cv/refs/ref-crop-bw'
import { buildDoorSwingReportHtml } from '@/platform/export/door-swing-report'
import {
  DOOR_FILL_BAND_MAX_RATIO,
  DOOR_FILL_BAND_MIN_RATIO,
  DOOR_SPACE_POLICY,
  analyzeDoorSwingRef,
  attachDoorframesToResolvedDoors,
  orientBoundDoors,
  renderDoorSwingOverlayWithUrlUnderlay,
  resolveDoorSizeBandPx,
  runDoorStagePipeline,
  snapDoorsToWalls,
  filterDoorsByKeptWallMaskContact,
  type BoundDoor,
  type DoorSwingRefBand,
  type OrientedDoor,
} from '@/cv/doors'
import { resolveFloorDual, type RoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import { assertSpacePolicy } from '@/cv/walls/rooms/space-policy-assert'
import { resolveDoorFmlTemplateRefId } from '@/core/fml/types'
import {
  normalizeDoorSwingState,
  resolveDoorRefKind,
  resolvePriorDoorClassification,
} from './useWorkspaceDoorSwingHelpers'
import { downloadDataUrl, exportBasename } from './workspace-export-shared'

export type WorkspaceExportDoorSwingReportDeps = {
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
  gapsDemoteStats?: Ref<{
    demotedCount: number
    keptCount: number
    oversizedDemotedCount?: number
    maxRefFaceAreaPx?: number | null
    refFaceAreaCapPx?: number | null
  } | null>
  boundDoors?: Ref<BoundDoor[]>
  orientedDoors?: Ref<OrientedDoor[]>
  referenceWallThicknessPx?: Ref<number | null>
  getBaseWallBw?: () => { data: Uint8Array; width: number; height: number } | null
}

export function createWorkspaceExportDoorSwingReport(
  deps: WorkspaceExportDoorSwingReportDeps,
) {
  async function exportDoorSwingReport() {
    deps.setLocalError(null)
    try {
      const rawState = deps.tabOutputs.value.walls?.meta?.roomClassifyState
      if (!rawState?.labelsData) {
        throw new Error('Geen roomClassifyState — rond eerst Muren detectie af.')
      }
      const pxPerMmX = deps.scale.pixelsPerMillimeterX.value
      const pxPerMmY = deps.scale.pixelsPerMillimeterY.value
      if (!(pxPerMmX > 0) || !(pxPerMmY > 0)) {
        throw new Error('Schaal ontbreekt — bevestig eerst de schaal op stap 1.')
      }
      const doorRects = deps.rects.value
        .filter((rect) => rect.type === 'door')
        .map((rect) => ({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          fmlRefId: rect.fmlRefId,
        }))
      if (doorRects.length === 0) {
        throw new Error('Geen deur-referenties gevonden — teken eerst deur-vakken in stap 2.')
      }

      await deps.refreshLayerUnderlayPreview('walls')
      const underlayUrl = deps.preprocessPreview.previewUrl.value
      const state = normalizeDoorSwingState(rawState)
      const cv = await waitForOpenCV()
      const img = await deps.getImageEl()
      const baseBw = deps.getBaseWallBw?.() ?? null
      const sharedWallBwMat = baseBw
        ? grayMatFromBwBytes(cv, baseBw.data, baseBw.width, baseBw.height)
        : undefined
      const refBands: DoorSwingRefBand[] = []
      try {
        for (const rect of doorRects) {
          const band = await analyzeDoorSwingRef({
            cv,
            image: img,
            rect,
            preprocess: deps.preprocess.value,
            eraserMask: deps.preprocessMaskArgs().eraserMask ?? undefined,
            sharedWallBwMat,
          })
          if (!band) continue
          const fmlRefId = resolveDoorFmlTemplateRefId(rect.fmlRefId)
          refBands.push({
            ...band,
            fmlRefId,
            kind: resolveDoorRefKind(fmlRefId),
          })
        }
      } finally {
        sharedWallBwMat?.delete()
      }
      if (refBands.length === 0) {
        throw new Error('Geen bruikbare draaiboog-ref gevonden in de deur-vakken.')
      }

      const classificationByLabel = resolvePriorDoorClassification(
        state,
        deps.roomRasterCache?.value ?? null,
      )
      const doorCache = deps.roomRasterCache?.value
      const dual = resolveFloorDual({
        state,
        cache: doorCache,
        classificationByLabel,
      })
      const sizeBand = resolveDoorSizeBandPx(pxPerMmX, pxPerMmY)
      const pipe = runDoorStagePipeline({
        dual,
        cv,
        refBands,
        sizeBand,
        classificationGroupBy: state.classificationGroupBy ?? 'component',
        pxPerMmX,
        pxPerMmY,
        bridgeClassificationByLabel: classificationByLabel,
      })
      const {
        pipeDual,
        detachedParentMap: parentMap,
        stage1Hypotheses,
        stage1Stats,
        stage1Diagnostics,
        stage2Accepted,
        stage2RejectedCount,
        fillResult,
        surroundRejectedCount,
        surroundRejected,
        wallTouchRejectedCount,
        wallTouchRejected,
        angleRescueCount,
        angleRescueDiagnostics,
        resolved: resolvedRaw,
      } = pipe
      // Sticky window-doorframes + cluster-peel (zelfde als live UI na window-pass).
      const resolvedDoors = attachDoorframesToResolvedDoors({
        doors: resolvedRaw,
        labelsData: pipeDual.ink.labelsData,
        width: pipeDual.ink.width,
        height: pipeDual.ink.height,
        parentMap,
        classificationByLabel,
        referenceWallThicknessPx: deps.referenceWallThicknessPx?.value ?? undefined,
      })
      // Prefer live L11/L12 (same snapshot as UI/FML). Re-snap only when live L12 is empty
      // (e.g. export vóór afronden / geen door-faces pass) so the report still has openings.
      const wallsOut = deps.tabOutputs.value.walls
      const maskRle = wallsOut?.roomWallMaskRle
      const segments = wallsOut?.semanticWallGraph?.segments ?? []
      let boundDoors: BoundDoor[] = deps.boundDoors?.value ?? []
      let orientedDoors: OrientedDoor[] = deps.orientedDoors?.value ?? []
      const hasLiveL12 = orientedDoors.length > 0
      if (
        !hasLiveL12 &&
        maskRle &&
        segments.length > 0 &&
        resolvedDoors.length > 0
      ) {
        const wallMask = decodeMaskRle(maskRle)
        const thickness = deps.referenceWallThicknessPx?.value ?? undefined
        const maskFiltered = filterDoorsByKeptWallMaskContact({
          doors: resolvedDoors,
          wallMask,
          labelsData: state.labelsData,
          parentMap: new Map(state.parentMap),
          width: state.width,
          height: state.height,
          referenceWallThicknessPx: thickness,
        })
        const doorsForSnap = maskFiltered.kept
        const snapped =
          doorsForSnap.length > 0
            ? snapDoorsToWalls({
                doors: doorsForSnap,
                wallMask,
                width: state.width,
                height: state.height,
                labelsData: state.labelsData,
                parentMap: new Map(state.parentMap),
                segments,
                referenceWallThicknessPx: thickness,
                classificationByLabel,
              })
            : []
        boundDoors = snapped
        const whiteLabels = pipeDual.white.labelsData
        orientedDoors = orientBoundDoors({
          cv,
          boundDoors: snapped,
          resolvedDoors: doorsForSnap,
          segments,
          whiteLabelsData: whiteLabels,
          whiteParentMap: parentMap,
          width: pipeDual.white.width,
          height: pipeDual.white.height,
        })
      }
      assertSpacePolicy('door overlay', DOOR_SPACE_POLICY.overlayPaint, 'ink')
      const overlaySpace = pipeDual.space(DOOR_SPACE_POLICY.overlayPaint)
      const overlayPng = await renderDoorSwingOverlayWithUrlUnderlay({
        width: overlaySpace.width,
        height: overlaySpace.height,
        labelsData: overlaySpace.labelsData,
        parentMap,
        hypotheses: stage2Accepted,
        underlayUrl,
      })

      const angleRescueAccepted = stage2Accepted.filter((hyp) => hyp.source === 'angle_rescue')
      const fillRejected = fillResult.rejected.map((row) => ({
        id: row.hypothesis.id,
        faceIds: row.hypothesis.faceIds,
        reason: row.reason,
        candidateFill: row.candidateFill,
        refFill: row.refFill,
        minAllowedFill: row.minAllowedFill,
        maxAllowedFill: row.maxAllowedFill,
        unionBBox: row.hypothesis.unionBBox,
        filledAreaPx: row.hypothesis.filledAreaPx,
      }))
      const surroundRejectedRows = surroundRejected.map((row) => ({
        id: row.hypothesis.id,
        faceIds: row.hypothesis.faceIds,
        reason: row.reason,
        unionBBox: row.hypothesis.unionBBox,
      }))
      const wallTouchRejectedRows = wallTouchRejected.map((row) => ({
        id: row.hypothesis.id,
        faceIds: row.hypothesis.faceIds,
        reason: row.reason,
        unionBBox: row.hypothesis.unionBBox,
      }))
      const stage2Payload = {
        minRatio: fillResult.stats.minRatio,
        maxRatio: fillResult.stats.maxRatio,
        acceptedIds: stage2Accepted.map((hyp) => hyp.id),
        rejectedCount: stage2RejectedCount,
        rejectedTooFull: fillResult.stats.rejectedTooFull,
        rejectedTooEmpty: fillResult.stats.rejectedTooEmpty,
        rejectedSurroundedByRoom: surroundRejectedCount,
        rejectedNoWallTouch: wallTouchRejectedCount,
        angleRescueCount,
        fillRejected,
        surroundRejected: surroundRejectedRows,
        wallTouchRejected: wallTouchRejectedRows,
        angleRescueDiagnostics,
        angleRescueAccepted,
      }

      const exportedAtIso = new Date().toISOString()
      const safe = exportBasename(deps.imageName.value, 'deuren-fase1')
      const payload = {
        drawing: deps.imageName.value,
        exportedAtIso,
        scale: { pxPerMmX, pxPerMmY },
        sizeBandPx: sizeBand,
        refBands,
        stats: stage1Stats,
        hypotheses: stage1Hypotheses,
        diagnostics: stage1Diagnostics,
        stage2: stage2Payload,
        fillBandDefaults: {
          minRatio: DOOR_FILL_BAND_MIN_RATIO,
          maxRatio: DOOR_FILL_BAND_MAX_RATIO,
        },
        gapsContext: deps.gapsDemoteStats?.value ?? null,
        resolvedDoors,
        boundDoors,
        orientedDoors,
      }
      downloadText(
        JSON.stringify(payload, null, 2),
        `${safe}-deuren-fase1-report.json`,
        'application/json',
      )
      downloadText(
        buildDoorSwingReportHtml({
          drawing: deps.imageName.value,
          exportedAtIso,
          pxPerMmX,
          pxPerMmY,
          refBands,
          sizeBandPx: sizeBand,
          stats: stage1Stats,
          hypotheses: stage1Hypotheses,
          diagnostics: stage1Diagnostics,
          stage2: stage2Payload,
          gapsContext: deps.gapsDemoteStats?.value ?? null,
          overlayPng,
          resolvedDoors,
          boundDoors,
        }),
        `${safe}-deuren-fase1-report.html`,
        'text/html',
      )
      if (overlayPng) {
        downloadDataUrl(overlayPng, `${safe}-deuren-fase1-overlay.png`)
      }
    } catch (e) {
      deps.setLocalError(formatCvError(e))
    }
  }

  return { exportDoorSwingReport }
}
