import { tally } from '@/core/diagnostics'
import { computed, ref, watch, type Ref } from 'vue'
import type { ElementClass } from '@/core/extraction/types'
import type { SelectionRect } from '@/platform/selection'
import type { ResultViewTab } from '@/cv/pipeline/merge-tab-outputs'
import {
  type PreprocessPanelLayer,
  type TemplateTab,
  usesDoorSwingOverlay,
  usesGapsFaceOverlay,
  usesWindowOverlay,
} from '@/cv/preprocess/layer-preprocess'
import type { usePreprocessPreview } from '../usePreprocessPreview'
import { tGlobal } from '@/ui/i18n'
import {
  WORKSPACE_FLOW_LABELS,
  WORKSPACE_FLOW_ORDER,
  inputStepCanProceed,
  preprocessStepCanProceed,
  stickyPreprocessTab,
  stickyTemplateTab,
  type WorkspaceFlowStep,
} from './constants'

export function useWorkspaceFlow(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  imageSrc: Ref<string | null>
  running: Ref<boolean>
  scaleConfirmed: Ref<boolean>
  profileConfirmed: Ref<boolean>
  preprocessTab: Ref<PreprocessPanelLayer>
  templateTab: Ref<TemplateTab>
  resultTab: Ref<ResultViewTab>
  showOcrDetails: Ref<boolean>
  activeClass: Ref<ElementClass | null>
  rects: Ref<SelectionRect[]>
  referenceWallThicknessPx: Ref<number | null>
  ocrEnabled: Ref<boolean>
  preprocessPreview: ReturnType<typeof usePreprocessPreview>
  clearPolygonToolMode: () => void
  clearRects: () => void
  refreshMaskedWorkingImage: () => void
  commitInputStepImage: () => Promise<void>
  commitInkEdits: () => Promise<void>
  refreshLayerUnderlayPreview: (layer?: PreprocessPanelLayer) => Promise<void>
  refreshAllDetectionUnderlays: () => Promise<void>
  refreshOcrUnderlayPreview: () => Promise<void>
  refreshSignaturePreview: () => Promise<void>
  onApplyPreprocessPreview: () => Promise<void>
  ensureVectorCacheIfNeeded: () => Promise<void>
  vectorCacheLoading: Ref<boolean>
  autoClassifyWalls: () => Promise<boolean>
  runOcrScan: () => Promise<void>
  measureWallReferenceThickness: (rect: SelectionRect) => Promise<number | null>
  wallsDetectionComplete?: () => boolean
  devSessionRestoring?: Ref<boolean>
  onEnterResultStep?: () => Promise<void> | void
  setLocalError?: (message: string | null) => void
  resetInkOverlay?: () => void
  /** Stap 0 project-gates. */
  projectCanProceed?: () => boolean
  onLeaveProjectStep?: () => Promise<void> | void
  onEnterProjectStep?: () => void
}) {
  const flowOrder = WORKSPACE_FLOW_ORDER
  const flowLabels = WORKSPACE_FLOW_LABELS
  const flowStepCount = flowOrder.length
  /** True tot auto-OCR (+ start classify) bij enter stap 3 klaar is. */
  const ocrInitialPassReady = ref(true)
  /** Onderdrukt templateTab-watch autoClassify tijdens enter-bootstrap. */
  let bootstrappingTemplates = false

  const canGoBack = computed(() => flowOrder.indexOf(deps.flowStep.value) > 0)
  const flowStepIndex = computed(() => flowOrder.indexOf(deps.flowStep.value))
  const flowStepNumber = computed(() => flowStepIndex.value + 1)
  const nextFlowStep = computed(() => flowOrder[flowStepIndex.value + 1] ?? null)

  const nextStepButtonLabel = computed(() => {
    if (deps.flowStep.value === 'result') return tGlobal('flow.done')
    const next = nextFlowStep.value
    if (!next) return tGlobal('flow.next')
    return tGlobal('flow.nextWithStep', { step: flowLabels[next] })
  })

  const canGoNext = computed(() => {
    if (deps.running.value) return false
    switch (deps.flowStep.value) {
      case 'project':
        return deps.projectCanProceed?.() ?? false
      case 'input':
        return inputStepCanProceed({
          imageSrc: deps.imageSrc.value,
          scaleConfirmed: deps.scaleConfirmed.value,
        })
      case 'preprocess':
        return preprocessStepCanProceed({
          imageSrc: deps.imageSrc.value,
          hasWallRect: deps.rects.value.some((rect) => rect.type === 'wall'),
          vectorCacheLoading: deps.vectorCacheLoading.value,
        })
      // ESC:O-42 (B)
      case 'templates':
        if (deps.templateTab.value === 'walls' && !deps.wallsDetectionComplete?.()) {
          tally('O-42', 'walls_gate_block')
          return false
        }
        return true
      case 'result':
        return false
      default:
        return false
    }
  })

  const flowNextBlockedHint = computed(() => {
    if (canGoNext.value || deps.running.value) return ''
    switch (deps.flowStep.value) {
      case 'project':
        return tGlobal('flow.blocked.project')
      case 'input':
        if (!deps.imageSrc.value) return tGlobal('flow.blocked.upload')
        if (!deps.scaleConfirmed.value) return tGlobal('flow.blocked.confirmScale')
        return ''
      case 'preprocess':
        if (!deps.rects.value.some((rect) => rect.type === 'wall')) {
          return tGlobal('flow.blocked.wallRef')
        }
        return ''
      default:
        if (deps.flowStep.value === 'templates' && deps.templateTab.value === 'walls') {
          return tGlobal('flow.blocked.finalizeWalls')
        }
        return ''
    }
  })

  function goToPreviousStep() {
    const idx = flowOrder.indexOf(deps.flowStep.value)
    if (idx <= 0) return
    const prev = flowOrder[idx - 1]
    if (prev === 'project') {
      deps.onEnterProjectStep?.()
    }
    deps.flowStep.value = prev
  }

  async function goToNextStep() {
    if (!canGoNext.value) return
    if (deps.flowStep.value === 'project') {
      await deps.onLeaveProjectStep?.()
      // Hydrate kan al naar input/preprocess/… gezet hebben.
      if (deps.flowStep.value !== 'project') return
      deps.flowStep.value = 'input'
      return
    }
    if (deps.flowStep.value === 'input') {
      deps.refreshMaskedWorkingImage()
      await deps.commitInputStepImage()
      deps.preprocessPreview.clearPreview()
    } else if (deps.flowStep.value === 'preprocess') {
      await deps.commitInkEdits()
      await deps.refreshAllDetectionUnderlays()
      await deps.ensureVectorCacheIfNeeded()
      const wallRect = [...deps.rects.value].reverse().find((rect) => rect.type === 'wall')
      if (!wallRect) {
        deps.setLocalError?.(tGlobal('flow.blocked.wallRef'))
        return
      }
      const thickness = await deps.measureWallReferenceThickness(wallRect)
      if (thickness == null || thickness <= 0) {
        // measureWallReferenceThickness zet al een foutmelding
        return
      }
    } else if (deps.flowStep.value === 'templates') {
      await deps.commitInkEdits()
    }
    const idx = flowOrder.indexOf(deps.flowStep.value)
    if (idx < flowOrder.length - 1) {
      const nextStep = flowOrder[idx + 1]
      if (nextStep === 'result') {
        deps.resultTab.value = 'vector'
      }
      deps.flowStep.value = nextStep
    }
  }

  watch(
    () =>
      deps.rects.value.map(
        (rect) => `${rect.id}:${rect.x}:${rect.y}:${rect.width}:${rect.height}:${rect.type}`,
      ),
    () => {
      // Muren-tab gebruikt room-first (referentiedikte), geen LBE-signature preview.
      if (deps.flowStep.value === 'templates' && deps.templateTab.value !== 'walls') {
        void deps.refreshSignaturePreview()
      }
    },
  )

  function shouldSkipAutoClassify(): boolean {
    return deps.devSessionRestoring?.value === true
  }

  watch(deps.templateTab, () => {
    if (shouldSkipAutoClassify() || bootstrappingTemplates) return
    if (deps.flowStep.value === 'templates') {
      const tab = deps.templateTab.value
      if (tab === 'ocr') {
        void deps.refreshOcrUnderlayPreview()
        return
      }
      if (usesGapsFaceOverlay(tab)) {
        // Zelfde muur-onderlegger als Muren; demote-overlay refresht apart.
        void deps.refreshLayerUnderlayPreview('walls')
        return
      }
      if (usesDoorSwingOverlay(tab)) {
        // Deuren-overlay tekent op muur-B/W en gebruikt roomClassify + refs.
        void deps.refreshLayerUnderlayPreview('walls')
        return
      }
      if (usesWindowOverlay(tab)) {
        // Ramen-overlay tekent op muur-B/W en gebruikt roomClassify + refs.
        void deps.refreshLayerUnderlayPreview('walls')
        return
      }
      deps.preprocessTab.value = 'walls'
      void deps.refreshLayerUnderlayPreview('walls')
      void deps.refreshSignaturePreview()
      if (tab === 'walls' && deps.profileConfirmed.value) {
        void deps.autoClassifyWalls()
      }
    }
  })

  watch(
    () => deps.profileConfirmed.value,
    (confirmed) => {
      if (shouldSkipAutoClassify() || bootstrappingTemplates) return
      if (confirmed && deps.flowStep.value === 'templates' && deps.templateTab.value === 'walls') {
        void deps.autoClassifyWalls()
      }
    },
  )

  watch(deps.flowStep, (step, prev) => {
    if (prev === 'input' && step !== 'input') {
      deps.clearPolygonToolMode()
      deps.activeClass.value = null
      deps.refreshMaskedWorkingImage()
      deps.preprocessPreview.clearPreview()
    }
    if (prev === 'preprocess' && step === 'input') {
      // Refs liggen op gebakken onderlegger; terug naar stap 1 → opnieuw tekenen.
      deps.clearRects()
      deps.referenceWallThicknessPx.value = null
      deps.activeClass.value = null
      deps.resetInkOverlay?.()
    }
    if (prev === 'preprocess' && step === 'templates') {
      deps.templateTab.value = 'walls'
      deps.preprocessTab.value = 'walls'
      deps.activeClass.value = null
      if (!shouldSkipAutoClassify()) {
        bootstrappingTemplates = true
        ocrInitialPassReady.value = !deps.ocrEnabled.value
        void (async () => {
          try {
            if (deps.ocrEnabled.value) {
              await deps.runOcrScan()
              ocrInitialPassReady.value = true
            }
            if (deps.profileConfirmed.value && !shouldSkipAutoClassify()) {
              await deps.autoClassifyWalls()
            }
          } finally {
            ocrInitialPassReady.value = true
            bootstrappingTemplates = false
          }
        })()
      } else {
        ocrInitialPassReady.value = true
      }
    }
    if (step === 'templates') {
      deps.activeClass.value = null
      void deps.refreshAllDetectionUnderlays()
    } else {
      deps.showOcrDetails.value = false
    }
    if (step === 'result') {
      void deps.refreshLayerUnderlayPreview('walls')
      void deps.onEnterResultStep?.()
    }
  })

  watch(
    () => deps.ocrEnabled.value,
    (enabled) => {
      if (enabled) return
      if (deps.preprocessTab.value === 'ocr') deps.preprocessTab.value = 'walls'
      if (deps.templateTab.value === 'ocr') deps.templateTab.value = 'walls'
      deps.showOcrDetails.value = false
    },
  )

  // Sticky OCR/gaps → walls (zie stickyPreprocessTab / stickyTemplateTab).
  // GAPS sticky; inkWall/doors/windows/ocr blijven bereikbaar via Dev-view (geen sticky).
  watch(
    [deps.preprocessTab, deps.templateTab],
    () => {
      const pp = stickyPreprocessTab(deps.preprocessTab.value)
      if (pp !== deps.preprocessTab.value) deps.preprocessTab.value = pp
      const tt = stickyTemplateTab(deps.templateTab.value)
      if (tt !== deps.templateTab.value) deps.templateTab.value = tt
    },
    { immediate: true },
  )

  return {
    flowOrder,
    flowLabels,
    flowStepCount,
    canGoBack,
    flowStepIndex,
    flowStepNumber,
    nextStepButtonLabel,
    canGoNext,
    flowNextBlockedHint,
    goToPreviousStep,
    goToNextStep,
    ocrInitialPassReady,
  }
}
