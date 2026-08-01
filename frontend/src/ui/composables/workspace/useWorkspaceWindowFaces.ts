import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { noteSwallowedError, tally } from '@/core/diagnostics'
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import { usesWindowOverlay } from '@/cv/preprocess/layer-preprocess'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { PreprocessConfig } from '@/core/extraction/types'
import type { PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { formatCvError } from '@/cv/formatCvError'
import type { CanvasLike } from '@/cv/port/canvasEnv'
import {
  effectiveClassification,
  resolveFloorDual,
  setFaceClassificationForLabels,
  type RoomRasterCache,
} from '@/cv/walls/rooms/room-raster-cache'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import { assertSpacePolicy } from '@/cv/walls/rooms/space-policy-assert'
import {
  collectWindowAxelRefBands,
  runWindowStagePipelineWithBands,
  WINDOW_SPACE_POLICY,
  type BoundWindow,
  type ResolvedWindowCandidate,
  type WindowAxelHypothesis,
  type WindowAxelStage,
  type WindowBindRejection,
} from '@/cv/windows'
import type { SelectionRect } from '@/platform/selection'
import type { WorkspaceFlowStep } from './constants'
import type { RoomPhase } from './useWorkspaceRoomFaces'
import { pruneWindowStageCacheByClassification } from './window-stage-cache-prune'
import { bindResolvedWindowsToWalls as bindResolvedWindowsToWallsCore } from './window-faces-bind'
import {
  resolveEffectiveWallClassification,
  resolveEffectiveWallParentMap,
} from './faces-effective-classification'
import {
  collectDoorframeClassFaceIds,
  collectWindowClassFaceIds,
  createEmptyWindowAxelStageCache,
  isFaceIdSignatureSubset,
  normalizeWindowState,
  signatureForFaceIdSet,
  signatureForWindowRects,
  type FaceBBox,
  type WindowAxelStageCache,
  type WindowFaceUiStats,
} from './window-faces-helpers'
import {
  type WindowAutoPassState,
  createWindowAutoPassState,
  shouldApplyAutoWindowPass,
  markWindowAutoPassDone,
  invalidateAutoWindowPass as invalidateAutoWindowPassCore,
  pushStageClassesOntoWalls,
} from './window-faces-auto-pass'
import { persistWindowOverridesToTabOutputs } from './faces-overrides-persist'
import {
  WINDOW_REFRESH_DEBOUNCE_MS,
  renderWindowOverlayForActiveStage,
  syncWindowStatsFromCache as buildWindowStatsFromCache,
} from './window-faces-overlay-schedule'

export type { WindowFaceUiStats } from './window-faces-helpers'

export function useWorkspaceWindowFaces(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  templateTab: Ref<TemplateTab>
  tabOutputs: Ref<TabDetectionOutputs>
  roomRasterCache: Ref<RoomRasterCache | null>
  roomPhase: Ref<RoomPhase>
  wallBwPreviewUrl: Ref<string | null>
  preprocess: Ref<PreprocessConfig>
  preprocessMaskArgs?: () => PreprocessMaskInput
  referenceWallThicknessPx?: Ref<number | null>
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  openingRects: () => SelectionRect[]
  getDoorArcFaceIds: () => ReadonlySet<number>
  getPxPerMm: () => { x: number; y: number }
  setLocalError: (message: string | null) => void
  getBaseWallBw?: () => { data: Uint8Array; width: number; height: number } | null
  onWindowFacesApplied?: () => void | Promise<void>
}) {
  const windowAxelStage = ref<WindowAxelStage>('stage3')
  const windowPreviewMaskCanvas = ref<CanvasLike | null>(null)
  const windowPreviewMaskRevision = ref(0)
  const windowHypotheses = ref<WindowAxelHypothesis[]>([])
  const resolvedWindows = ref<ResolvedWindowCandidate[]>([])
  const boundWindows = ref<BoundWindow[]>([])
  const windowBindRejections = ref<WindowBindRejection[]>([])
  const windowFaceStats = ref<WindowFaceUiStats | null>(null)
  const refreshing = ref(false)
  const refreshQueued = ref(false)
  const stageCache = ref<WindowAxelStageCache>(createEmptyWindowAxelStageCache())
  const overlayCache = ref<{
    width: number
    height: number
    labelsData: Int32Array
    parentMap: Map<number, number>
    faceBboxByRoot: Map<number, FaceBBox>
  } | null>(null)
  const refreshTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  let refreshInFlight = false
  let rerunRequested = false
  /** Debounced demote-prune (face-edit) — los van Stage auto refresh. */
  let demotePruneTimer: ReturnType<typeof setTimeout> | null = null
  let demotePruneInFlight = false
  let demotePruneRerun = false
  const autoPassApplied = ref(false)
  const autoPass: WindowAutoPassState = createWindowAutoPassState()

  function syncAutoPassRef() {
    autoPassApplied.value = autoPass.autoPassApplied
  }

  const wallsClassifyReady = computed(() => {
    const state = deps.tabOutputs.value.walls?.meta?.roomClassifyState
    return !!state?.labelsData && !!state?.classificationByLabel
  })

  function onWindowOverlayTab(): boolean {
    return deps.flowStep.value === 'templates' && usesWindowOverlay(deps.templateTab.value)
  }

  function shouldRunWindowPass(): boolean {
    if (deps.flowStep.value !== 'templates' || !wallsClassifyReady.value) return false
    const tab = deps.templateTab.value
    if (tab !== 'walls' && tab !== 'windows') return false
    if (tab === 'walls') return deps.roomPhase.value === 'review'
    return deps.roomPhase.value === 'review' || deps.roomPhase.value === 'done'
  }

  // ESC:O-45 (B)
  function shouldPushWindowClasses(): boolean {
    const ok = deps.roomPhase.value === 'review'
    if (ok) tally('O-45', 'window_push_gate')
    return ok
  }

  function persistOverrides(cache: RoomRasterCache): void {
    const next = persistWindowOverridesToTabOutputs(cache, deps.tabOutputs.value)
    if (next) deps.tabOutputs.value = next
  }

  // ESC:O-12 (D)
  /** Commit push-result eerst; preview/reattach daarna op de verse cache. */
  async function commitWindowClassPush(next: RoomRasterCache | null): Promise<void> {
    tally('O-12', 'commit_then_preview')
    if (next) deps.roomRasterCache.value = next
    await deps.onWindowFacesApplied?.()
  }

  // --- stats / overlay sync ---
  function syncWindowStatsFromCache(): void {
    const result = buildWindowStatsFromCache({
      stage: windowAxelStage.value,
      cache: stageCache.value,
    })
    windowHypotheses.value = result.activeHypotheses
    resolvedWindows.value = stageCache.value.stage4ResolvedWindows
    windowFaceStats.value = result.stats
  }

  function renderOverlay(): void {
    const result = renderWindowOverlayForActiveStage({
      stage: windowAxelStage.value,
      stageCache: stageCache.value,
      overlayCache: overlayCache.value,
    })
    windowPreviewMaskCanvas.value = result.canvas
    if (result.revision) windowPreviewMaskRevision.value += 1
    else windowPreviewMaskRevision.value = 0
  }

  async function syncStageViewFromCache(): Promise<void> {
    syncWindowStatsFromCache()
    if (onWindowOverlayTab()) renderOverlay()
    else {
      windowPreviewMaskCanvas.value = null
      windowPreviewMaskRevision.value = 0
    }
  }

  function bindResolvedWindowsToWalls(): void {
    const result = bindResolvedWindowsToWallsCore({
      stageCache: stageCache.value,
      walls: deps.tabOutputs.value.walls,
      roomRasterCache: deps.roomRasterCache.value,
    })
    if (result.nextStage4Resolved) {
      stageCache.value = { ...stageCache.value, stage4ResolvedWindows: result.nextStage4Resolved }
      syncWindowStatsFromCache()
    }
    boundWindows.value = result.bound
    windowBindRejections.value = result.rejected
  }

  // ESC:O-15 (D)
  async function refreshWindowsFromExistingClasses(): Promise<void> {
    tally('O-15', 'prune_only')
    const classification = resolveEffectiveWallClassification({
      roomRasterCache: deps.roomRasterCache.value,
      wallsMeta: deps.tabOutputs.value.walls,
    })
    if (!classification) {
      await syncStageViewFromCache()
      return
    }
    const parentMap = resolveEffectiveWallParentMap({
      roomRasterCache: deps.roomRasterCache.value,
      wallsMeta: deps.tabOutputs.value.walls,
    })
    stageCache.value = pruneWindowStageCacheByClassification(
      stageCache.value,
      classification,
      parentMap,
    )
    autoPass.lastAutoWindowFaceIds = collectWindowClassFaceIds({
      stage: 'stage3',
      cache: stageCache.value,
    })
    autoPass.lastAutoDoorframeFaceIds = collectDoorframeClassFaceIds(stageCache.value)
    await syncStageViewFromCache()
    bindResolvedWindowsToWalls()
  }

  /** Face-demote: debounce + coalesce zodat Shift-kliks de UI niet blokkeren. */
  function scheduleRefreshWindowsFromExistingClasses(): void {
    if (demotePruneInFlight) {
      demotePruneRerun = true
      return
    }
    if (demotePruneTimer) clearTimeout(demotePruneTimer)
    demotePruneTimer = setTimeout(() => {
      demotePruneTimer = null
      void (async () => {
        if (demotePruneInFlight) {
          demotePruneRerun = true
          return
        }
        demotePruneInFlight = true
        try {
          do {
            demotePruneRerun = false
            await refreshWindowsFromExistingClasses()
          } while (demotePruneRerun)
        } finally {
          demotePruneInFlight = false
        }
      })()
    }, WINDOW_REFRESH_DEBOUNCE_MS)
  }

  /**
   * Na deur-demote prune: sync door-arc sig (geen volle Stage 1–4) en ruim
   * wees-doorframes op die niet meer aan een surviving swing hangen.
   */
  // ESC:O-23 (D)
  async function acknowledgeDoorSwingDemotePrune(
    orphanedDoorframeFaceIds: readonly number[],
  ): Promise<void> {
    tally('O-23', 'demote_ack')
    if (refreshTimer.value) {
      clearTimeout(refreshTimer.value)
      refreshTimer.value = null
    }
    refreshQueued.value = false
    rerunRequested = false
    autoPass.appliedDoorArcSig = signatureForFaceIdSet(deps.getDoorArcFaceIds())
    autoPass.forceApplyOnNextPass = false
    syncAutoPassRef()

    const orphaned = [...new Set(orphanedDoorframeFaceIds.filter((id) => id > 0))]
    if (orphaned.length <= 0) return

    const cache = deps.roomRasterCache.value
    if (cache) {
      const stillDoorframe = orphaned.filter((id) => cache.faceOverrides.get(id) === 'doorframe')
      if (stillDoorframe.length > 0) {
        setFaceClassificationForLabels(
          cache,
          stillDoorframe,
          'wall',
          deps.referenceWallThicknessPx?.value ?? undefined,
        )
        persistOverrides(cache)
        await deps.onWindowFacesApplied?.()
      }
    }
    autoPass.lastAutoDoorframeFaceIds = autoPass.lastAutoDoorframeFaceIds.filter(
      (id) => !orphaned.includes(id),
    )
    await refreshWindowsFromExistingClasses()
  }

  function resetWindowState(): void {
    overlayCache.value = null
    windowPreviewMaskCanvas.value = null
    windowPreviewMaskRevision.value = 0
    windowHypotheses.value = []
    resolvedWindows.value = []
    boundWindows.value = []
    windowBindRejections.value = []
    windowFaceStats.value = null
    stageCache.value = createEmptyWindowAxelStageCache()
    autoPass.lastAutoWindowFaceIds = []
    autoPass.lastAutoDoorframeFaceIds = []
  }

  // --- scheduling ---
  function scheduleWindowRefresh(): void {
    if (!shouldRunWindowPass()) return
    if (!shouldApplyAutoWindowPass(autoPass)) {
      if (onWindowOverlayTab() && overlayCache.value) void syncStageViewFromCache()
      return
    }
    if (refreshInFlight) {
      rerunRequested = true
      refreshQueued.value = true
      return
    }
    refreshQueued.value = true
    if (refreshTimer.value) clearTimeout(refreshTimer.value)
    refreshTimer.value = setTimeout(() => {
      refreshTimer.value = null
      void refreshWindowOverlay()
    }, WINDOW_REFRESH_DEBOUNCE_MS)
  }

  // --- core refresh ---
  async function runWindowRefreshPass(): Promise<void> {
    if (!shouldRunWindowPass()) {
      refreshQueued.value = false
      return
    }
    if (!shouldApplyAutoWindowPass(autoPass)) {
      refreshQueued.value = false
      if (onWindowOverlayTab() && overlayCache.value) await syncStageViewFromCache()
      return
    }
    const rawState = deps.tabOutputs.value.walls?.meta?.roomClassifyState
    const state = normalizeWindowState(rawState)
    if (!state?.labelsData) {
      resetWindowState()
      markWindowAutoPassDone(autoPass)
      syncAutoPassRef()
      return
    }
    const windowRects = deps.openingRects().filter((rect) => rect.type === 'window')
    if (windowRects.length <= 0) {
      stageCache.value = createEmptyWindowAxelStageCache()
      overlayCache.value = {
        width: state.width,
        height: state.height,
        labelsData: state.labelsData,
        parentMap: new Map(state.parentMap),
        faceBboxByRoot: new Map(),
      }
      markWindowAutoPassDone(autoPass)
      autoPass.appliedDoorArcSig = signatureForFaceIdSet(deps.getDoorArcFaceIds())
      syncAutoPassRef()
      refreshQueued.value = false
      if (shouldPushWindowClasses()) {
        const next = await pushStageClassesOntoWalls({
          stageCache: stageCache.value,
          windowAxelStage: windowAxelStage.value,
          roomRasterCache: deps.roomRasterCache.value,
          wallsOutput: deps.tabOutputs.value.walls,
          referenceWallThicknessPx: deps.referenceWallThicknessPx?.value ?? undefined,
          autoPassState: autoPass,
          persistOverrides,
        })
        await commitWindowClassPush(next)
      }
      await syncStageViewFromCache()
      return
    }

    refreshing.value = true
    refreshQueued.value = false
    deps.setLocalError(null)
    try {
      const cv = await waitForOpenCV()
      const image = await deps.getImageEl()
      const refBands = await collectWindowAxelRefBands({
        cv,
        image,
        windowRects: windowRects.map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })),
        preprocess: deps.preprocess.value,
        eraserMask: deps.preprocessMaskArgs?.()?.eraserMask ?? undefined,
        baseBw: deps.getBaseWallBw?.() ?? undefined,
      })
      const cache = deps.roomRasterCache.value
      const wallClassification: Map<number, RoomRasterClass> =
        cache && cache.state.labelsData.length === state.labelsData.length
          ? effectiveClassification(cache)
          : new Map(state.classificationByLabel)
      const dual = resolveFloorDual({
        state,
        cache,
        classificationByLabel: wallClassification,
        faceOverrides: cache?.faceOverrides,
      })
      const ppm = deps.getPxPerMm()
      const pipeline = runWindowStagePipelineWithBands({
        dual,
        refBands,
        windowRects: windowRects.map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })),
        ppm,
        doorArcFaceIds: deps.getDoorArcFaceIds(),
        wallThicknessPx: Math.max(0, deps.referenceWallThicknessPx?.value ?? 0),
      })
      const faceBboxByRoot = new Map<number, FaceBBox>()
      for (const geom of pipeline.pipeDual.white.byId.values()) {
        if (!(geom.id > 0)) continue
        faceBboxByRoot.set(geom.id, { ...geom.bbox })
      }
      assertSpacePolicy('window overlay', WINDOW_SPACE_POLICY.overlayPaint, 'ink')
      stageCache.value = {
        refBands,
        stage1Hypotheses: pipeline.stage1.hypotheses,
        stage1Rejections: pipeline.stage1.rejections,
        stage1CandidateEvals: pipeline.stage1.candidateEvals,
        stage2AcceptedHypotheses: pipeline.stage2.kept,
        stage3AcceptedHypotheses: pipeline.stage3.kept,
        stage3Accepted: pipeline.stage3.accepted,
        stage3AcceptedDoorframes: pipeline.stage3Doorframes.accepted,
        stage4ResolvedWindows: pipeline.stage4,
        stage4ResolvedDoorframes: pipeline.stage4Doorframes,
        stage1CandidateRootCount: pipeline.stage1.stats.candidateRootCount,
        stage1AcceptedCount: pipeline.stage1.stats.acceptedCount,
        stage1RejectedCount: pipeline.stage1.stats.rejectedCount,
        stage2RejectedShare: pipeline.stage2.stats.rejectedShare,
        stage2RejectedAdjacent: pipeline.stage2.stats.rejectedAdjacent,
        stage2RejectedDirectional: pipeline.stage2.stats.rejectedDirectional,
        stage3AcceptedByFraming: pipeline.stage3.stats.acceptedByFraming,
        stage3AcceptedByStripStack: pipeline.stage3.stats.acceptedByStripStack,
        stage3RejectedNoEvidence: pipeline.stage3.stats.rejectedNoEvidence,
        stage3DoorframeAcceptedCount: pipeline.stage3Doorframes.stats.acceptedCount,
      }
      const overlaySpace = pipeline.pipeDual.space(WINDOW_SPACE_POLICY.overlayPaint)
      overlayCache.value = {
        width: state.width,
        height: state.height,
        labelsData: overlaySpace.labelsData,
        parentMap: pipeline.detachedParentMap,
        faceBboxByRoot,
      }
      markWindowAutoPassDone(autoPass)
      autoPass.appliedDoorArcSig = signatureForFaceIdSet(deps.getDoorArcFaceIds())
      syncAutoPassRef()
      if (shouldPushWindowClasses()) {
        const next = await pushStageClassesOntoWalls({
          stageCache: stageCache.value,
          windowAxelStage: windowAxelStage.value,
          roomRasterCache: deps.roomRasterCache.value,
          wallsOutput: deps.tabOutputs.value.walls,
          referenceWallThicknessPx: deps.referenceWallThicknessPx?.value ?? undefined,
          autoPassState: autoPass,
          persistOverrides,
        })
        await commitWindowClassPush(next)
      }
      await syncStageViewFromCache()
      // ESC:O-35 (D)
    } catch (error) {
      noteSwallowedError('O-35', 'useWorkspaceWindowFaces.refresh', error, {
        effect: 'volledige raam-state reset incl. lastAuto',
      })
      resetWindowState()
      markWindowAutoPassDone(autoPass)
      syncAutoPassRef()
      deps.setLocalError(formatCvError(error))
    } finally {
      refreshing.value = false
    }
  }

  async function refreshWindowOverlay(): Promise<void> {
    if (refreshTimer.value) {
      clearTimeout(refreshTimer.value)
      refreshTimer.value = null
    }
    if (refreshInFlight) {
      rerunRequested = true
      return
    }
    refreshInFlight = true
    try {
      do {
        rerunRequested = false
        refreshQueued.value = false
        await runWindowRefreshPass()
      } while (rerunRequested || refreshQueued.value)
    } finally {
      refreshInFlight = false
      refreshQueued.value = false
      rerunRequested = false
    }
  }

  // --- watches ---
  onBeforeUnmount(() => {
    if (refreshTimer.value) {
      clearTimeout(refreshTimer.value)
      refreshTimer.value = null
    }
  })

  watch(
    () => deps.roomPhase.value,
    (phase, prev) => {
      if (phase !== 'review' && !(phase === 'done' && deps.templateTab.value === 'windows')) {
        if (refreshTimer.value) {
          clearTimeout(refreshTimer.value)
          refreshTimer.value = null
        }
        refreshQueued.value = false
        rerunRequested = false
        return
      }
      if (prev === 'classifying') {
        invalidateAutoWindowPassCore(autoPass)
        syncAutoPassRef()
        scheduleWindowRefresh()
      }
    },
  )

  watch(
    () =>
      [
        deps.flowStep.value,
        deps.templateTab.value,
        wallsClassifyReady.value,
        deps.roomPhase.value,
      ] as const,
    () => {
      scheduleWindowRefresh()
    },
  )

  watch(
    () => signatureForWindowRects(deps.openingRects()),
    () => {
      invalidateAutoWindowPassCore(autoPass)
      syncAutoPassRef()
      scheduleWindowRefresh()
    },
  )

  // ESC:O-25 (D)
  watch(
    () => {
      const state = deps.tabOutputs.value.walls?.meta?.roomClassifyState
      return [state?.labelsData, state?.parentMap, state?.classificationByLabel] as const
    },
    () => {
      tally('O-25', 'classify_state_refresh')
      scheduleWindowRefresh()
    },
  )

  watch(
    () => deps.wallBwPreviewUrl.value,
    () => {
      if (onWindowOverlayTab() && overlayCache.value) void syncStageViewFromCache()
    },
  )

  watch(
    () => windowAxelStage.value,
    () => {
      if (!overlayCache.value) return
      if (shouldPushWindowClasses() && shouldApplyAutoWindowPass(autoPass)) {
        void pushStageClassesOntoWalls({
          stageCache: stageCache.value,
          windowAxelStage: windowAxelStage.value,
          roomRasterCache: deps.roomRasterCache.value,
          wallsOutput: deps.tabOutputs.value.walls,
          referenceWallThicknessPx: deps.referenceWallThicknessPx?.value ?? undefined,
          autoPassState: autoPass,
          persistOverrides,
        }).then(async (next) => {
          await commitWindowClassPush(next)
          return syncStageViewFromCache()
        })
        return
      }
      void syncStageViewFromCache()
    },
  )

  // ESC:O-23 (D)
  watch(
    () => signatureForFaceIdSet(deps.getDoorArcFaceIds()),
    (sig) => {
      if (sig === autoPass.appliedDoorArcSig) return
      tally('O-23', 'door_arc_sig')
      // Face-edit demote-prune verwijdert alleen arcs — geen volle raam-pipeline.
      if (
        autoPass.autoPassApplied &&
        !autoPass.forceApplyOnNextPass &&
        isFaceIdSignatureSubset(sig, autoPass.appliedDoorArcSig)
      ) {
        autoPass.appliedDoorArcSig = sig
        return
      }
      invalidateAutoWindowPassCore(autoPass)
      syncAutoPassRef()
      scheduleWindowRefresh()
    },
  )

  function invalidateAutoWindowPass(): void {
    if (refreshTimer.value) {
      clearTimeout(refreshTimer.value)
      refreshTimer.value = null
    }
    refreshQueued.value = false
    rerunRequested = false
    invalidateAutoWindowPassCore(autoPass)
    syncAutoPassRef()
  }

  function markAutoWindowPassApplied(): void {
    if (refreshTimer.value) {
      clearTimeout(refreshTimer.value)
      refreshTimer.value = null
    }
    refreshQueued.value = false
    rerunRequested = false
    markWindowAutoPassDone(autoPass)
    syncAutoPassRef()
  }

  return {
    windowAxelStage,
    windowPreviewMaskCanvas,
    windowPreviewMaskRevision,
    windowHypotheses,
    resolvedWindows,
    boundWindows,
    windowBindRejections,
    windowFaceStats,
    stage1Rejections: computed(() => stageCache.value.stage1Rejections),
    stage1CandidateEvals: computed(() => stageCache.value.stage1CandidateEvals),
    wallsClassifyReady,
    initialPassReady: autoPassApplied,
    refreshing,
    refreshWindowOverlay,
    refreshWindowsFromExistingClasses,
    scheduleRefreshWindowsFromExistingClasses,
    acknowledgeDoorSwingDemotePrune,
    invalidateAutoWindowPass,
    markAutoWindowPassApplied,
    bindResolvedWindowsToWalls,
  }
}
