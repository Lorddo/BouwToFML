import { tally } from '@/core/diagnostics'
import type { ResultViewTab } from '@/cv/pipeline/merge-tab-outputs'
import {
  usesWallDetectionOverlays,
  usesGapsFaceOverlay,
  usesDoorSwingOverlay,
  usesWindowOverlay,
  type PreprocessPanelLayer,
  type TemplateTab,
} from '@/cv/preprocess/layer-preprocess'
import type { WorkspaceFlowStep } from './constants'
import type { RoomPhase } from './useWorkspaceRoomFaces'

export type TemplatesInitialDetectionStepId = 'ocr' | 'walls' | 'doors' | 'windows'

export type TemplatesInitialDetectionStep = {
  id: TemplatesInitialDetectionStepId
  label: string
  status: 'pending' | 'active' | 'done'
}

// ESC:O-43 (B)
export function isTemplatesInitialDetectionBusy(params: {
  flowStep: WorkspaceFlowStep
  roomPhase: RoomPhase
  classifyingInFlight: boolean
  doorInitialPassReady: boolean
  windowInitialPassReady: boolean
  /**
   * True zodra muren+deuren+ramen één keer klaar waren in deze review-sessie.
   * Voorkomt dat latere invalidate (face-edit, ref-wijziging) de overlay opnieuw toont.
   */
  initialDetectionSettled?: boolean
  ocrEnabled?: boolean
  ocrScanning?: boolean
  ocrInitialPassReady?: boolean
}): boolean {
  if (params.flowStep !== 'templates') return false
  if (params.ocrEnabled && (params.ocrScanning || params.ocrInitialPassReady === false)) {
    tally('O-43', 'busy_ocr')
    return true
  }
  if (
    params.roomPhase === 'classifying' ||
    params.roomPhase === 'recalculating' ||
    params.classifyingInFlight
  ) {
    tally('O-43', 'busy_classifying')
    return true
  }
  if (params.roomPhase === 'review') {
    if (params.initialDetectionSettled) return false
    const busy = !params.doorInitialPassReady || !params.windowInitialPassReady
    if (busy) tally('O-43', 'busy_initial_pass')
    return busy
  }
  return false
}

export function resolveTemplatesInitialDetectionSteps(params: {
  roomPhase: RoomPhase
  classifyingInFlight: boolean
  doorInitialPassReady: boolean
  windowInitialPassReady: boolean
  ocrEnabled?: boolean
  ocrScanning?: boolean
  ocrInitialPassReady?: boolean
}): TemplatesInitialDetectionStep[] {
  const ocrEnabled = params.ocrEnabled === true
  const ocrDone = !ocrEnabled || (params.ocrInitialPassReady !== false && !params.ocrScanning)
  const ocrActive = ocrEnabled && !ocrDone

  const wallsRunning =
    ocrDone &&
    (params.roomPhase === 'classifying' ||
      params.roomPhase === 'recalculating' ||
      params.classifyingInFlight)
  const wallsDone =
    ocrDone &&
    !wallsRunning &&
    (params.roomPhase === 'review' ||
      params.roomPhase === 'done' ||
      params.roomPhase === 'finalizing')

  const doorsDone = wallsDone && params.doorInitialPassReady
  const doorsActive = wallsDone && !params.doorInitialPassReady
  const windowsDone = wallsDone && params.windowInitialPassReady
  const windowsActive = wallsDone && !params.windowInitialPassReady

  const steps: TemplatesInitialDetectionStep[] = []
  if (ocrEnabled) {
    steps.push({
      id: 'ocr',
      label: 'OCR tekst',
      status: ocrDone ? 'done' : ocrActive ? 'active' : 'pending',
    })
  }
  steps.push(
    {
      id: 'walls',
      label: 'Muren classificeren',
      status: wallsDone ? 'done' : wallsRunning ? 'active' : 'pending',
    },
    {
      id: 'doors',
      label: 'Deuren detecteren',
      status: doorsDone ? 'done' : doorsActive ? 'active' : 'pending',
    },
    {
      id: 'windows',
      label: 'Ramen detecteren',
      status: windowsDone ? 'done' : windowsActive ? 'active' : 'pending',
    },
  )
  return steps
}

