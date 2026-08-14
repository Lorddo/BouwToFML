import type { Ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import {
  isSessionV2,
  resolveRestoreMode,
  resolveTargetFlowStep,
  type DevWorkspaceSession,
} from '@/platform/dev-workspace'
import type { WorkspaceFlowStep } from './constants'
import type { createWorkspaceDevSessionRestoreBase } from './workspace-dev-session-restore-base'
import type { createWorkspaceDevSessionRestoreDetection } from './workspace-dev-session-restore-detection'

export type RestoreSessionOptions = {
  /** Floor-switch naar result: skip dure deur/raam her-pipeline. */
  skipOpeningsRerun?: boolean
  /** Herstel bewerkte FML-preview i.p.v. opnieuw uit detectie te bouwen. */
  applyPreviewPlan?: FloorPlan | null
  /** Underlay origin+px/mm bij applyPreviewPlan. */
  applyPreviewUnderlayLayout?: import('@/ui/composables/project/types').PreviewUnderlayLayout | null
  /** Gebruikers-nulpunt in scant-cm bij floor-restore. */
  applyFmlNulpuntImageCm?: { x: number; y: number } | null
}

export type WorkspaceDevSessionRestoreFlowDeps = {
  flowStep: Ref<WorkspaceFlowStep>
  refreshAllDetectionUnderlays: () => Promise<void>
  ensureVectorCacheIfNeeded: () => Promise<void>
  onEnterResultStep: () => Promise<void>
  snapResolvedDoorsToWalls: () => void | Promise<void>
  updatePreviewPlan?: (
    plan: FloorPlan,
    layout?: import('@/ui/composables/project/types').PreviewUnderlayLayout | null,
  ) => void
  setFmlNulpuntImageCm?: (point: { x: number; y: number } | null) => void
}

export function createWorkspaceDevSessionRestoreFlow(
  deps: WorkspaceDevSessionRestoreFlowDeps,
  base: ReturnType<typeof createWorkspaceDevSessionRestoreBase>,
  detection: ReturnType<typeof createWorkspaceDevSessionRestoreDetection>,
) {
  async function restoreSession(
    session: DevWorkspaceSession,
    options?: RestoreSessionOptions,
  ): Promise<void> {
    await base.restoreBaseSession(session)
    base.applyFlowUiFromSession(session)

    const targetStep = resolveTargetFlowStep(session)
    const restoreMode = resolveRestoreMode(session)
    const skipOpenings = options?.skipOpeningsRerun === true

    if (targetStep === 'input') {
      deps.flowStep.value = 'input'
      return
    }

    if (targetStep === 'preprocess') {
      deps.flowStep.value = 'preprocess'
      await deps.refreshAllDetectionUnderlays()
      await deps.ensureVectorCacheIfNeeded()
      return
    }

    if (targetStep === 'templates') {
      if (restoreMode === 'exact') {
        await detection.restoreExactDetection(session)
      }
      deps.flowStep.value = 'templates'
      await deps.refreshAllDetectionUnderlays()
      await deps.ensureVectorCacheIfNeeded()
      if (
        !skipOpenings &&
        restoreMode === 'exact' &&
        isSessionV2(session) &&
        (session.detectionExact?.roomPhase === 'review' ||
          session.detectionExact?.roomPhase === 'done')
      ) {
        await detection.rerunOpeningsAfterRestore()
      }
      return
    }

    // result — DevSession-opname default replay; floor-blobs forceExact → exact
    if (restoreMode === 'replay') {
      await detection.replayDetection(session)
    } else if (isSessionV2(session) && session.detectionExact) {
      await detection.restoreExactDetection(session)
    } else {
      await deps.refreshAllDetectionUnderlays()
      await deps.ensureVectorCacheIfNeeded()
    }

    deps.flowStep.value = 'result'
    if (
      !skipOpenings &&
      restoreMode === 'exact' &&
      isSessionV2(session) &&
      (session.detectionExact?.roomPhase === 'review' ||
        session.detectionExact?.roomPhase === 'done')
    ) {
      await detection.rerunOpeningsAfterRestore()
      void deps.snapResolvedDoorsToWalls()
    }
    await deps.onEnterResultStep()
    // Plan+layout van déze floor eerst; nulpunt-ref daarna (hoort bij blob, niet herberekenen).
    // Volgorde voorkomt dat een stale nulpunt van de vorige verdieping op raw generate landt.
    if (options?.applyPreviewPlan && deps.updatePreviewPlan) {
      deps.updatePreviewPlan(options.applyPreviewPlan, options.applyPreviewUnderlayLayout ?? null)
    }
    if (options?.applyFmlNulpuntImageCm !== undefined) {
      deps.setFmlNulpuntImageCm?.(options.applyFmlNulpuntImageCm)
    }
  }

  return { restoreSession }
}
