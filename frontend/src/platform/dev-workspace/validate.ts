import type { DevWorkspaceSession, DevWorkspaceSessionV1, DevWorkspaceSessionV2 } from './types'

function isValidSessionBase(value: Record<string, unknown>): boolean {
  return (
    typeof value.workingImagePng === 'string' &&
    typeof value.imageWidth === 'number' &&
    typeof value.imageHeight === 'number' &&
    value.imageWidth > 0 &&
    value.imageHeight > 0 &&
    typeof value.preprocess === 'object' &&
    value.preprocess !== null &&
    typeof value.scale === 'object' &&
    value.scale !== null
  )
}

function isDevWorkspaceSessionV1(value: unknown): value is DevWorkspaceSessionV1 {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<DevWorkspaceSessionV1>
  return (
    session.schemaVersion === 1 &&
    isValidSessionBase(session) &&
    typeof session.scale?.state === 'object' &&
    session.scale.state !== null
  )
}

function isDevWorkspaceSessionV2(value: unknown): value is DevWorkspaceSessionV2 {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<DevWorkspaceSessionV2>
  return (
    session.schemaVersion === 2 &&
    isValidSessionBase(session) &&
    typeof session.flow === 'object' &&
    session.flow !== null &&
    typeof session.flow.targetFlowStep === 'string' &&
    typeof session.flow.restoreMode === 'string'
  )
}

export function isDevWorkspaceSession(value: unknown): value is DevWorkspaceSession {
  return isDevWorkspaceSessionV1(value) || isDevWorkspaceSessionV2(value)
}
