import { WORKSPACE_FLOW_LABELS, type WorkspaceFlowStep } from '@/ui/composables/workspace/constants'
import type { DevWorkspaceSession, DevWorkspaceSessionV2 } from './types'

export function isSessionV2(session: DevWorkspaceSession): session is DevWorkspaceSessionV2 {
  return session.schemaVersion === 2
}

export function resolveTargetFlowStep(session: DevWorkspaceSession): WorkspaceFlowStep {
  if (isSessionV2(session)) {
    const step = session.flow.targetFlowStep
    return step === 'project' ? 'input' : step
  }
  return 'templates'
}

export function resolveRestoreMode(session: DevWorkspaceSession): 'exact' | 'replay' {
  if (isSessionV2(session)) return session.flow.restoreMode
  return 'exact'
}

export function flowStepLabel(step: WorkspaceFlowStep): string {
  return WORKSPACE_FLOW_LABELS[step]
}