export function isFaceSelectEnabled(
  flowStep: WorkspaceFlowStep,
  templateTab: TemplateTab,
  roomPhase: RoomPhase,
  options?: { initialDetectionBusy?: boolean },
): boolean {
  if (options?.initialDetectionBusy) return false
  return (
    flowStep === 'templates' &&
    templateTab === 'walls' &&
    (roomPhase === 'review' || roomPhase === 'done')
  )
}

export function isOcrHitRemoveEnabled(params: {
  ocrOverlayCount: number
  flowStep: WorkspaceFlowStep
  preprocessTab: PreprocessPanelLayer
  templateTab: TemplateTab
  showOcrText: boolean
  ocrEnabled?: boolean
}): boolean {
  if (params.ocrOverlayCount === 0) return false
  const onOcrTab =
    (params.flowStep === 'preprocess' && params.preprocessTab === 'ocr') ||
    (params.flowStep === 'templates' && params.templateTab === 'ocr')
  const onWallsWithOcr =
    params.flowStep === 'templates' && params.templateTab === 'walls' && params.ocrEnabled === true
  return onOcrTab || params.showOcrText || onWallsWithOcr
}

export function isLayerDebugVisible(
  flowStep: WorkspaceFlowStep,
  preprocessTab: PreprocessPanelLayer,
  templateTab: TemplateTab,
): boolean {
  return (
    (flowStep === 'preprocess' && preprocessTab === 'walls') ||
    flowStep === 'result' ||
    (flowStep === 'templates' && usesWallDetectionOverlays(templateTab))
  )
}

export function isDebugExportsVisible(flowStep: WorkspaceFlowStep): boolean {
  return flowStep === 'input' || flowStep === 'templates' || flowStep === 'result'
}

export function isOnFmlResultTab(flowStep: WorkspaceFlowStep, resultTab: ResultViewTab): boolean {
  return flowStep === 'result' && resultTab === 'vector'
}

export function isGapsDevPanelVisible(
  flowStep: WorkspaceFlowStep,
  preprocessTab: PreprocessPanelLayer,
  templateTab: TemplateTab,
): boolean {
  return (
    (flowStep === 'preprocess' && preprocessTab === 'gaps') ||
    (flowStep === 'templates' && usesGapsFaceOverlay(templateTab))
  )
}

export function isDoorsDevPanelVisible(
  flowStep: WorkspaceFlowStep,
  templateTab: TemplateTab,
): boolean {
  return flowStep === 'templates' && usesDoorSwingOverlay(templateTab)
}

export function isWindowsDevPanelVisible(
  flowStep: WorkspaceFlowStep,
  templateTab: TemplateTab,
): boolean {
  return flowStep === 'templates' && usesWindowOverlay(templateTab)
}

/** Dev-view switcher voor verborgen canvas-tabs (stap 2–4). */
export function isDevViewPanelVisible(flowStep: WorkspaceFlowStep): boolean {
  return flowStep === 'preprocess' || flowStep === 'templates' || flowStep === 'result'
}

export function isDebugSidebarEmpty(params: {
  isDev: boolean
  layerDebugVisible: boolean
  debugExportsVisible: boolean
  probeVisible: boolean
  fmlDevPanelVisible: boolean
  gapsDevPanelVisible?: boolean
  doorsDevPanelVisible?: boolean
  windowsDevPanelVisible?: boolean
  devViewPanelVisible?: boolean
}): boolean {
  return (
    !params.isDev &&
    !params.layerDebugVisible &&
    !params.debugExportsVisible &&
    !params.probeVisible &&
    !params.fmlDevPanelVisible &&
    !params.gapsDevPanelVisible &&
    !params.doorsDevPanelVisible &&
    !params.windowsDevPanelVisible &&
    !params.devViewPanelVisible
  )
}
