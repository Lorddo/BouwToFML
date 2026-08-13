import { tally } from '@/core/diagnostics'
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { ResultViewTab } from '@/cv/pipeline/merge-tab-outputs'
import type { PreprocessPanelLayer, TemplateTab } from '@/cv/preprocess/layer-preprocess'
import { tGlobal } from '@/ui/i18n'
import type { WorkspaceFlowStep } from './constants'
import type { RoomPhase } from './useWorkspaceRoomFaces'
import {
  isDoorsDevPanelVisible,
  isDebugExportsVisible,
  isDebugSidebarEmpty,
  isDevViewPanelVisible,
  isFaceSelectEnabled,
  isGapsDevPanelVisible,
  isLayerDebugVisible,
  isOcrHitRemoveEnabled,
  isOnFmlResultTab,
  isTemplatesFinalizeBusy,
  isTemplatesInitialDetectionBusy,
  isWindowsDevPanelVisible,
  resolveTemplatesFinalizeSteps,
  resolveTemplatesInitialDetectionSteps,
  type TemplatesBusyStep,
  type TemplatesFinalizePhase,
} from './workspace-view-visibility'

export function useWorkspaceViewUi(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  preprocessTab: Ref<PreprocessPanelLayer>
  templateTab: Ref<TemplateTab>
  resultTab: Ref<ResultViewTab>
  roomPhase: Ref<RoomPhase>
  finalizePhase: Ref<TemplatesFinalizePhase | null>
  classifyingInFlight: Ref<boolean>
  doorInitialPassReady: Ref<boolean>
  windowInitialPassReady: Ref<boolean>
  ocrTextOverlays: ComputedRef<readonly unknown[]>
  showOcrText: Ref<boolean>
  combinedOutput: Ref<{ roomWallMaskRle?: unknown } | null | undefined>
  imageSrc: Ref<string | null | undefined>
  probeVisible: Ref<boolean>
  resetWorkspace: () => void
  isDev?: boolean
  ocrEnabled?: Ref<boolean> | ComputedRef<boolean>
  ocrScanning?: Ref<boolean>
  ocrInitialPassReady?: Ref<boolean>
}) {
  const isDev = deps.isDev ?? import.meta.env.DEV

  // ESC:O-44 (B)
  /** Eerste muren+deuren+ramen-pass afgerond; face-edits mogen overlay niet opnieuw tonen. */
  const initialDetectionSettled = ref(false)

  watch(
    () =>
      [
        deps.roomPhase.value,
        deps.classifyingInFlight.value,
        deps.doorInitialPassReady.value,
        deps.windowInitialPassReady.value,
      ] as const,
    ([phase, inFlight, doorReady, windowReady]) => {
      if (phase === 'classifying' || phase === 'recalculating' || inFlight) {
        initialDetectionSettled.value = false
        return
      }
      if (phase === 'review' && doorReady && windowReady) {
        if (!initialDetectionSettled.value) tally('O-44', 'settled')
        initialDetectionSettled.value = true
      }
      if (phase === 'idle') {
        initialDetectionSettled.value = false
      }
    },
    { immediate: true },
  )

  const templatesInitialDetectionBusy = computed(() =>
    isTemplatesInitialDetectionBusy({
      flowStep: deps.flowStep.value,
      roomPhase: deps.roomPhase.value,
      classifyingInFlight: deps.classifyingInFlight.value,
      doorInitialPassReady: deps.doorInitialPassReady.value,
      windowInitialPassReady: deps.windowInitialPassReady.value,
      initialDetectionSettled: initialDetectionSettled.value,
      ocrEnabled: deps.ocrEnabled?.value === true,
      ocrScanning: deps.ocrScanning?.value === true,
      ocrInitialPassReady: deps.ocrInitialPassReady?.value,
    }),
  )

  const templatesFinalizeBusy = computed(() => isTemplatesFinalizeBusy(deps.finalizePhase.value))

  /** Detectie- of afrond-overlay actief (zelfde canvas-card). */
  const templatesBusyOverlay = computed(
    () => templatesInitialDetectionBusy.value || templatesFinalizeBusy.value,
  )

  const templatesBusyOverlayTitle = computed(() =>
    templatesFinalizeBusy.value
      ? tGlobal('templates.finalizeOverlay.title')
      : tGlobal('templates.detectionOverlay.title'),
  )

  const templatesBusyOverlaySteps = computed((): TemplatesBusyStep[] => {
    if (templatesFinalizeBusy.value) {
      return resolveTemplatesFinalizeSteps(deps.finalizePhase.value)
    }
    return resolveTemplatesInitialDetectionSteps({
      roomPhase: deps.roomPhase.value,
      classifyingInFlight: deps.classifyingInFlight.value,
      doorInitialPassReady: deps.doorInitialPassReady.value,
      windowInitialPassReady: deps.windowInitialPassReady.value,
      ocrEnabled: deps.ocrEnabled?.value === true,
      ocrScanning: deps.ocrScanning?.value === true,
      ocrInitialPassReady: deps.ocrInitialPassReady?.value,
    })
  })

  const faceSelectEnabled = computed(() =>
    isFaceSelectEnabled(deps.flowStep.value, deps.templateTab.value, deps.roomPhase.value, {
      initialDetectionBusy: templatesBusyOverlay.value,
    }),
  )

  const ocrHitRemoveEnabled = computed(() =>
    isOcrHitRemoveEnabled({
      ocrOverlayCount: deps.ocrTextOverlays.value.length,
      flowStep: deps.flowStep.value,
      preprocessTab: deps.preprocessTab.value,
      templateTab: deps.templateTab.value,
      showOcrText: deps.showOcrText.value,
      ocrEnabled: deps.ocrEnabled?.value === true,
    }),
  )

  const layerDebugVisible = computed(() =>
    isLayerDebugVisible(deps.flowStep.value, deps.preprocessTab.value, deps.templateTab.value),
  )

  const debugExportsVisible = computed(() => isDebugExportsVisible(deps.flowStep.value))

  const hasUsedWallMask = computed(() => !!deps.combinedOutput.value?.roomWallMaskRle)

  const debugSidebarVisible = computed(() => !!deps.imageSrc.value)

  const onFmlResultTab = computed(() => isOnFmlResultTab(deps.flowStep.value, deps.resultTab.value))

  const fmlDevPanelVisible = computed(() => onFmlResultTab.value)

  const gapsDevPanelVisible = computed(() =>
    isGapsDevPanelVisible(deps.flowStep.value, deps.preprocessTab.value, deps.templateTab.value),
  )

  const doorsDevPanelVisible = computed(() =>
    isDoorsDevPanelVisible(deps.flowStep.value, deps.templateTab.value),
  )

  const windowsDevPanelVisible = computed(() =>
    isWindowsDevPanelVisible(deps.flowStep.value, deps.templateTab.value),
  )

  const devViewPanelVisible = computed(() => isDevViewPanelVisible(deps.flowStep.value))

  const debugSidebarEmpty = computed(() =>
    isDebugSidebarEmpty({
      isDev,
      layerDebugVisible: layerDebugVisible.value,
      debugExportsVisible: debugExportsVisible.value,
      probeVisible: deps.probeVisible.value,
      fmlDevPanelVisible: fmlDevPanelVisible.value,
      gapsDevPanelVisible: gapsDevPanelVisible.value,
      doorsDevPanelVisible: doorsDevPanelVisible.value,
      windowsDevPanelVisible: windowsDevPanelVisible.value,
      devViewPanelVisible: devViewPanelVisible.value,
    }),
  )

  function startNewWorkspace(): void {
    deps.resetWorkspace()
  }

  return {
    isDev,
    templatesInitialDetectionBusy,
    templatesBusyOverlay,
    templatesBusyOverlayTitle,
    templatesBusyOverlaySteps,
    faceSelectEnabled,
    ocrHitRemoveEnabled,
    layerDebugVisible,
    debugExportsVisible,
    hasUsedWallMask,
    debugSidebarVisible,
    onFmlResultTab,
    fmlDevPanelVisible,
    gapsDevPanelVisible,
    doorsDevPanelVisible,
    windowsDevPanelVisible,
    devViewPanelVisible,
    debugSidebarEmpty,
    startNewWorkspace,
  } satisfies {
    isDev: boolean
    templatesInitialDetectionBusy: ComputedRef<boolean>
    templatesBusyOverlay: ComputedRef<boolean>
    templatesBusyOverlayTitle: ComputedRef<string>
    templatesBusyOverlaySteps: ComputedRef<TemplatesBusyStep[]>
    faceSelectEnabled: ComputedRef<boolean>
    ocrHitRemoveEnabled: ComputedRef<boolean>
    layerDebugVisible: ComputedRef<boolean>
    debugExportsVisible: ComputedRef<boolean>
    hasUsedWallMask: ComputedRef<boolean>
    debugSidebarVisible: ComputedRef<boolean>
    onFmlResultTab: ComputedRef<boolean>
    fmlDevPanelVisible: ComputedRef<boolean>
    gapsDevPanelVisible: ComputedRef<boolean>
    doorsDevPanelVisible: ComputedRef<boolean>
    windowsDevPanelVisible: ComputedRef<boolean>
    devViewPanelVisible: ComputedRef<boolean>
    debugSidebarEmpty: ComputedRef<boolean>
    startNewWorkspace: () => void
  }
}
