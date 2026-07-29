import type { Ref } from 'vue'
import {
  isSessionV2,
  resolveRestoreMode,
  resolveTargetFlowStep,
  type DevWorkspaceSession,
} from '@/platform/dev-workspace'
import type { WorkspaceFlowStep } from './constants'
import type { createWorkspaceDevSessionRestoreBase } from './workspace-dev-session-restore-base'
import type { createWorkspaceDevSessionRestoreDetection } from './workspace-dev-session-restore-detection'

export type WorkspaceDevSessionRestoreFlowDeps = {
  flowStep: Ref<WorkspaceFlowStep>
  refreshAllDetectionUnderlays: () => Promise<void>
  ensureVectorCacheIfNeeded: () => Promise<void>
  onEnterResultStep: () => Promise<void>
  snapResolvedDoorsToWalls: () => void | Promise<void>
}

export function createWorkspaceDevSessionRestoreFlow(
  deps: WorkspaceDevSessionRestoreFlowDeps,
  base: ReturnType<typeof createWorkspaceDevSessionRestoreBase>,
  detection: ReturnType<typeof createWorkspaceDevSessionRestoreDetection>,
) {
  async function restoreSession(session: DevWorkspaceSession): Promise<void> {
    await base.restoreBaseSession(session)
    base.applyFlowUiFromSession(session)

    const targetStep = resolveTargetFlowStep(session)
    const restoreMode = resolveRestoreMode(session)

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
        restoreMode === 'exact' &&
        isSessionV2(session) &&
        (session.detectionExact?.roomPhase === 'review' ||
          session.detectionExact?.roomPhase === 'done')
      ) {
        await detection.rebuildDoorsFromRestoredFaces()
      }
      return
    }

    // result — altijd replay met huidige code
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
      restoreMode === 'exact' &&
      isSessionV2(session) &&
      (session.detectionExact?.roomPhase === 'review' ||
        session.detectionExact?.roomPhase === 'done')
    ) {
      await detection.rebuildDoorsFromRestoredFaces()
      void deps.snapResolvedDoorsToWalls()
    }
    await deps.onEnterResultStep()
  }

  return { restoreSession }
}
