import { tally } from '@/core/diagnostics'
import type { Ref } from 'vue'
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import {
  applySerializedFaceOverrides,
  reresolveInkInCache,
  updateRoomRasterPreviewMask,
  type RoomRasterCache,
} from '@/cv/walls/rooms/room-raster-cache'
import {
  clonePlain,
  isSessionV2,
  restoreTabOutputsFromSnapshot,
  type DevWorkspaceRoomSnapshot,
  type DevWorkspaceSession,
  type DevOpeningReferenceRect,
  type DevWallReferenceRect,
} from '@/platform/dev-workspace'
import type { WorkspaceFlowStep } from './constants'
import type { RoomPhase } from './useWorkspaceRoomFaces'

export type WorkspaceDevSessionRestoreDetectionDeps = {
  flowStep: Ref<WorkspaceFlowStep>
  templateTab: Ref<TemplateTab>
  profileConfirmed: Ref<boolean>
  tabOutputs: Ref<TabDetectionOutputs>
  roomPhase: Ref<RoomPhase>
  wallsDetectionComplete: Ref<boolean>
  getRoomRasterCache: () => RoomRasterCache | null
  refreshClassificationPreview?: () => Promise<void> | void
  refreshAllDetectionUnderlays: () => Promise<void>
  ensureVectorCacheIfNeeded: () => Promise<void>
  syncFromTabOutputs: () => Promise<void>
  runOcrScan: () => Promise<void>
  autoClassifyWalls: (force?: boolean) => Promise<boolean>
  finalizeWallDetection: () => Promise<boolean>
  referenceWallThicknessPx: Ref<number | null>
  restoreWallReferenceRect: (rect: DevWallReferenceRect) => void
  restoreOpeningReferenceRects: (rects: DevOpeningReferenceRect[]) => void
  setRoomInkCoverageThreshold: (value: number) => void
  /** Tijdens exact-restore: Stage-2 niet laten racen vóór expliciete re-run. */
  markAutoDoorPassApplied: () => void
  /** Tijdens exact-restore: Stage-3/4 niet laten racen vóór expliciete re-run. */
  markAutoWindowPassApplied: () => void
  /** Na restore: Stage-2 opnieuw toestaan. */
  resetAutoDoorPassGate: () => void
  refreshDoorSwingOverlay: () => Promise<void>
  invalidateAutoWindowPass: () => void
  refreshWindowOverlay: () => Promise<void>
}

export function createWorkspaceDevSessionRestoreDetection(
  deps: WorkspaceDevSessionRestoreDetectionDeps,
) {
  function applyRoomSnapshot(
    room?: DevWorkspaceRoomSnapshot,
    options?: { restoreReferenceWallRect?: boolean },
  ): void {
    if (!room) return
    if (room.referenceWallThicknessPx != null && room.referenceWallThicknessPx > 0) {
      deps.referenceWallThicknessPx.value = room.referenceWallThicknessPx
    }
    if (room.referenceWallRect && options?.restoreReferenceWallRect !== false) {
      deps.restoreWallReferenceRect(room.referenceWallRect)
    }
    if (room.openingRects?.length) {
      deps.restoreOpeningReferenceRects(room.openingRects)
    }
    if (room.roomInkCoverageThreshold != null) {
      deps.setRoomInkCoverageThreshold(room.roomInkCoverageThreshold)
    }
  }

  async function restoreRoomCacheFromSnapshot(room?: DevWorkspaceRoomSnapshot): Promise<void> {
    const cache = deps.getRoomRasterCache()
    if (!cache || !room) return
    if (!room.faceOverrides?.length && !room.pinnedRoots?.length) return
    applySerializedFaceOverrides(cache, room.faceOverrides, room.pinnedRoots)
    if (room.referenceWallThicknessPx) {
      reresolveInkInCache(cache, room.referenceWallThicknessPx)
    }
    updateRoomRasterPreviewMask(cache)
    await deps.refreshClassificationPreview?.()
  }

  /**
   * Deur/raam stage-caches zitten niet in de snapshot — na restore beide opnieuw
   * draaien zodat finalize L11/L12 + L14 heeft (niet alleen face-classes).
   * Forceert templates/walls/review tijdelijk zodat shouldRun*-gates beide laten lopen.
   */
  async function rerunOpeningsAfterRestore(): Promise<void> {
    const prevStep = deps.flowStep.value
    const prevTab = deps.templateTab.value
    const prevPhase = deps.roomPhase.value
    deps.flowStep.value = 'templates'
    deps.templateTab.value = 'walls'
    if (prevPhase !== 'review') deps.roomPhase.value = 'review'
    try {
      deps.resetAutoDoorPassGate()
      await deps.refreshDoorSwingOverlay()
      deps.invalidateAutoWindowPass()
      await deps.refreshWindowOverlay()
    } finally {
      deps.flowStep.value = prevStep
      deps.templateTab.value = prevTab
      deps.roomPhase.value = prevPhase
    }
  }

  async function restoreExactDetection(session: DevWorkspaceSession): Promise<void> {
    if (!isSessionV2(session) || !session.detectionExact) return
    const exact = session.detectionExact
    const hasClassifyState = !!exact.tabOutputs.walls?.meta?.roomClassifyState

    deps.tabOutputs.value = restoreTabOutputsFromSnapshot(clonePlain(exact.tabOutputs))
    deps.roomPhase.value = exact.roomPhase
    deps.wallsDetectionComplete.value = exact.wallsDetectionComplete
    applyRoomSnapshot(exact, { restoreReferenceWallRect: !hasClassifyState })
    // ESC:O-30 (D)
    // Direct na phase/rects: annuleer geplande Stage-2/3 vóór awaits (>80ms debounce).
    // Expliciete re-run volgt via rerunOpeningsAfterRestore.
    if (exact.roomPhase === 'review' || exact.roomPhase === 'done') {
      tally('O-30', 'mark_auto_pass')
      deps.markAutoDoorPassApplied()
      deps.markAutoWindowPassApplied()
    }
    await deps.syncFromTabOutputs()
    await restoreRoomCacheFromSnapshot(exact)
    if (exact.roomPhase === 'review' || exact.roomPhase === 'done') {
      deps.markAutoDoorPassApplied()
      deps.markAutoWindowPassApplied()
    }
  }

  async function replayDetection(session: DevWorkspaceSession): Promise<void> {
    if (!isSessionV2(session) || !session.detectionReplay) return
    const replay = session.detectionReplay
    applyRoomSnapshot(replay)

    deps.profileConfirmed.value = true
    deps.flowStep.value = 'templates'
    deps.templateTab.value = 'ocr'

    await deps.refreshAllDetectionUnderlays()
    await deps.ensureVectorCacheIfNeeded()

    if (replay.ocrApplied) {
      deps.templateTab.value = 'ocr'
      await deps.runOcrScan()
    }

    if (replay.wallsPhase === 'none') return

    deps.templateTab.value = 'walls'
    const classified = await deps.autoClassifyWalls(true)
    if (!classified) return

    await restoreRoomCacheFromSnapshot(replay)
    // ESC:O-29 (D)
    // DevSession replay: openings opnieuw draaien na classify (historisch existing-doors-only;
    // nu volle refresh zodat finalize L11/L12 + L14 heeft).
    tally('O-29', 'rerun_openings')
    await rerunOpeningsAfterRestore()

    if (replay.wallsPhase === 'classify') return
    await deps.finalizeWallDetection()
  }

  return {
    applyRoomSnapshot,
    restoreRoomCacheFromSnapshot,
    restoreExactDetection,
    replayDetection,
    rerunOpeningsAfterRestore,
  }
}
