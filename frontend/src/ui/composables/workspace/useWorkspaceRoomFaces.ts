import { computed, ref, watch, type Ref } from 'vue'
import type { ExtractionOutput } from '@/core/extraction'
import type { PreprocessConfig } from '@/platform/image'
import type { WallJunctionStrategy } from '@/core/extraction/types'
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { SelectionRect } from '@/platform/selection'
import type { FaceToolId } from '@/ui/components/canvas/canvas-toolbelt.types'
import { resolveFaceToolbeltHint } from '@/ui/components/canvas/canvas-toolbelt-hints'
import {
  classificationAtLabel,
  classificationStats,
  createRoomRasterCache,
  findFaceLabelsFullyInBBox,
  resolveFaceLabelAtPixel,
  setFaceClassificationForLabels,
  toggleFaceAtLabelDetailed,
  type RasterBBox,
  type RoomRasterCache,
} from '@/cv/walls/rooms/room-raster-cache'
import type { CanvasLike } from '@/cv/port/canvasEnv'
import type { SerializedRoomClassifyState } from '@/cv/walls/strategies/room-first'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import type { useOpenCvLoader } from '../useOpenCvLoader'
import type { WorkspaceFlowStep } from './constants'
import {
  didDemoteDoorFace,
  didDemoteWindowPipelineFace,
  isWindowPipelineFaceClass,
  shouldRefreshDoorOverlayAfterBoxDemote,
  shouldRefreshWindowOverlayAfterBoxDemote,
} from './room-face-demote-guards'
import {
  isWallsClassifyOutput,
  isWallsOutputFinalized,
  restoreCacheFromOutput,
  syncFromTabOutputs as syncFromTabOutputsCore,
} from './room-faces-cache-sync'
import {
  shouldAutoClassify,
  resolveReferenceWallRect,
  createClassifyRunner,
  recalculateFaces as recalculateFacesCore,
  normalizeClassifyState,
} from './room-faces-classify-run'
import { finalizeWallDetection as finalizeWallDetectionCore } from './room-faces-finalize'
import {
  shouldRefreshPreviewForPhase,
  refreshPreviewMask as refreshPreviewMaskCore,
} from './room-faces-preview'

export type RoomPhase = 'idle' | 'awaiting_reference' | 'classifying' | 'recalculating' | 'review' | 'finalizing' | 'done'

