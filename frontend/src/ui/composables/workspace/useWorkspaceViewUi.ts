import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { ResultViewTab } from '@/cv/pipeline/merge-tab-outputs'
import type { PreprocessPanelLayer, TemplateTab } from '@/cv/preprocess/layer-preprocess'
import type { WorkspaceFlowStep } from './constants'
import type { RoomPhase } from './useWorkspaceRoomFaces'
import {
  isDoorsDevPanelVisible,
  isDebugExportsVisible,
  isDebugSidebarEmpty,
  isFaceSelectEnabled,
  isGapsDevPanelVisible,
  isLayerDebugVisible,
  isOcrHitRemoveEnabled,
  isOnFmlResultTab,
  isTemplatesInitialDetectionBusy,
  isWindowsDevPanelVisible,
  resolveTemplatesInitialDetectionSteps,
  type TemplatesInitialDetectionStep,
} from './workspace-view-visibility'

export function useWorkspaceViewUi(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  preprocessTab: Ref<PreprocessPanelLayer>
  templateTab: Ref<TemplateTab>
  resultTab: Ref<ResultViewTab>
  roomPhase: Ref<RoomPhase>
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
}) {
  const isDev = deps.isDev ?? import.meta.env.DEV

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
    }),
  )

  const templatesInitialDetectionSteps = computed((): TemplatesInitialDetectionStep[] =>
    resolveTemplatesInitialDetectionSteps({
      roomPhase: deps.roomPhase.value,
      classifyingInFlight: deps.classifyingInFlight.value,
      doorInitialPassReady: deps.doorInitialPassReady.value,
      windowInitialPassReady: deps.windowInitialPassReady.value,
    }),
  )

  const faceSelectEnabled = computed(() =>
    isFaceSelectEnabled(deps.flowStep.value, deps.templateTab.value, deps.roomPhase.value, {
      initialDetectionBusy: templatesInitialDetectionBusy.value,
    }),
  )

  const ocrHitRemoveEnabled = computed(() =>
    isOcrHitRemoveEnabled({
      ocrOverlayCount: deps.ocrTextOverlays.value.length,
      flowStep: deps.flowStep.value,
      preprocessTab: deps.preprocessTab.value,
      templateTab: deps.templateTab.value,
      showOcrText: deps.showOcrText.value,
    }),
  )

  const layerDebugVisible = computed(() =>
    isLayerDebugVisible(deps.flowStep.value, deps.preprocessTab.value, deps.templateTab.value),
  )

  const debugExportsVisible = computed(() => isDebugExportsVisible(deps.flowStep.value))

  const hasUsedWallMask = computed(() => !!deps.combinedOutput.value?.roomWallMaskRle)

  const debugSidebarVisible = computed(() => !!deps.imageSrc.value)

  const onFmlResultTab = computed(() =>
    isOnFmlResultTab(deps.flowStep.value, deps.resultTab.value),
  )

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
    }),
  )

  function startNewWorkspace(): void {
    deps.resetWorkspace()
  }

  return {
    isDev,
    templatesInitialDetectionBusy,
    templatesInitialDetectionSteps,
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
    debugSidebarEmpty,
    startNewWorkspace,
  } satisfies {
    isDev: boolean
    templatesInitialDetectionBusy: ComputedRef<boolean>
    templatesInitialDetectionSteps: ComputedRef<TemplatesInitialDetectionStep[]>
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
    debugSidebarEmpty: ComputedRef<boolean>
    startNewWorkspace: () => void
  }
}
