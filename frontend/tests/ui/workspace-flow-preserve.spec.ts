import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useWorkspaceFlow } from '@/ui/composables/workspace/useWorkspaceFlow'
import type { WorkspaceFlowStep } from '@/ui/composables/workspace/constants'

function createFlowHarness(options?: {
  hasTemplatesDetection?: () => boolean
  wallsDetectionComplete?: () => boolean
}) {
  const flowStep = ref<WorkspaceFlowStep>('result')
  const imageSrc = ref<string | null>('data:image/png;base64,xx')
  const running = ref(false)
  const scaleConfirmed = ref(true)
  const profileConfirmed = ref(true)
  const preprocessTab = ref('walls' as const)
  const templateTab = ref('walls' as const)
  const resultTab = ref('vector' as const)
  const showOcrDetails = ref(false)
  const activeClass = ref(null)
  const rects = ref([{ id: 'w1', type: 'wall' as const, x: 0, y: 0, width: 40, height: 10 }])
  const referenceWallThicknessPx = ref<number | null>(42)
  const ocrEnabled = ref(false)
  const vectorCacheLoading = ref(false)
  const clearRects = vi.fn()
  const resetInkOverlay = vi.fn()
  const autoClassifyWalls = vi.fn(async () => true)
  const runOcrScan = vi.fn(async () => undefined)
  const measureWallReferenceThickness = vi.fn(async () => 42)

  const flow = useWorkspaceFlow({
    flowStep,
    imageSrc,
    running,
    scaleConfirmed,
    profileConfirmed,
    preprocessTab: preprocessTab,
    templateTab: templateTab,
    resultTab: resultTab,
    showOcrDetails,
    activeClass: activeClass,
    rects: rects,
    referenceWallThicknessPx,
    ocrEnabled,
    preprocessPreview: {
      clearPreview: vi.fn(),
    } as never,
    clearPolygonToolMode: vi.fn(),
    clearRects,
    refreshMaskedWorkingImage: vi.fn(),
    commitInputStepImage: vi.fn(async () => undefined),
    commitInkEdits: vi.fn(async () => undefined),
    refreshLayerUnderlayPreview: vi.fn(async () => undefined),
    refreshAllDetectionUnderlays: vi.fn(async () => undefined),
    refreshOcrUnderlayPreview: vi.fn(async () => undefined),
    refreshSignaturePreview: vi.fn(async () => undefined),
    onApplyPreprocessPreview: vi.fn(async () => undefined),
    ensureVectorCacheIfNeeded: vi.fn(async () => undefined),
    vectorCacheLoading,
    autoClassifyWalls,
    runOcrScan,
    measureWallReferenceThickness,
    wallsDetectionComplete: options?.wallsDetectionComplete ?? (() => true),
    hasTemplatesDetection: options?.hasTemplatesDetection ?? (() => true),
    resetInkOverlay,
  })

  return {
    flow,
    flowStep,
    rects,
    referenceWallThicknessPx,
    clearRects,
    resetInkOverlay,
    autoClassifyWalls,
    runOcrScan,
    measureWallReferenceThickness,
  }
}

describe('useWorkspaceFlow — stap-terug bewaart werk', () => {
  it('wist geen refs/dikte/inkt bij terug van preprocess → input', async () => {
    const h = createFlowHarness()
    h.flowStep.value = 'preprocess'
    await nextTick()

    h.flow.goToPreviousStep()
    await nextTick()

    expect(h.flowStep.value).toBe('input')
    expect(h.clearRects).not.toHaveBeenCalled()
    expect(h.resetInkOverlay).not.toHaveBeenCalled()
    expect(h.referenceWallThicknessPx.value).toBe(42)
    expect(h.rects.value).toHaveLength(1)
  })

  it('herstart geen OCR/classify bij opnieuw enter templates met bestaande detectie', async () => {
    const h = createFlowHarness({ hasTemplatesDetection: () => true })
    h.flowStep.value = 'preprocess'
    await nextTick()

    h.flowStep.value = 'templates'
    await nextTick()
    await Promise.resolve()

    expect(h.runOcrScan).not.toHaveBeenCalled()
    expect(h.autoClassifyWalls).not.toHaveBeenCalled()
  })

  it('meet geen dikte opnieuw bij vooruit preprocess→templates als dikte al bekend', async () => {
    const h = createFlowHarness({ wallsDetectionComplete: () => true })
    h.flowStep.value = 'preprocess'
    await nextTick()

    await h.flow.goToNextStep()
    await nextTick()

    expect(h.measureWallReferenceThickness).not.toHaveBeenCalled()
    expect(h.flowStep.value).toBe('templates')
  })

  it('kan na result→templates weer vooruit (wallsDetectionComplete)', async () => {
    const h = createFlowHarness({ wallsDetectionComplete: () => true })
    h.flowStep.value = 'result'
    await nextTick()

    h.flow.goToPreviousStep()
    await nextTick()
    expect(h.flowStep.value).toBe('templates')
    expect(h.flow.canGoNext.value).toBe(true)

    await h.flow.goToNextStep()
    await nextTick()
    expect(h.flowStep.value).toBe('result')
  })
})
