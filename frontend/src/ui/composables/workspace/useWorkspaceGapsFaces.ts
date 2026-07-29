/**
 * Stap 3 Gaten: face-overlay met Solid demote (muurvlakken → outside via gapsLayer).
 * Canvas-onderlegger = muur-B/W (zelfde als Muren); gapsLayer alleen tegenaan voor demote.
 */

import { computed, ref, watch, type Ref } from 'vue'
import type { PreprocessConfig } from '@/platform/image'
import { createWorkCanvas } from '@/platform/image'
import type { ExampleSample } from '@/core/extraction'
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import {
  resolveLayerPreprocess,
  usesGapsFaceOverlay,
} from '@/cv/preprocess/layer-preprocess'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import { carveOtsuWhiteIntoGapsMat, runGapsPipeline, resolveMaxOpeningRefFaceAreaPx, type GapsInkMode } from '@/cv/gaps'
import { runPreprocessLayer } from '@/cv/layers/preprocess-layer'
import { buildRoomReferenceMat } from '@/cv/walls/rooms/room-reference-preprocess'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { formatCvError } from '@/cv/formatCvError'
import type { CanvasLike } from '@/cv/port/canvasEnv'
import {
  createRoomRasterCache,
  effectiveClassification,
  updateRoomRasterPreviewMask,
  type RoomRasterCache,
} from '@/cv/walls/rooms/room-raster-cache'
import { extractComponentsFromLabelsData } from '@/cv/walls/rooms/room-raster'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { SelectionRect } from '@/platform/selection'
import { preparePreprocessMasks, type PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import type { WorkspaceFlowStep } from './constants'
import type { RoomPhase } from './useWorkspaceRoomFaces'

function normalizeState(state: SerializedRoomClassifyState): SerializedRoomClassifyState {
  return {
    ...state,
    labelsData:
      state.labelsData instanceof Int32Array ? state.labelsData : new Int32Array(state.labelsData),
    parentMap: [...state.parentMap],
    classificationByLabel: [...state.classificationByLabel],
  }
}

export function useWorkspaceGapsFaces(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  templateTab: Ref<TemplateTab>
  preprocess: Ref<PreprocessConfig>
  tabOutputs: Ref<TabDetectionOutputs>
  roomRasterCache: Ref<RoomRasterCache | null>
  roomPhase: Ref<RoomPhase>
  /** Zelfde muur-B/W als Muren-tab (niet gaps-B/W). */
  wallBwPreviewUrl: Ref<string | null>
  gapsInkMode: Ref<GapsInkMode>
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  preprocessMaskArgs: () => PreprocessMaskInput
  examplesWithSignatures: () => ExampleSample[]
  openingRects: () => SelectionRect[]
  setLocalError: (message: string | null) => void
  referenceWallThicknessPx: Ref<number | null>
  getBaseWallBw?: () => { data: Uint8Array; width: number; height: number } | null
}) {
  const gapsPreviewMaskCanvas = ref<CanvasLike | null>(null)
  const gapsDemoteStats = ref<{
    demotedCount: number
    keptCount: number
    oversizedDemotedCount?: number
    maxRefFaceAreaPx?: number | null
    refFaceAreaCapPx?: number | null
  } | null>(null)
  const refreshing = ref(false)

  const wallsClassifyReady = computed(() => {
    const state = deps.tabOutputs.value.walls?.meta?.roomClassifyState
    return !!state?.labelsData && !!state?.classificationByLabel
  })

  const gapsFacesVisible = computed(
    () =>
      deps.flowStep.value === 'templates' &&
      usesGapsFaceOverlay(deps.templateTab.value) &&
      wallsClassifyReady.value &&
      !!gapsPreviewMaskCanvas.value,
  )

  function onGapsFaceOverlayTab(): boolean {
    return deps.flowStep.value === 'templates' && usesGapsFaceOverlay(deps.templateTab.value)
  }

  function resolvePriorClassification(
    state: SerializedRoomClassifyState,
  ): Map<number, RoomRasterClass> {
    const wallsCache = deps.roomRasterCache.value
    if (wallsCache && wallsCache.state.labelsData.length === state.labelsData.length) {
      return effectiveClassification(wallsCache)
    }
    return new Map(state.classificationByLabel)
  }

  async function refreshGapsFaceOverlay(): Promise<void> {
    if (!onGapsFaceOverlayTab()) return
    const rawState = deps.tabOutputs.value.walls?.meta?.roomClassifyState
    if (!rawState?.labelsData) {
      gapsPreviewMaskCanvas.value = null
      gapsDemoteStats.value = null
      return
    }

    refreshing.value = true
    deps.setLocalError(null)
    try {
      const state = normalizeState(rawState)
      const cv = await waitForOpenCV()
      const img = await deps.getImageEl()
      const work = createWorkCanvas(img)
      const masks = deps.preprocessMaskArgs()
      const prepared = preparePreprocessMasks({
        eraserMask: masks.eraserMask,
        includeOcrMask: false,
        srcWidth: work.originalWidth,
        srcHeight: work.originalHeight,
        dstWidth: work.workWidth,
        dstHeight: work.workHeight,
      })
      const gapsPreprocess = resolveLayerPreprocess(deps.preprocess.value, 'gaps')
      const wallMaskOut = runPreprocessLayer({
        cv,
        image: work.canvas,
        preprocess: gapsPreprocess,
        examples: deps.examplesWithSignatures(),
        eraserMask: prepared.eraserMask,
      })
      try {
        if (deps.gapsInkMode.value === 'detail') {
          const otsuOut = buildRoomReferenceMat({
            cv,
            image: work.canvas,
            eraserMask: prepared.eraserMask,
            preprocess: deps.preprocess.value,
            referenceWallThicknessPx: deps.referenceWallThicknessPx.value ?? undefined,
            wallStyle: deps.preprocess.value.wallStyle === 'solid' ? 'solid' : 'open',
          })
          try {
            carveOtsuWhiteIntoGapsMat(wallMaskOut.mat, otsuOut.mat)
          } finally {
            otsuOut.mat.delete()
          }
        }
        const wallMaskData = new Uint8Array(wallMaskOut.mat.data as Uint8Array)
        if (wallMaskData.length !== state.labelsData.length) {
          throw new Error(
            `Gaten-masker (${wallMaskOut.mat.cols}×${wallMaskOut.mat.rows}) past niet op vlakken (${state.width}×${state.height}).`,
          )
        }
        const parentMap = new Map(state.parentMap)
        const components = extractComponentsFromLabelsData(
          state.labelsData,
          state.width,
          state.height,
        )
        const prior = resolvePriorClassification(state)
        const openingRects = deps.openingRects().filter(
          (rect) => rect.type === 'door' || rect.type === 'window',
        )
        const maxRefFaceAreaPx =
          openingRects.length > 0
            ? await resolveMaxOpeningRefFaceAreaPx({
                cv,
                image: img,
                rects: openingRects,
                preprocess: deps.preprocess.value,
                eraserMask: prepared.eraserMask,
                baseBw: deps.getBaseWallBw?.() ?? undefined,
              })
            : null
        const demoted = runGapsPipeline({
          labelsData: state.labelsData,
          wallMaskData,
          components,
          parentMap,
          priorClassification: prior,
          policyId: 'solid',
          groupBy: state.classificationGroupBy ?? 'component',
          maxRefFaceAreaPx,
        })
        gapsDemoteStats.value = {
          demotedCount: demoted.demotedCount,
          keptCount: demoted.keptCount,
          oversizedDemotedCount: demoted.oversizedDemotedCount,
          maxRefFaceAreaPx: demoted.maxRefFaceAreaPx,
          refFaceAreaCapPx: demoted.refFaceAreaCapPx,
        }
        const demotedCache = createRoomRasterCache({
          ...state,
          classificationByLabel: [...demoted.classificationByLabel.entries()],
          faceOverrides: undefined,
          pinnedRoots: undefined,
        })
        gapsPreviewMaskCanvas.value = updateRoomRasterPreviewMask(demotedCache)
      } finally {
        wallMaskOut.mat.delete()
      }
    } catch (e) {
      gapsPreviewMaskCanvas.value = null
      gapsDemoteStats.value = null
      deps.setLocalError(formatCvError(e))
    } finally {
      refreshing.value = false
    }
  }

  watch(
    () => [deps.templateTab.value, deps.flowStep.value, wallsClassifyReady.value] as const,
    ([tab, step, ready]) => {
      if (step === 'templates' && usesGapsFaceOverlay(tab) && ready) {
        void refreshGapsFaceOverlay()
      }
    },
  )

  watch(
    () => deps.wallBwPreviewUrl.value,
    () => {
      if (onGapsFaceOverlayTab()) {
        void refreshGapsFaceOverlay()
      }
    },
  )

  watch(
    () => deps.roomRasterCache.value?.faceOverrides.size,
    () => {
      if (onGapsFaceOverlayTab()) {
        void refreshGapsFaceOverlay()
      }
    },
  )

  watch(
    () =>
      [
        deps.gapsInkMode.value,
        deps.referenceWallThicknessPx.value,
        deps.preprocess.value.wallStyle,
        JSON.stringify(deps.preprocess.value.gapsLayer ?? null),
      ] as const,
    () => {
      if (onGapsFaceOverlayTab()) {
        void refreshGapsFaceOverlay()
      }
    },
  )

  watch(
    () =>
      deps
        .openingRects()
        .filter((rect) => rect.type === 'door' || rect.type === 'window')
        .map((rect) => `${rect.type}:${rect.x},${rect.y},${rect.width},${rect.height}`)
        .join('|'),
    () => {
      if (onGapsFaceOverlayTab()) {
        void refreshGapsFaceOverlay()
      }
    },
  )

  return {
    gapsPreviewMaskCanvas,
    gapsDemoteStats,
    gapsFacesVisible,
    wallsClassifyReady,
    refreshing,
    refreshGapsFaceOverlay,
  }
}
