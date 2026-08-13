import { tally } from '@/core/diagnostics'
import type { Ref } from 'vue'
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import {
  applySerializedFaceOverrides,
  reresolveInkInCache,
  serializeFaceOverrides,
  serializePinnedRoots,
  updateRoomRasterPreviewMask,
  type RoomRasterCache,
} from '@/cv/walls/rooms/room-raster-cache'
import {
  isSessionV2,
  restoreTabOutputsFromSnapshot,
  toStorableDevSession,
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
  wallRefThicknessMeasures: Ref<
    Array<{ band: 'min' | 'mid' | 'max'; thicknessPx: number; rectId?: string }>
  >
  restoreWallReferenceRects: (rects: DevWallReferenceRect[]) => void
  restoreOpeningReferenceRects: (rects: DevOpeningReferenceRect[]) => void
  setRoomInkCoverageThreshold: (value: number) => void
  /** Tijdens exact-restore: Stage-2 niet laten racen vóór expliciete re-run. */
  markAutoDoorPassApplied: () => void
  /** Tijdens exact-restore: Stage-3/4 niet laten racen vóór expliciete re-run. */
  markAutoWindowPassApplied: () => void
  /** Na restore: Stage-2 opnieuw toestaan (alleen voor volle auto-pass). */
  resetAutoDoorPassGate: () => void
  /**
   * Na restore: Stage-2 alleen vanuit class=`door` (geen demoted deuren terug).
   */
  refreshDoorSwingOverlayExistingOnly: () => Promise<void>
  /** Na raam-push: prune deuren op actuele face-class. */
  refreshDoorSwingFromExistingDoors: () => Promise<void>
  /** Tijdens exact-restore: Stage-3/4 niet laten racen vóór expliciete re-run. */
  invalidateAutoWindowPass: () => void
  refreshWindowOverlay: () => Promise<void>
  /** Na restore: prune ramen op actuele face-class (na herstel face-overrides). */
  refreshWindowsFromExistingClasses: () => Promise<void>
}

function restoreWallRefThicknessMeasures(
  target: Ref<Array<{ band: 'min' | 'mid' | 'max'; thicknessPx: number; rectId?: string }>>,
  measures: DevWorkspaceRoomSnapshot['wallRefThicknessMeasures'] | undefined,
): void {
  if (!measures?.length) return
  target.value = measures
    .filter(
      (m) =>
        (m.band === 'min' || m.band === 'mid' || m.band === 'max') &&
        Number.isFinite(m.thicknessPx) &&
        m.thicknessPx > 0,
    )
    .map((m) => ({ band: m.band, thicknessPx: m.thicknessPx }))
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
    restoreWallRefThicknessMeasures(deps.wallRefThicknessMeasures, room.wallRefThicknessMeasures)
    if (options?.restoreReferenceWallRect !== false) {
      const wallRects =
        room.referenceWallRects && room.referenceWallRects.length > 0
          ? room.referenceWallRects
          : room.referenceWallRect
            ? [room.referenceWallRect]
            : []
      if (wallRects.length > 0) {
        deps.restoreWallReferenceRects(wallRects)
      }
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
   * Deur/raam stage-caches zitten niet in de snapshot — na restore opnieuw opbouwen
   * voor L11/L12 + L14, maar zonder demoted openings terug te zetten:
   * - deuren: existing-doors-only (alleen class=`door`)
   * - ramen: volle rebuild (geen existing-only), daarna face-overrides herstellen + prune
   */
  async function rerunOpeningsAfterRestore(): Promise<void> {
    const prevStep = deps.flowStep.value
    const prevTab = deps.templateTab.value
    const prevPhase = deps.roomPhase.value
    const cacheBefore = deps.getRoomRasterCache()
    const faceOverrides = cacheBefore ? serializeFaceOverrides(cacheBefore) : []
    const pinnedRoots = cacheBefore ? serializePinnedRoots(cacheBefore) : []
    deps.flowStep.value = 'templates'
    deps.templateTab.value = 'walls'
    if (prevPhase !== 'review') deps.roomPhase.value = 'review'
    try {
      await deps.refreshDoorSwingOverlayExistingOnly()
      deps.invalidateAutoWindowPass()
      await deps.refreshWindowOverlay()
      // Raam-push kan face-edits overschrijven — herstel + prune overlays.
      if (faceOverrides.length > 0 || pinnedRoots.length > 0) {
        const cache = deps.getRoomRasterCache()
        if (cache) {
          applySerializedFaceOverrides(cache, faceOverrides, pinnedRoots)
          updateRoomRasterPreviewMask(cache)
          await deps.refreshClassificationPreview?.()
        }
        await deps.refreshDoorSwingFromExistingDoors()
        await deps.refreshWindowsFromExistingClasses()
      }
    } finally {
      deps.flowStep.value = prevStep
      deps.templateTab.value = prevTab
      deps.roomPhase.value = prevPhase
    }
  }

  async function restoreExactDetection(session: DevWorkspaceSession): Promise<void> {
    if (!isSessionV2(session) || !session.detectionExact) return
    const exact = session.detectionExact

    deps.tabOutputs.value = restoreTabOutputsFromSnapshot(toStorableDevSession(exact.tabOutputs))
    deps.roomPhase.value = exact.roomPhase
    deps.wallsDetectionComplete.value = exact.wallsDetectionComplete
    // Altijd refs uit exact terugzetten (multi muur-bands). Skip-bij-classify liet
    // soms alleen de base/singular primary staan → mid/max weg na detectie-restore.
    applyRoomSnapshot(exact)
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
    // DevSession replay: openings opnieuw draaien na classify.
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
