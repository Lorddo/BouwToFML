import { onMounted, onUnmounted, type Ref } from 'vue'
import type { PreprocessConfig } from '@/platform/image'
import { emptyTabOutputs, type TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import { resolveOcrLanguage, warmUpOcrWorker } from '@/cv/port/ocrWorker'
import type { WorkspaceFlowStep } from './constants'

export function useWorkspaceLifecycle(deps: {
  clearRects: () => void
  extractionLastOutput: Ref<unknown>
  localError: Ref<string | null>
  preprocess: Ref<PreprocessConfig>
  preprocessPreview: { clearPreview: () => void }
  preprocessVectorCache: { clear: () => void }
  inputMask: { resetMaskState: () => void; onMaskUndoKeydown: (event: KeyboardEvent) => void }
  inkEdit: { resetInkEdit: () => void; onInkUndoKeydown: (event: KeyboardEvent) => void }
  clearWallStamp?: () => void
  scaleUi: { resetScaleFull: () => void; resetScaleUi: () => void }
  signature: { resetSignaturePreview: () => void }
  tabOutputs: Ref<TabDetectionOutputs>
  fml: { clearImportedFml: () => void; resetFmlSessionDefaults: () => void }
  profileConfirmed: Ref<boolean>
  showOcrDetails: Ref<boolean>
  roomFaces: { resetRoomState: () => void }
  doorSwingFaces?: {
    resetDoorSwingState: () => void
    resetAutoDoorPassGate: () => void
  }
  windowFaces?: {
    resetWindowState: () => void
    invalidateAutoWindowPass: () => void
  }
  referenceWallThicknessPx: Ref<number | null>
  wallsDetectionComplete: Ref<boolean>
  flowStep: Ref<WorkspaceFlowStep>
  preprocessUi: { clearLivePreviewTimer: () => void }
  image: { resetImageSource: () => void }
  /** Non-empty underlay → warn on tab close/refresh. */
  imageSrc: Ref<string>
  /**
   * Na factory-reset van FML-sessie-defaults: herstel actieve vloer-defaults
   * (o.a. bovenlicht). Late-bound — project composable bestaat pas na lifecycle.
   */
  restoreFmlDefaultsFromActiveFloor?: () => void
}) {
  function clearOpeningOverlays(): void {
    deps.doorSwingFaces?.resetDoorSwingState()
    deps.doorSwingFaces?.resetAutoDoorPassGate()
    deps.windowFaces?.resetWindowState()
    deps.windowFaces?.invalidateAutoWindowPass()
  }

  function clearWorkspaceForSession() {
    deps.clearRects()
    deps.extractionLastOutput.value = null
    deps.preprocessVectorCache.clear()
    deps.signature.resetSignaturePreview()
    deps.tabOutputs.value = emptyTabOutputs()
    deps.fml.clearImportedFml()
    deps.showOcrDetails.value = false
    deps.roomFaces.resetRoomState()
    clearOpeningOverlays()
    deps.referenceWallThicknessPx.value = null
    deps.wallsDetectionComplete.value = false
  }

  function resetWorkspace() {
    clearWorkspaceForSession()
    deps.localError.value = null
    deps.preprocessPreview.clearPreview()
    deps.inputMask.resetMaskState()
    deps.inkEdit.resetInkEdit()
    deps.clearWallStamp?.()
    deps.scaleUi.resetScaleFull()
    deps.profileConfirmed.value = true
    deps.flowStep.value = 'input'
  }

  function applyNewUnderlayReset() {
    deps.preprocessUi.clearLivePreviewTimer()
    deps.preprocessPreview.clearPreview()
    deps.preprocessVectorCache.clear()
    deps.clearRects()
    deps.image.resetImageSource()
    deps.scaleUi.resetScaleUi()
    deps.inputMask.resetMaskState()
    deps.inkEdit.resetInkEdit()
    deps.clearWallStamp?.()
    deps.signature.resetSignaturePreview()
    deps.tabOutputs.value = emptyTabOutputs()
    deps.fml.clearImportedFml()
    deps.fml.resetFmlSessionDefaults()
    // resetFmlSessionDefaults zet o.a. bovenlicht op factory-false; project-/vloerdefault terugzetten.
    deps.restoreFmlDefaultsFromActiveFloor?.()
    deps.profileConfirmed.value = true
    deps.showOcrDetails.value = false
    deps.roomFaces.resetRoomState()
    clearOpeningOverlays()
    deps.referenceWallThicknessPx.value = null
    deps.wallsDetectionComplete.value = false
    deps.flowStep.value = 'input'
  }

  function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!deps.imageSrc.value) return
    event.preventDefault()
    event.returnValue = ''
  }

  onMounted(() => {
    window.addEventListener('keydown', deps.inputMask.onMaskUndoKeydown)
    window.addEventListener('keydown', deps.inkEdit.onInkUndoKeydown)
    window.addEventListener('beforeunload', onBeforeUnload)
    if (deps.preprocess.value.ocrEnabled) {
      void warmUpOcrWorker(resolveOcrLanguage(deps.preprocess.value.ocrLanguages))
    }
  })

  onUnmounted(() => {
    deps.preprocessUi.clearLivePreviewTimer()
    window.removeEventListener('keydown', deps.inputMask.onMaskUndoKeydown)
    window.removeEventListener('keydown', deps.inkEdit.onInkUndoKeydown)
    window.removeEventListener('beforeunload', onBeforeUnload)
  })

  return {
    clearWorkspaceForSession,
    resetWorkspace,
    applyNewUnderlayReset,
  }
}
