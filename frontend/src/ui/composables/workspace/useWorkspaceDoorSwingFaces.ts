import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { noteSwallowedError, tally } from '@/core/diagnostics'
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import { usesDoorSwingOverlay } from '@/cv/preprocess/layer-preprocess'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { PreprocessConfig } from '@/core/extraction/types'
import type { PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { formatCvError } from '@/cv/formatCvError'
import type { CanvasLike } from '@/cv/port/canvasEnv'
import type { RoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import { effectiveClassification } from '@/cv/walls/rooms/room-raster-cache'
import { assertSpacePolicy } from '@/cv/walls/rooms/space-policy-assert'
import type { SelectionRect } from '@/platform/selection'
import {
  resolveDoorSizeBandPx,
  runDoorStagePipeline,
  DOOR_SPACE_POLICY,
  type BoundDoor,
  type OrientedDoor,
  type DoorSwingHypothesis,
  type ResolvedDoorCandidate,
  type DoorSwingStage,
} from '@/cv/doors'
import type { WorkspaceFlowStep } from './constants'
import type { RoomPhase } from './useWorkspaceRoomFaces'
import {
  collectAcceptedDoorFaceIds,
  createEmptyDoorSwingStageCache,
  normalizeDoorSwingState,
  resolvePriorDoorClassification,
  signatureForDoorRects,
  type DoorSwingStageCache,
  type DoorSwingUiStats,
} from './useWorkspaceDoorSwingHelpers'
import { createDoorSwingComputationCache } from './useWorkspaceDoorSwingComputationCache'
import {
  reattachStickyDoorframesToResolved as reattachStickyDoorframesToResolvedCore,
  snapResolvedDoorsToWalls as snapResolvedDoorsToWallsCore,
} from './door-faces-snap'
import {
  collectOrphanedDoorframeFaceIdsAfterDoorPrune,
  pruneDoorStageCacheByClassification,
} from './door-stage-cache-prune'
import {
  resolveEffectiveWallClassification,
  resolveEffectiveWallParentMap,
} from './faces-effective-classification'
import {
  type AutoPassState,
  createAutoPassState,
  shouldApplyAutoDoorPass,
  markDoorAutoPassDone,
  invalidateAutoDoorPass as invalidateAutoPassCore,
  resetAutoPassState,
  pushStage2DoorsOntoWalls,
  syncPurgedDoorFaceOverrides,
} from './door-faces-auto-pass'
import { persistDoorOverridesToTabOutputs } from './faces-overrides-persist'
import {
  DOOR_SWING_REFRESH_DEBOUNCE_MS,
  noteDoorSwingRefreshDebounce,
  renderDoorSwingOverlayForActiveStage,
  syncDoorSwingStatsFromCache as buildStatsFromCache,
} from './door-faces-overlay-schedule'

export function useWorkspaceDoorSwingFaces(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  templateTab: Ref<TemplateTab>
  tabOutputs: Ref<TabDetectionOutputs>
  roomRasterCache: Ref<RoomRasterCache | null>
  roomPhase: Ref<RoomPhase>
  wallBwPreviewUrl: Ref<string | null>
  preprocess: Ref<PreprocessConfig>
  preprocessMaskArgs?: () => PreprocessMaskInput
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  openingRects: () => SelectionRect[]
  getPxPerMm: () => { x: number; y: number }
  setLocalError: (message: string | null) => void
  referenceWallThicknessPx?: Ref<number | null>
  getBaseWallBw?: () => { data: Uint8Array; width: number; height: number } | null
  onDoorFacesApplied?: () => void | Promise<void>
  /**
   * Na demote-prune: sync window door-arc sig + optionele wees-doorframe cleanup.
   * Geen volle raam-pipeline.
   */
  onDoorSwingDemotePruned?: (orphanedDoorframeFaceIds: readonly number[]) => void | Promise<void>
  devSessionRestoring?: Ref<boolean>
}) {
  const doorSwingStage = ref<DoorSwingStage>('stage2')
  const doorSwingPreviewMaskCanvas = ref<CanvasLike | null>(null)
  const doorSwingPreviewMaskRevision = ref(0)
  const doorSwingPreviewMaskUrl = computed(() => null as string | null)
  const doorSwingHypotheses = ref<DoorSwingHypothesis[]>([])
  const resolvedDoors = ref<ResolvedDoorCandidate[]>([])
  const boundDoors = ref<BoundDoor[]>([])
  const orientedDoors = ref<OrientedDoor[]>([])
  const doorSwingStats = ref<DoorSwingUiStats | null>(null)
  const refreshing = ref(false)
  const refreshQueued = ref(false)
  const stageCache = ref<DoorSwingStageCache>(createEmptyDoorSwingStageCache())
  const overlayCache = ref<{
    width: number
    height: number
    labelsData: Int32Array
    parentMap: Map<number, number>
  } | null>(null)
  const computationCache = createDoorSwingComputationCache()
  const refreshTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  let refreshInFlight = false
  let rerunRequested = false
  /** Debounced demote-prune (face-edit) — los van Stage-2 auto refresh. */
  let demotePruneTimer: ReturnType<typeof setTimeout> | null = null
  let demotePruneInFlight = false
  let demotePruneRerun = false
  const autoPassApplied = ref(false)
  const autoPass: AutoPassState = createAutoPassState()

  function syncAutoPassRef() {
    autoPassApplied.value = autoPass.autoPassApplied
  }

  const wallsClassifyReady = computed(() => {
    const state = deps.tabOutputs.value.walls?.meta?.roomClassifyState
    return !!state?.labelsData && !!state?.classificationByLabel
  })

  const doorSwingVisible = computed(
    () =>
      deps.flowStep.value === 'templates' &&
      usesDoorSwingOverlay(deps.templateTab.value) &&
      wallsClassifyReady.value &&
      !!doorSwingPreviewMaskCanvas.value,
  )

  function onDoorSwingOverlayTab(): boolean {
    return deps.flowStep.value === 'templates' && usesDoorSwingOverlay(deps.templateTab.value)
  }

  // ESC:O-45 (B)
  function shouldRunDoorSwingPass(): boolean {
    if (deps.flowStep.value !== 'templates' || !wallsClassifyReady.value) return false
    if (deps.roomPhase.value !== 'review') return false
    const tab = deps.templateTab.value
    const ok = tab === 'walls' || tab === 'doors'
    if (ok) tally('O-45', 'door_pass_gate')
    return ok
  }

  // --- persist helper ---
  function persistOverrides(cache: RoomRasterCache): void {
    const next = persistDoorOverridesToTabOutputs(cache, deps.tabOutputs.value)
    if (next) deps.tabOutputs.value = next
  }

  // --- stats/overlay sync ---
  function syncStatsFromCache(): void {
    const result = buildStatsFromCache({ stage: doorSwingStage.value, cache: stageCache.value })
    doorSwingHypotheses.value = result.activeHypotheses
    resolvedDoors.value = stageCache.value.resolvedDoors
    doorSwingStats.value = result.stats
  }

  function renderOverlay(): void {
    const result = renderDoorSwingOverlayForActiveStage({
      stage: doorSwingStage.value,
      stageCache: stageCache.value,
      overlayCache: overlayCache.value,
    })
    doorSwingPreviewMaskCanvas.value = result.canvas
    if (result.revision) doorSwingPreviewMaskRevision.value += 1
    else doorSwingPreviewMaskRevision.value = 0
  }

  async function syncStageViewFromCache(): Promise<void> {
    syncStatsFromCache()
    if (onDoorSwingOverlayTab()) renderOverlay()
    else {
      doorSwingPreviewMaskCanvas.value = null
      doorSwingPreviewMaskRevision.value = 0
    }
  }

  // --- scheduling ---
  function scheduleDoorSwingOverlayRefresh(): void {
    if (!shouldRunDoorSwingPass()) return
    if (!shouldApplyAutoDoorPass(autoPass)) {
      if (onDoorSwingOverlayTab() && overlayCache.value) void syncStageViewFromCache()
      return
    }
    if (refreshInFlight) {
      rerunRequested = true
      refreshQueued.value = true
      return
    }
    refreshQueued.value = true
    if (refreshTimer.value) clearTimeout(refreshTimer.value)
    noteDoorSwingRefreshDebounce()
    refreshTimer.value = setTimeout(() => {
      refreshTimer.value = null
      void refreshDoorSwingOverlay()
    }, DOOR_SWING_REFRESH_DEBOUNCE_MS)
  }

  // --- core refresh pass ---
  async function runDoorSwingOverlayRefreshPass(options?: {
    mode?: 'auto' | 'existing-doors-only'
  }): Promise<void> {
    const mode = options?.mode ?? 'auto'
    const existingDoorsOnly = mode === 'existing-doors-only'
    if (!existingDoorsOnly) {
      if (!shouldRunDoorSwingPass()) {
        refreshQueued.value = false
        return
      }
      if (!shouldApplyAutoDoorPass(autoPass)) {
        refreshQueued.value = false
        if (onDoorSwingOverlayTab() && overlayCache.value) await syncStageViewFromCache()
        return
      }
    } else {
      if (deps.flowStep.value !== 'templates' && deps.flowStep.value !== 'result') return
      if (deps.roomPhase.value !== 'review' && deps.roomPhase.value !== 'done') return
      if (!wallsClassifyReady.value) return
    }
    const rawState = deps.tabOutputs.value.walls?.meta?.roomClassifyState
    if (!rawState?.labelsData) {
      resetDoorSwingState()
      if (!existingDoorsOnly) {
        markDoorAutoPassDone(autoPass)
        syncAutoPassRef()
      }
      return
    }
    const ppm = deps.getPxPerMm()
    if (!(ppm.x > 0) || !(ppm.y > 0)) {
      resetDoorSwingState()
      if (!existingDoorsOnly) {
        markDoorAutoPassDone(autoPass)
        syncAutoPassRef()
      }
      return
    }
    const sizeBand = resolveDoorSizeBandPx(ppm.x, ppm.y)
    const doorRects = deps.openingRects().filter((rect) => rect.type === 'door')
    if (doorRects.length === 0) {
      doorSwingPreviewMaskCanvas.value = null
      doorSwingPreviewMaskRevision.value = 0
      overlayCache.value = null
      stageCache.value = createEmptyDoorSwingStageCache(sizeBand)
      syncStatsFromCache()
      if (!existingDoorsOnly) {
        const next = await pushStage2DoorsOntoWalls({
          accepted: [],
          bridgeWallFaceIds: [],
          roomRasterCache: deps.roomRasterCache.value,
          wallsOutput: deps.tabOutputs.value.walls,
          referenceWallThicknessPx: deps.referenceWallThicknessPx?.value ?? undefined,
          autoPassState: autoPass,
          persistOverrides,
          onDoorFacesApplied: deps.onDoorFacesApplied,
        })
        syncAutoPassRef()
        if (next) deps.roomRasterCache.value = next
      }
      return
    }

    refreshing.value = true
    refreshQueued.value = false
    deps.setLocalError(null)
    try {
      const state = normalizeDoorSwingState(rawState)
      const cv = await waitForOpenCV()
      const img = await deps.getImageEl()
      const refBands = await computationCache.resolveRefBands({
        rects: doorRects,
        image: img,
        cv,
        preprocess: deps.preprocess.value,
        eraserMask: deps.preprocessMaskArgs?.()?.eraserMask ?? undefined,
        baseBw: deps.getBaseWallBw?.() ?? undefined,
      })
      if (refBands.length === 0) {
        doorSwingPreviewMaskCanvas.value = null
        doorSwingPreviewMaskRevision.value = 0
        overlayCache.value = null
        stageCache.value = createEmptyDoorSwingStageCache(sizeBand)
        syncStatsFromCache()
        if (!existingDoorsOnly) {
          const next = await pushStage2DoorsOntoWalls({
            accepted: [],
            bridgeWallFaceIds: [],
            roomRasterCache: deps.roomRasterCache.value,
            wallsOutput: deps.tabOutputs.value.walls,
            referenceWallThicknessPx: deps.referenceWallThicknessPx?.value ?? undefined,
            autoPassState: autoPass,
            persistOverrides,
            onDoorFacesApplied: deps.onDoorFacesApplied,
          })
          syncAutoPassRef()
          if (next) deps.roomRasterCache.value = next
        }
        return
      }
      const prior = resolvePriorDoorClassification(state, deps.roomRasterCache.value)
      const faceOverrides = deps.roomRasterCache.value?.faceOverrides
      const dual = computationCache.resolveDual(
        state,
        prior,
        faceOverrides,
        deps.roomRasterCache.value,
      )
      const pipe = runDoorStagePipeline({
        dual,
        cv,
        refBands,
        sizeBand,
        classificationGroupBy: state.classificationGroupBy ?? 'component',
        existingDoorsOnly,
        ...(existingDoorsOnly ? { allowedSeedClasses: ['door'] as const } : {}),
        referenceWallThicknessPx: deps.referenceWallThicknessPx?.value ?? undefined,
        pxPerMmX: ppm.x,
        pxPerMmY: ppm.y,
        bridgeClassificationByLabel: prior,
      })
      assertSpacePolicy('door overlay', DOOR_SPACE_POLICY.overlayPaint, 'ink')
      const overlaySpace = pipe.pipeDual.space(DOOR_SPACE_POLICY.overlayPaint)

      // ESC:O-17 (B)
      // existingDoorsOnly: nooit stage leeggooien als er nog class=`door` faces zijn
      // (stale dual zou anders door-arc sig legen → window auto-pass wipe).
      const priorResolved = stageCache.value.resolvedDoors
      const pipelineEmpty = pipe.stage2Accepted.length <= 0 && pipe.resolved.length <= 0
      if (existingDoorsOnly && pipelineEmpty && priorResolved.length > 0) {
        tally('O-17', 'guard_keep_prior')
        const cache = deps.roomRasterCache.value
        const classification = cache ? effectiveClassification(cache) : prior
        const stillHasDoorFaces = priorResolved.some((door) =>
          door.faceIds.some((id) => id > 0 && classification.get(id) === 'door'),
        )
        if (stillHasDoorFaces) {
          markDoorAutoPassDone(autoPass)
          autoPass.pendingApplyMode = 'replace-auto'
          autoPass.lastAutoDoorFaceIds = collectAcceptedDoorFaceIds(
            stageCache.value.stage2AcceptedHypotheses,
          )
          syncAutoPassRef()
          await syncStageViewFromCache()
          return
        }
      }

      overlayCache.value = {
        width: overlaySpace.width,
        height: overlaySpace.height,
        labelsData: overlaySpace.labelsData,
        parentMap: pipe.detachedParentMap,
      }
      stageCache.value = {
        stage1Hypotheses: pipe.stage1Hypotheses,
        stage2AcceptedHypotheses: pipe.stage2Accepted,
        resolvedDoors: pipe.resolved,
        stage2RejectedCount: pipe.stage2RejectedCount,
        stage2RejectedTooFull: pipe.fillResult.stats.rejectedTooFull,
        stage2RejectedTooEmpty: pipe.fillResult.stats.rejectedTooEmpty,
        stage2RejectedSurroundedByRoom: pipe.surroundRejectedCount,
        stage2RejectedNoWallTouch: pipe.wallTouchRejectedCount,
        angleRescueCount: pipe.angleRescueCount,
        singleCount: pipe.stage1Stats.singleAccepted,
        clusterCount: pipe.stage1Stats.clusterAccepted,
        refBandCount: refBands.length,
        seedCount: pipe.stage1Stats.seedCount,
        sizeBandPx: sizeBand,
      }
      if (!existingDoorsOnly) {
        const next = await pushStage2DoorsOntoWalls({
          accepted: pipe.stage2Accepted,
          bridgeWallFaceIds: pipe.bridgeWallFaceIds,
          roomRasterCache: deps.roomRasterCache.value,
          wallsOutput: deps.tabOutputs.value.walls,
          referenceWallThicknessPx: deps.referenceWallThicknessPx?.value ?? undefined,
          autoPassState: autoPass,
          persistOverrides,
          onDoorFacesApplied: deps.onDoorFacesApplied,
        })
        syncAutoPassRef()
        if (next) deps.roomRasterCache.value = next
      } else {
        markDoorAutoPassDone(autoPass)
        autoPass.pendingApplyMode = 'replace-auto'
        autoPass.lastAutoDoorFaceIds = collectAcceptedDoorFaceIds(pipe.stage2Accepted)
        syncAutoPassRef()
      }
      await syncStageViewFromCache()
      // ESC:O-34 (D)
    } catch (error) {
      noteSwallowedError('O-34', 'useWorkspaceDoorSwingFaces.refresh', error, {
        existingDoorsOnly,
        effect: 'volledige deur-state reset',
      })
      resetDoorSwingState()
      if (!existingDoorsOnly) {
        markDoorAutoPassDone(autoPass)
        syncAutoPassRef()
      }
      deps.setLocalError(formatCvError(error))
    } finally {
      refreshing.value = false
    }
  }

  // ESC:O-14 (D)
  async function refreshDoorSwingFromExistingDoors(): Promise<void> {
    tally('O-14', 'prune_only')
    if (refreshTimer.value) {
      clearTimeout(refreshTimer.value)
      refreshTimer.value = null
    }
    refreshQueued.value = false
    rerunRequested = false
    // Alleen prune — geen Stage-herdetectie (voorkomt lege pipeline → door-arc wipe → window re-run).
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
    const beforeResolved = stageCache.value.resolvedDoors
    stageCache.value = pruneDoorStageCacheByClassification(
      stageCache.value,
      classification,
      parentMap,
    )
    const orphanedDoorframeFaceIds = collectOrphanedDoorframeFaceIdsAfterDoorPrune(
      beforeResolved,
      stageCache.value.resolvedDoors,
    )
    autoPass.lastAutoDoorFaceIds = collectAcceptedDoorFaceIds(
      stageCache.value.stage2AcceptedHypotheses,
    )
    autoPass.pendingApplyMode = 'replace-auto'
    markDoorAutoPassDone(autoPass)
    syncAutoPassRef()
    await syncStageViewFromCache()
    // L11/L12 alleen na finalize (kept wall mask); geen purge tijdens review.
    if (deps.tabOutputs.value.walls?.roomWallMaskRle) {
      await snapResolvedDoorsToWalls()
    }
    // Window: arc-sig sync + wees-DF cleanup — nooit volle raam-pipeline via deze prune.
    await deps.onDoorSwingDemotePruned?.(orphanedDoorframeFaceIds)
  }

  /** Face-demote: debounce + coalesce zodat Shift-kliks de UI niet blokkeren. */
  function scheduleRefreshDoorSwingFromExistingDoors(): void {
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
            await refreshDoorSwingFromExistingDoors()
          } while (demotePruneRerun)
        } finally {
          demotePruneInFlight = false
        }
      })()
    }, DOOR_SWING_REFRESH_DEBOUNCE_MS)
  }

  async function refreshDoorSwingOverlay(): Promise<void> {
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
        await runDoorSwingOverlayRefreshPass()
      } while (rerunRequested || refreshQueued.value)
    } finally {
      refreshInFlight = false
      refreshQueued.value = false
      rerunRequested = false
    }
  }

  function resetDoorSwingState(): void {
    overlayCache.value = null
    doorSwingPreviewMaskCanvas.value = null
    doorSwingPreviewMaskRevision.value = 0
    doorSwingHypotheses.value = []
    resolvedDoors.value = []
    boundDoors.value = []
    orientedDoors.value = []
    doorSwingStats.value = null
    stageCache.value = createEmptyDoorSwingStageCache()
    computationCache.reset()
  }

  function reattachStickyDoorframesToResolved(): void {
    const next = reattachStickyDoorframesToResolvedCore({
      resolvedDoors: stageCache.value.resolvedDoors,
      walls: deps.tabOutputs.value.walls,
      roomRasterCache: deps.roomRasterCache.value,
      referenceWallThicknessPx: deps.referenceWallThicknessPx?.value ?? undefined,
    })
    if (!next) return
    stageCache.value = { ...stageCache.value, resolvedDoors: next }
    syncStatsFromCache()
  }

  async function snapResolvedDoorsToWalls(): Promise<void> {
    const result = await snapResolvedDoorsToWallsCore({
      walls: deps.tabOutputs.value.walls,
      roomRasterCache: deps.roomRasterCache.value,
      resolvedDoors: stageCache.value.resolvedDoors,
      referenceWallThicknessPx: deps.referenceWallThicknessPx?.value ?? undefined,
      whiteParentMap: overlayCache.value?.parentMap ?? null,
      setLocalError: deps.setLocalError,
    })
    if (result.nextResolvedDoors) {
      stageCache.value = { ...stageCache.value, resolvedDoors: result.nextResolvedDoors }
      resolvedDoors.value = result.nextResolvedDoors
      if (!result.purgeKeptFaceIds) syncStatsFromCache()
    }
    if (result.purgeKeptFaceIds) {
      const cache = deps.roomRasterCache.value
      if (cache) {
        const next = syncPurgedDoorFaceOverrides({
          cache,
          purgeKeptFaceIds: result.purgeKeptFaceIds,
          referenceWallThicknessPx: deps.referenceWallThicknessPx?.value ?? undefined,
          autoPassState: autoPass,
          persistOverrides,
        })
        if (next) deps.roomRasterCache.value = next
      }
      syncStatsFromCache()
    }
    boundDoors.value = result.bound
    orientedDoors.value = result.oriented
  }

  function onWallsClassified(mode: 'replace-all' | 'replace-auto' = 'replace-all'): void {
    invalidateAutoPassCore(autoPass, mode)
    syncAutoPassRef()
    scheduleDoorSwingOverlayRefresh()
  }

  function invalidateAutoDoorPass(mode: 'replace-all' | 'replace-auto' = 'replace-all'): void {
    invalidateAutoPassCore(autoPass, mode)
    syncAutoPassRef()
  }

  function markAutoDoorPassApplied(): void {
    if (refreshTimer.value) {
      clearTimeout(refreshTimer.value)
      refreshTimer.value = null
    }
    refreshQueued.value = false
    rerunRequested = false
    markDoorAutoPassDone(autoPass)
    autoPass.pendingApplyMode = 'replace-auto'
    syncAutoPassRef()
  }

  function resetAutoDoorPassGate(): void {
    if (refreshTimer.value) {
      clearTimeout(refreshTimer.value)
      refreshTimer.value = null
    }
    refreshQueued.value = false
    rerunRequested = false
    resetAutoPassState(autoPass)
    syncAutoPassRef()
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
      if (phase !== 'review') {
        if (refreshTimer.value) {
          clearTimeout(refreshTimer.value)
          refreshTimer.value = null
        }
        refreshQueued.value = false
        rerunRequested = false
        return
      }
      // ESC:O-24 (D)
      if (prev === 'classifying') {
        tally('O-24', 'walls_classified')
        onWallsClassified('replace-all')
      }
    },
  )

  watch(
    () =>
      [
        deps.templateTab.value,
        deps.flowStep.value,
        wallsClassifyReady.value,
        deps.roomPhase.value,
      ] as const,
    ([tab, step, ready, phase]) => {
      if (
        step === 'templates' &&
        ready &&
        phase === 'review' &&
        (tab === 'walls' || tab === 'doors')
      ) {
        scheduleDoorSwingOverlayRefresh()
      }
    },
  )

  watch(
    () => deps.wallBwPreviewUrl.value,
    () => {
      if (onDoorSwingOverlayTab() && overlayCache.value) void syncStageViewFromCache()
    },
  )

  // ESC:O-26 (D)
  watch(
    () => {
      const ppm = deps.getPxPerMm()
      return `${ppm.x}:${ppm.y}`
    },
    () => {
      if (deps.devSessionRestoring?.value) return
      if (!shouldRunDoorSwingPass()) return
      tally('O-26', 'scale_invalidate')
      invalidateAutoDoorPass('replace-auto')
      scheduleDoorSwingOverlayRefresh()
    },
  )

  watch(
    () => signatureForDoorRects(deps.openingRects()),
    () => {
      if (deps.devSessionRestoring?.value) return
      if (!shouldRunDoorSwingPass()) return
      invalidateAutoDoorPass('replace-auto')
      scheduleDoorSwingOverlayRefresh()
    },
  )

  watch(
    () => doorSwingStage.value,
    () => {
      if (!onDoorSwingOverlayTab()) return
      void syncStageViewFromCache()
    },
  )

  function getStage2DoorArcFaceIds(): ReadonlySet<number> {
    return new Set(collectAcceptedDoorFaceIds(stageCache.value.stage2AcceptedHypotheses))
  }

  return {
    doorSwingStage,
    doorSwingPreviewMaskCanvas,
    doorSwingPreviewMaskRevision,
    doorSwingPreviewMaskUrl,
    doorSwingHypotheses,
    resolvedDoors,
    boundDoors,
    orientedDoors,
    doorSwingStats,
    doorSwingVisible,
    wallsClassifyReady,
    initialPassReady: autoPassApplied,
    refreshing,
    refreshDoorSwingOverlay,
    refreshDoorSwingFromExistingDoors,
    scheduleRefreshDoorSwingFromExistingDoors,
    onWallsClassified,
    invalidateAutoDoorPass,
    markAutoDoorPassApplied,
    resetAutoDoorPassGate,
    snapResolvedDoorsToWalls,
    reattachStickyDoorframesToResolved,
    getStage2DoorArcFaceIds,
    resetDoorSwingState,
  }
}