export function useWorkspaceRoomFaces(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  templateTab: Ref<TemplateTab>
  profileConfirmed: Ref<boolean>
  selectedRectId: Ref<string | null>
  rects: Ref<SelectionRect[]>
  preprocess: Ref<PreprocessConfig>
  tabOutputs: Ref<TabDetectionOutputs>
  wallsDetectionComplete: Ref<boolean>
  wallBwPreviewUrl: Ref<string | null>
  referenceWallThicknessPx: Ref<number | null>
  cvLoader: ReturnType<typeof useOpenCvLoader>
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  ensureScaleInitialized: (img: HTMLImageElement | HTMLCanvasElement) => void
  preprocessMaskArgs: () => PreprocessMaskInput
  ensureWallBwReady?: () => Promise<boolean>
  getEffectiveWallBwBytes?: () => Uint8Array | null
  onExtractTargets: (
    targets: { walls?: boolean; wallJunctionStrategy?: WallJunctionStrategy },
    options?: {
      requireExamples?: boolean
      phase?: 'classify' | 'recalculate' | 'finalize' | 'full'
      roomClassifyState?: SerializedRoomClassifyState
      faceOverrides?: Array<[number, RoomRasterClass]>
      pinnedRoots?: number[]
      referenceWallMeasureRect?: { x: number; y: number; width: number; height: number }
    },
  ) => Promise<boolean>
  onFinalizeSuccess?: () => void | Promise<void>
  onDoorFacesDemoted?: () => void | Promise<void>
  onWindowFacesDemoted?: () => void | Promise<void>
  setStatus?: (message: string) => void
  refreshWallUnderlayPreview?: () => Promise<void>
}) {
  const roomPhase = ref<RoomPhase>('idle')
  const activeFaceBoxTool = ref<FaceToolId | null>(null)
  const roomRasterCache = ref<RoomRasterCache | null>(null)
  const classifyingInFlight = ref(false)
  let suspendWallBwPreviewWatch = false
  const hasReferenceWallRect = computed(
    () => deps.rects.value.some((rect) => rect.type === 'wall'),
  )

  const roomPreviewMaskCanvas = ref<CanvasLike | null>(null)
  const roomPreviewMaskRevision = ref(0)
  let pendingPreviewAfterClassify = false

  const roomClassificationStats = computed(() => {
    if (!roomRasterCache.value) return null
    return classificationStats(roomRasterCache.value)
  })

  const faceToolbeltVisible = computed(
    () =>
      deps.flowStep.value === 'templates' &&
      deps.templateTab.value === 'walls' &&
      (roomPhase.value === 'review' || roomPhase.value === 'done'),
  )

  const faceToolbeltHint = computed(() => {
    if (!activeFaceBoxTool.value) return ''
    return resolveFaceToolbeltHint(activeFaceBoxTool.value)
  })

  function syncDetectionComplete() {
    deps.wallsDetectionComplete.value =
      roomPhase.value === 'done' || isWallsOutputFinalized(deps.tabOutputs.value.walls)
  }

  function refreshPreviewMask(
    cache: RoomRasterCache,
    options?: { dirtyBounds?: import('@/cv/walls/rooms/room-ink-symmetric').InkDiffBounds | null },
  ): void {
    roomPreviewMaskCanvas.value = refreshPreviewMaskCore(cache, options)
    roomPreviewMaskRevision.value += 1
  }

  function refreshPreviewMaskAsync(cache: RoomRasterCache): void {
    try {
      refreshPreviewMask(cache)
      deps.setStatus?.('Kleuren klaar — controleer vlakken en rond detectie af.')
    } catch {
      // foutmelding loopt via detectiepipeline
    }
  }

  async function refreshClassificationPreview(): Promise<void> {
    const cache = roomRasterCache.value
    if (!cache) return
    if (!shouldRefreshPreviewForPhase(roomPhase.value)) return
    refreshPreviewMask(cache)
  }

  // --- watches ---
  watch(
    () => deps.wallBwPreviewUrl.value,
    () => {
      if (suspendWallBwPreviewWatch) return
      const cache = roomRasterCache.value
      if (!cache) return
      if (!shouldRefreshPreviewForPhase(roomPhase.value)) {
        if (roomPhase.value === 'classifying') pendingPreviewAfterClassify = true
        return
      }
      refreshPreviewMask(cache)
    },
  )

  watch(roomPhase, (phase, prev) => {
    if (phase !== 'review' || prev === 'review') return
    const cache = roomRasterCache.value
    if (!cache) return
    if (pendingPreviewAfterClassify || !roomPreviewMaskCanvas.value) {
      pendingPreviewAfterClassify = false
      refreshPreviewMask(cache)
    }
  })

  // --- ingest / restore ---
  async function ingestClassifyOutput(output: ExtractionOutput | null): Promise<boolean> {
    const state = output?.meta?.roomClassifyState
    if (!state) return false
    roomRasterCache.value = createRoomRasterCache(state)
    roomPhase.value = 'review'
    syncDetectionComplete()
    deps.setStatus?.('Kleuren opbouwen…')
    pendingPreviewAfterClassify = false
    refreshPreviewMask(roomRasterCache.value)
    deps.setStatus?.('Kleuren klaar — controleer vlakken en rond detectie af.')
    return true
  }

  async function ensureEditableCacheAfterFinalize(
    output: ExtractionOutput | null | undefined,
  ): Promise<void> {
    const cache = restoreCacheFromOutput(output)
    if (!cache) return
    roomRasterCache.value = cache
    refreshPreviewMaskAsync(roomRasterCache.value)
  }

  async function restoreCacheFromTabOutput(
    output: ExtractionOutput | null | undefined,
    options?: { refreshPreview?: boolean },
  ): Promise<boolean> {
    const cache = restoreCacheFromOutput(output)
    if (!cache) return false
    roomRasterCache.value = cache
    if (options?.refreshPreview !== false) refreshPreviewMask(cache)
    syncDetectionComplete()
    return true
  }

  // --- syncFromTabOutputs ---
  async function syncFromTabOutputs(): Promise<void> {
    await syncFromTabOutputsCore({
      roomPhase: roomPhase.value,
      tabOutputs: deps.tabOutputs.value,
      roomRasterCache: roomRasterCache.value,
      setRoomPhase: (p) => { roomPhase.value = p },
      syncDetectionComplete,
      ingestClassifyOutput,
      restoreCacheFromTabOutput,
      ensureEditableCacheAfterFinalize,
      flowStep: deps.flowStep.value,
      templateTab: deps.templateTab.value,
      profileConfirmed: deps.profileConfirmed.value,
      referenceWallThicknessPx: deps.referenceWallThicknessPx.value,
    })
  }

  // --- classify ---
  const classifyRunner = createClassifyRunner({
    get templateTab() { return deps.templateTab.value },
    get referenceWallThicknessPx() { return deps.referenceWallThicknessPx.value },
    setRoomPhase: (p) => { roomPhase.value = p },
    syncDetectionComplete,
    setStatus: deps.setStatus,
    onExtractTargets: deps.onExtractTargets,
    ingestClassifyOutput,
    getWallsOutput: () => deps.tabOutputs.value.walls,
  })

  function runClassifyPhase(
    force: boolean,
    referenceWallMeasureRect?: { x: number; y: number; width: number; height: number },
  ): Promise<boolean> {
    return classifyRunner.runClassifyPhase(
      force,
      () =>
        shouldAutoClassify({
          roomPhase: roomPhase.value,
          wallsOutput: deps.tabOutputs.value.walls,
          flowStep: deps.flowStep.value,
          templateTab: deps.templateTab.value,
          profileConfirmed: deps.profileConfirmed.value,
        }),
      (v) => { classifyingInFlight.value = v },
      () => {
        roomRasterCache.value = null
        roomPreviewMaskCanvas.value = null
        roomPreviewMaskRevision.value = 0
      },
      referenceWallMeasureRect,
    )
  }

  async function autoclassifyWalls(): Promise<boolean> {
    if (
      roomPhase.value === 'review' ||
      roomPhase.value === 'done' ||
      roomPhase.value === 'finalizing' ||
      classifyingInFlight.value
    ) {
      return roomPhase.value === 'review' || roomPhase.value === 'done'
    }
    const walls = deps.tabOutputs.value.walls
    if (isWallsClassifyOutput(walls) || isWallsOutputFinalized(walls)) {
      if (!roomRasterCache.value) await ingestClassifyOutput(walls)
      return true
    }
    const rect = resolveReferenceWallRect(deps.rects.value, deps.selectedRectId.value)
    if (!rect && (!deps.referenceWallThicknessPx.value || deps.referenceWallThicknessPx.value <= 0)) {
      roomPhase.value = 'awaiting_reference'
      syncDetectionComplete()
      return false
    }
    if (rect) {
      if (deps.referenceWallThicknessPx.value && deps.referenceWallThicknessPx.value > 0) {
        return runClassifyPhase(true)
      }
      deps.setStatus?.('Referentiemuur meten en classificeren…')
      if (!deps.cvLoader.ready.value) {
        deps.setStatus?.('OpenCV laden…')
        await deps.cvLoader.ensureOpenCv()
        if (!deps.cvLoader.ready.value) {
          deps.referenceWallThicknessPx.value = null
          roomPhase.value = 'awaiting_reference'
          syncDetectionComplete()
          return false
        }
      }
      deps.referenceWallThicknessPx.value = null
      const classified = await runClassifyPhase(true, {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      })
      if (!classified) {
        deps.setStatus?.('Muurclassificatie niet gestart — controleer profiel (Solid/Open) en probeer opnieuw.')
        roomPhase.value = 'awaiting_reference'
        syncDetectionComplete()
        return false
      }
      if (!deps.referenceWallThicknessPx.value || deps.referenceWallThicknessPx.value <= 0) {
        deps.setStatus?.('Referentiemuur niet herkend — pas het vak aan en probeer opnieuw.')
        roomPhase.value = 'awaiting_reference'
        syncDetectionComplete()
        return false
      }
      return true
    }
    deps.setStatus?.('Autoclassificatie uitvoeren…')
    return runClassifyPhase(true)
  }

  async function autoClassifyWalls(
    force = false,
    referenceWallMeasureRect?: { x: number; y: number; width: number; height: number },
  ): Promise<boolean> {
    if (!force) return autoclassifyWalls()
    return runClassifyPhase(true, referenceWallMeasureRect)
  }

  async function requestAutoclassifyWalls(): Promise<boolean> {
    if (
      roomPhase.value === 'review' ||
      roomPhase.value === 'done' ||
      isWallsClassifyOutput(deps.tabOutputs.value.walls) ||
      isWallsOutputFinalized(deps.tabOutputs.value.walls)
    ) {
      const rect = resolveReferenceWallRect(deps.rects.value, deps.selectedRectId.value)
      if (deps.referenceWallThicknessPx.value && deps.referenceWallThicknessPx.value > 0) {
        return runClassifyPhase(true)
      }
      if (rect) {
        return runClassifyPhase(true, { x: rect.x, y: rect.y, width: rect.width, height: rect.height })
      }
      deps.setStatus?.('Meet eerst een referentie muur via het vak of Autoclassificeer.')
      roomPhase.value = 'awaiting_reference'
      syncDetectionComplete()
      return false
    }
    return autoclassifyWalls()
  }

  // --- recalculate ---
  async function recalculateFaces(): Promise<boolean> {
    classifyingInFlight.value = true
    roomPhase.value = 'recalculating'
    suspendWallBwPreviewWatch = true
    try {
      const result = await recalculateFacesCore({
        referenceWallThicknessPx: deps.referenceWallThicknessPx.value,
        roomRasterCache: roomRasterCache.value,
        wallsOutput: deps.tabOutputs.value.walls,
        tabOutputs: deps.tabOutputs.value,
        preprocess: deps.preprocess.value,
        preprocessMaskArgs: deps.preprocessMaskArgs,
        ensureOpenCv: () => deps.cvLoader.ensureOpenCv(),
        ensureWallBwReady: deps.ensureWallBwReady,
        getEffectiveWallBwBytes: deps.getEffectiveWallBwBytes,
        getImageEl: deps.getImageEl,
        ensureScaleInitialized: deps.ensureScaleInitialized,
        setStatus: deps.setStatus,
        restoreCacheFromOutput,
      })
      if (result.success && result.nextTabOutputs && result.nextCache) {
        deps.tabOutputs.value = result.nextTabOutputs
        roomRasterCache.value = result.nextCache
        roomPhase.value = 'review'
        syncDetectionComplete()
        deps.setStatus?.('Kleuren opbouwen…')
        refreshPreviewMask(roomRasterCache.value)
        deps.setStatus?.('Inktwijzigingen verwerkt — controleer vlakken en rond af.')
        return true
      }
      roomPhase.value = 'review'
      deps.setStatus?.('Inkt verwerken mislukt — probeer opnieuw.')
      return false
    } catch {
      roomPhase.value = 'review'
      deps.setStatus?.('Inkt verwerken mislukt — probeer opnieuw.')
      return false
    } finally {
      suspendWallBwPreviewWatch = false
      classifyingInFlight.value = false
    }
  }

  // --- finalize ---
  async function finalizeWallDetection(): Promise<boolean> {
    return finalizeWallDetectionCore({
      roomRasterCache: roomRasterCache.value,
      roomPhase: roomPhase.value,
      setRoomPhase: (p) => { roomPhase.value = p },
      setStatus: deps.setStatus,
      syncDetectionComplete,
      getWallsOutput: () => deps.tabOutputs.value.walls,
      refreshPreviewMask,
      onExtractTargets: deps.onExtractTargets,
      ensureEditableCacheAfterFinalize,
      onFinalizeSuccess: deps.onFinalizeSuccess,
    })
  }

  // --- face toggle / box ---
  async function toggleFaceAt(x: number, y: number): Promise<void> {
    const cache = roomRasterCache.value
    if (!cache || (roomPhase.value !== 'review' && roomPhase.value !== 'done')) return
    if (deps.flowStep.value !== 'templates' || deps.templateTab.value !== 'walls') return
    const label = resolveFaceLabelAtPixel(cache, x, y)
    if (label == null) return
    const previousClass = classificationAtLabel(cache, label)
    const result = toggleFaceAtLabelDetailed(
      cache, label, deps.referenceWallThicknessPx.value ?? undefined,
    )
    if (!result) return
    refreshPreviewMask(cache, { dirtyBounds: result.dirtyBounds })
    // Stage-caches prunen (geen pipeline-herdetectie) — scheduled, blokkeert paint niet.
    if (didDemoteDoorFace(previousClass, result.next)) {
      void deps.onDoorFacesDemoted?.()
    }
    if (didDemoteWindowPipelineFace(previousClass, result.next)) {
      void deps.onWindowFacesDemoted?.()
    }
  }

  async function classifyFacesInBox(bounds: RasterBBox): Promise<void> {
    const cache = roomRasterCache.value
    if (!cache || (roomPhase.value !== 'review' && roomPhase.value !== 'done')) return
    if (deps.flowStep.value !== 'templates' || deps.templateTab.value !== 'walls') return
    if (!activeFaceBoxTool.value) return
    const target: RoomRasterClass = activeFaceBoxTool.value === 'box_wall' ? 'wall' : 'unknown'
    const faceLabels = findFaceLabelsFullyInBBox(
      cache, bounds, deps.referenceWallThicknessPx.value ?? undefined,
    )
    const hadDoorFaceBefore = faceLabels.some(
      (faceLabel) => classificationAtLabel(cache, faceLabel) === 'door',
    )
    const hadWindowPipelineFaceBefore = faceLabels.some((faceLabel) =>
      isWindowPipelineFaceClass(classificationAtLabel(cache, faceLabel)),
    )
    const change = setFaceClassificationForLabels(
      cache, faceLabels, target, deps.referenceWallThicknessPx.value ?? undefined,
    )
    if (change.changedLabels.length > 0) {
      refreshPreviewMask(cache, { dirtyBounds: change.dirtyBounds })
      if (shouldRefreshDoorOverlayAfterBoxDemote({
        targetClass: target, changedCount: change.changedLabels.length, hadDoorFaceBefore,
      })) {
        void deps.onDoorFacesDemoted?.()
      }
      if (shouldRefreshWindowOverlayAfterBoxDemote({
        targetClass: target, changedCount: change.changedLabels.length, hadWindowPipelineFaceBefore,
      })) {
        void deps.onWindowFacesDemoted?.()
      }
    }
  }

  // --- reset ---
  function resetRoomState() {
    roomPhase.value = 'idle'
    activeFaceBoxTool.value = null
    roomRasterCache.value = null
    roomPreviewMaskCanvas.value = null
    roomPreviewMaskRevision.value = 0
    pendingPreviewAfterClassify = false
    syncDetectionComplete()
  }

  function onThresholdChanged() {
    const keepReference = deps.referenceWallThicknessPx.value
    resetRoomState()
    deps.referenceWallThicknessPx.value = keepReference
    void autoclassifyWalls()
  }

  return {
    roomPhase,
    activeFaceBoxTool,
    faceToolbeltVisible,
    faceToolbeltHint,
    roomRasterCache,
    roomPreviewMaskCanvas,
    roomPreviewMaskRevision,
    roomClassificationStats,
    hasReferenceWallRect,
    classifyingInFlight,
    autoclassifyWalls,
    requestAutoclassifyWalls,
    recalculateFaces,
    autoClassifyWalls,
    finalizeWallDetection,
    toggleFaceAt,
    classifyFacesInBox,
    refreshClassificationPreview,
    resetRoomState,
    onThresholdChanged,
    syncFromTabOutputs,
  }
}
