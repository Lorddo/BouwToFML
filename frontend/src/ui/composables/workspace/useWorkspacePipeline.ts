import { computed, type ComputedRef, type Ref } from 'vue'

import type { ExtractionOutput } from '@/core/extraction'

import type { SelectionRect } from '@/platform/selection'

import type { ResultViewTab } from '@/cv/pipeline/merge-tab-outputs'

import { mergeTabOutputs } from '@/cv/pipeline/merge-tab-outputs'

import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'

import {
  isWallTechniqueTab,
  templateTabToElementClass,
  usesDoorSwingOverlay,
  usesGapsFaceOverlay,
  usesWindowOverlay,
} from '@/cv/preprocess/layer-preprocess'

import { isDetectionLayerId, isValidTabOutput } from '@/cv/workspace/layer-flow'

import { WORKSPACE_DETECTION_LAYER_ORDER } from '@/cv/workspace/layer-flow'

import type { WorkspaceFlowStep } from './constants'

export function useWorkspacePipeline(deps: {
  flowStep: Ref<WorkspaceFlowStep>

  templateTab: Ref<TemplateTab>

  resultTab: Ref<ResultViewTab>

  tabOutputs: Ref<import('@/cv/pipeline/merge-tab-outputs').TabDetectionOutputs>

  lastOutput: Ref<ExtractionOutput | null>

  rects: Ref<SelectionRect[]>

  running: Ref<boolean>

  scaleLocked: ComputedRef<boolean>

  profileConfirmed: Ref<boolean>

  ocrMaskApplied: Ref<boolean>

  wallsDetectionComplete: Ref<boolean>
}) {
  const combinedOutput = computed(() => mergeTabOutputs(deps.tabOutputs.value))

  function wallsTabComplete(): boolean {
    const output = deps.tabOutputs.value.walls
    const phase = output?.meta?.roomPipelinePhase
    if (phase === 'finalize' || phase === 'full') {
      return isValidTabOutput(output)
    }
    return deps.wallsDetectionComplete.value
  }

  const activePipelineOutput = computed((): ExtractionOutput | null => {
    if (deps.flowStep.value === 'templates') {
      if (deps.templateTab.value === 'ocr') return null

      // Gaten/Deuren/Ramen: eigen face-overlays — geen muur-mirror via tabOutputs.walls
      if (usesGapsFaceOverlay(deps.templateTab.value)) return null
      if (usesDoorSwingOverlay(deps.templateTab.value)) return null
      if (usesWindowOverlay(deps.templateTab.value)) return null

      if (deps.templateTab.value === 'walls') return deps.tabOutputs.value.walls
      return null
    }

    if (deps.flowStep.value === 'result') {
      if (deps.resultTab.value === 'vector') {
        return combinedOutput.value
      }

      return deps.tabOutputs.value[deps.resultTab.value]
    }

    return deps.lastOutput.value
  })

  const templateElementClass = computed(() => templateTabToElementClass(deps.templateTab.value))

  const currentTabDetected = computed(() => {
    if (deps.flowStep.value === 'templates') {
      if (deps.templateTab.value === 'ocr') return deps.ocrMaskApplied.value

      if (deps.templateTab.value === 'walls') return wallsTabComplete()

      // Gaten/Deuren: faces beschikbaar na Muren-classify
      if (usesGapsFaceOverlay(deps.templateTab.value)) {
        return !!deps.tabOutputs.value.walls?.meta?.roomClassifyState?.labelsData
      }
      if (usesDoorSwingOverlay(deps.templateTab.value)) {
        return !!deps.tabOutputs.value.walls?.meta?.roomClassifyState?.labelsData
      }
      if (usesWindowOverlay(deps.templateTab.value)) {
        return !!deps.tabOutputs.value.walls?.meta?.roomClassifyState?.labelsData
      }

      return false
    }

    if (deps.flowStep.value === 'result' && deps.resultTab.value !== 'vector') {
      if (deps.resultTab.value === 'walls') return wallsTabComplete()

      return isValidTabOutput(deps.tabOutputs.value[deps.resultTab.value])
    }

    return isValidTabOutput(combinedOutput.value)
  })

  const rectsForTemplateTab = computed(() => {
    const cls = templateElementClass.value

    if (!cls) return []

    return deps.rects.value.filter((rect) => rect.type === cls)
  })

  const canGenerateCurrentTab = computed(
    () =>
      isWallTechniqueTab(deps.templateTab.value) &&
      !deps.running.value &&
      !deps.scaleLocked.value &&
      deps.profileConfirmed.value,
  )

  const lbeEnabled = computed(() => deps.flowStep.value === 'preprocess' && !deps.scaleLocked.value)

  const canExportReport = computed(() => {
    if (deps.rects.value.length > 0) return true

    if (deps.ocrMaskApplied.value) return true

    return WORKSPACE_DETECTION_LAYER_ORDER.some((tab) =>
      isValidTabOutput(deps.tabOutputs.value[tab]),
    )
  })

  return {
    combinedOutput,

    activePipelineOutput,

    templateElementClass,

    currentTabDetected,

    rectsForTemplateTab,

    canGenerateCurrentTab,

    canExportReport,

    lbeEnabled,

    tabOutputReady: (layer: string) => {
      if (layer === 'walls') return wallsTabComplete()
      if (layer === 'gaps') {
        return !!deps.tabOutputs.value.walls?.meta?.roomClassifyState?.labelsData
      }
      if (layer === 'doors') {
        return !!deps.tabOutputs.value.walls?.meta?.roomClassifyState?.labelsData
      }
      if (layer === 'windows') {
        return !!deps.tabOutputs.value.walls?.meta?.roomClassifyState?.labelsData
      }
      return isDetectionLayerId(layer) ? isValidTabOutput(deps.tabOutputs.value[layer]) : false
    },
  }
}
