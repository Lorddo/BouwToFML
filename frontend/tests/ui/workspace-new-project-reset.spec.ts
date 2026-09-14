import { ref, type Ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useHScaleCalibration } from '@/platform/calibration'
import { DEFAULT_PREPROCESS, type PreprocessConfig } from '@/platform/image'
import { emptyTabOutputs } from '@/cv/pipeline/merge-tab-outputs'
import { normalizeStoredPreprocess } from '@/cv/preprocess/layer-preprocess-normalize'
import { useWorkspaceScale } from '@/ui/composables/workspace/useWorkspaceScale'
import { useWorkspaceLifecycle } from '@/ui/composables/workspace/useWorkspaceLifecycle'
import type { WorkspaceFlowStep } from '@/ui/composables/workspace/constants'

/**
 * «Nieuw project» mag niets van het vorige project meedragen. De valkuil is dat
 * `useWorkspace()` één instantie is zolang de workspace-view gemount blijft: de
 * project-state wordt wel vervangen, maar losse refs in de composable niet.
 * Gemeld tijdens een smoke-test: schaal (stap 1) en B/W-drempel (stap 2) van het
 * vorige project stonden er nog.
 */
describe('nieuw project begint schoon', () => {
  function scaleUiWithConfirmedScale() {
    const scale = useHScaleCalibration()
    const originalImageEl = ref<HTMLImageElement | null>(null)
    const scaleUi = useWorkspaceScale({ scale, originalImageEl })

    scale.init(1000, 800)
    scale.state.value = { xLeft: 100, xRight: 300, xGuideY: 400, yTop: 50, yBottom: 250, yGuideX: 500 }
    scale.distanceMmX.value = 1234
    scale.distanceMmY.value = 5678
    scale.confirm()
    expect(scale.confirmed.value).toBe(true)

    return { scale, scaleUi }
  }

  it('resetScaleFull wist ook de getypte mm', () => {
    const { scale, scaleUi } = scaleUiWithConfirmedScale()
    scaleUi.resetScaleFull()

    expect(scale.distanceMmX.value).toBe(3000)
    expect(scale.distanceMmY.value).toBe(3000)
    expect(scale.confirmed.value).toBe(false)
    expect(scale.state.value).toBeNull()
  })

  it('resetScaleUi laat de mm juist staan (nieuwe onderlegger, zelfde project)', () => {
    const { scale, scaleUi } = scaleUiWithConfirmedScale()
    scaleUi.resetScaleUi()

    expect(scale.distanceMmX.value).toBe(1234)
    expect(scale.distanceMmY.value).toBe(5678)
    expect(scale.confirmed.value).toBe(false)
  })

  it('resetWorkspace zet de B/W-tuning terug op fabriek, applyNewUnderlayReset niet', () => {
    const preprocess = ref(normalizeStoredPreprocess({ ...DEFAULT_PREPROCESS }))
    const threshold = () => preprocess.value.wallLayer?.threshold
    const factory = threshold()
    expect(factory).toBeTypeOf('number')

    const lifecycle = createLifecycle(preprocess)
    preprocess.value = normalizeStoredPreprocess({
      ...preprocess.value,
      wallLayer: { ...preprocess.value.wallLayer, threshold: 201 },
    })
    expect(threshold()).toBe(201)
    expect(factory).not.toBe(201)

    // Nieuwe onderlegger binnen hetzelfde project: tuning blijft, zoals nu.
    lifecycle.applyNewUnderlayReset()
    expect(threshold()).toBe(201)

    // Nieuw project: terug naar fabriek.
    lifecycle.resetWorkspace()
    expect(threshold()).toBe(factory)
  })
})

/**
 * Kale deps-bag; alleen de leden die `resetWorkspace` en `applyNewUnderlayReset`
 * raken doen iets. De composable registreert `onMounted`/`onUnmounted`, dus Vue
 * waarschuwt hier dat er geen component-instantie is — verwacht en zonder gevolg
 * voor de twee functies die deze spec aanroept.
 */
function createLifecycle(preprocess: Ref<PreprocessConfig>) {
  const noop = () => {}
  return useWorkspaceLifecycle({
    clearRects: noop,
    extractionLastOutput: ref<unknown>(null),
    localError: ref<string | null>('oude fout'),
    preprocess,
    preprocessPreview: { clearPreview: noop },
    preprocessVectorCache: { clear: noop },
    inputMask: { resetMaskState: noop, onMaskUndoKeydown: noop },
    inkEdit: { resetInkEdit: noop, onInkUndoKeydown: noop },
    scaleUi: { resetScaleFull: noop, resetScaleUi: noop },
    signature: { resetSignaturePreview: noop },
    tabOutputs: ref(emptyTabOutputs()),
    fml: { clearImportedFml: noop, resetPlanSessionDefaults: noop },
    profileConfirmed: ref(false),
    showOcrDetails: ref(true),
    roomFaces: { resetRoomState: noop },
    referenceWallThicknessPx: ref<number | null>(42),
    wallsDetectionComplete: ref(true),
    flowStep: ref<WorkspaceFlowStep>('result'),
    preprocessUi: { clearLivePreviewTimer: noop },
    image: { resetImageSource: noop },
    imageSrc: ref(''),
  })
}
