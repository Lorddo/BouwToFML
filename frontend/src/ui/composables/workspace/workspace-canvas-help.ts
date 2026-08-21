import type { WorkspaceFlowStep } from './constants'

/** i18n-keys for the shared canvas topbar help modal (stap 1–3). */
const INPUT_HELP_KEYS = [
  'result.canvasHints.panZoom',
  'result.canvasHints.eraserMode',
  'result.canvasHints.polygon',
  'input.bakeRotationHint',
  'input.underlayHint',
] as const

const PREPROCESS_HELP_KEYS = [
  'result.canvasHints.panZoom',
  'result.canvasHints.drawRefShort',
  'result.canvasHints.selectionWithMove',
  'toolbelt.hints.inkBrush',
  'toolbelt.hints.inkEraser',
  'toolbelt.hints.inkLine',
  'toolbelt.hints.inkRect',
  'preprocess.bwHint',
  'preprocess.stamp.hint',
  'preprocess.refs.hint',
] as const

const TEMPLATES_HELP_KEYS = [
  'result.canvasHints.panZoom',
  'result.canvasHints.faceSelect',
  'toolbelt.hints.faceWall',
  'toolbelt.hints.faceUnknown',
  'toolbelt.hints.inkBrush',
  'toolbelt.hints.inkEraser',
  'toolbelt.hints.staleUnderlay',
] as const

export function workspaceCanvasHelpKeys(flowStep: WorkspaceFlowStep): readonly string[] {
  if (flowStep === 'input') return INPUT_HELP_KEYS
  if (flowStep === 'preprocess') return PREPROCESS_HELP_KEYS
  if (flowStep === 'templates') return TEMPLATES_HELP_KEYS
  return INPUT_HELP_KEYS
}
