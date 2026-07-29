import type { Ref } from 'vue'
import type { PreprocessConfig } from '@/platform/image'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { SelectionRect } from '@/platform/selection'
import type { ExampleSample } from '@/core/extraction'
import type { usePreprocessPreview } from '../usePreprocessPreview'
import type { useOpenCvLoader } from '../useOpenCvLoader'
import { useWorkspaceInputMask } from '../useWorkspaceInputMask'
import { useWorkspaceInkEdit } from '../useWorkspaceInkEdit'
import { useWorkspaceImage } from './useWorkspaceImage'
import { imageDimensions } from './imageUtils'
import { useWorkspacePreprocess } from './useWorkspacePreprocess'
import { usePreprocessVectorCache } from './usePreprocessVectorCache'
import { useWorkspaceWallBwCompose } from './useWorkspaceWallBwCompose'
import { type PreprocessPanelLayer, type TemplateTab } from '@/cv/preprocess/layer-preprocess'
import type { GapsInkMode } from '@/cv/gaps'
import type { WorkspaceFlowStep } from './constants'
import type { ResultViewTab } from '@/cv/pipeline/merge-tab-outputs'

export type WorkspacePreprocessWiring = ReturnType<typeof useWorkspacePreprocessWiring>

export function useWorkspacePreprocessWiring(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  inputTab: Ref<'origineel'>
  preprocessTab: Ref<PreprocessPanelLayer>
  templateTab: Ref<TemplateTab>
  resultTab: Ref<ResultViewTab>
  originalImageEl: Ref<HTMLImageElement | null>
  preprocessPreview: ReturnType<typeof usePreprocessPreview>
  preprocess: Ref<PreprocessConfig>
  imageSrc: Ref<string | null>
  imageName: Ref<string | null>
  cvLoader: ReturnType<typeof useOpenCvLoader>
  scale: ReturnType<typeof useHScaleCalibration>
  setImageSource: (src: string, name: string) => void
  rects: Ref<SelectionRect[]>
  setLocalError: (message: string | null) => void
  referenceWallThicknessPx: Ref<number | null>
  gapsInkMode: Ref<GapsInkMode>
}) {
  let scheduleLivePreprocessPreview: () => void = () => {}
  let refreshOcrUnderlayPreview: () => Promise<void> = async () => {}
  let refreshLayerUnderlayPreview: (layer?: PreprocessPanelLayer) => Promise<void> = async () => {}
  /** Late-bound naar canonieke `preprocessUi.publishWallBwUnderlay` (na init). */
  let publishWallBwUnderlay: () => Promise<void> = async () => {}

  function activeUnderlayLayer(): PreprocessPanelLayer {
    if (deps.flowStep.value === 'templates') {
      if (deps.templateTab.value === 'ocr') return 'ocr'
      return 'walls'
    }
    return deps.preprocessTab.value
  }

  const inputMask = useWorkspaceInputMask({
    flowStep: deps.flowStep,
    inputTab: deps.inputTab,
    originalImageEl: deps.originalImageEl,
    preprocessPreview: {
      clearPreview: () => deps.preprocessPreview.clearPreview(),
      clearOcrPreview: () => deps.preprocessPreview.clearOcrPreview(),
    },
    imageDimensions,
    onMaskChanged: () => {
      if (deps.flowStep.value === 'preprocess') {
        scheduleLivePreprocessPreview()
      }
      if (deps.flowStep.value === 'templates' || deps.flowStep.value === 'result') {
        void refreshLayerUnderlayPreview('walls')
      }
    },
    onOcrMaskChanged: () => {
      void publishWallBwUnderlay()
      void refreshOcrUnderlayPreview()
    },
  })

  const wallBw = useWorkspaceWallBwCompose({
    originalImageEl: deps.originalImageEl,
    preprocess: deps.preprocess,
    cvLoader: deps.cvLoader,
    step1EraserMask: () => {
      if (deps.flowStep.value === 'input') return undefined
      return inputMask.preprocessMaskArgs().eraserMask ?? undefined
    },
    ocrMask: inputMask.ocrMask,
  })

  let preprocessVectorCacheClear: () => void = () => {}
  const ensureWallBwReady = () => wallBw.rebuildBaseWallBw()

  const inkEdit = useWorkspaceInkEdit({
    flowStep: deps.flowStep,
    wallBw,
    ensureWallBwReady,
    onInkChanged: () => {
      void publishWallBwUnderlay()
      preprocessVectorCacheClear()
    },
  })

  function resetBakedRotation(): void {
    deps.preprocess.value.rotate180 = false
    deps.preprocess.value.rotationDeg = 0
    deps.preprocess.value.autoRotationDeg = 0
  }

  let remasureWallAfterInputCommit: () => Promise<void> = async () => {}

  const image = useWorkspaceImage({
    imageSrc: deps.imageSrc,
    imageName: deps.imageName,
    flowStep: deps.flowStep,
    preprocessTab: deps.preprocessTab,
    templateTab: deps.templateTab,
    resultTab: deps.resultTab,
    cvLoader: deps.cvLoader,
    scale: deps.scale,
    preprocessPreview: deps.preprocessPreview,
    eraserTouched: inputMask.eraserTouched,
    maskedWorkingSrc: inputMask.maskedWorkingSrc,
    maskedWorkingCanvas: inputMask.maskedWorkingCanvas,
    effectiveBwUrl: wallBw.effectiveBwUrl,
    refreshMaskedWorkingImage: inputMask.refreshMaskedWorkingImage,
    clearMaskAfterCommit: inputMask.clearMaskAfterCommit,
    ensureEraserMask: inputMask.ensureEraserMask,
    setImageSource: deps.setImageSource,
    preprocess: deps.preprocess,
    resetBakedRotation,
    originalImageEl: deps.originalImageEl,
    rects: deps.rects,
    onAfterCommit: async () => {
      wallBw.resetWallBwCompose()
      await remasureWallAfterInputCommit()
    },
  })

  const getImageEl = () => image.getImageEl(inputMask.maskedWorkingCanvas)

  let examplesWithSignatures: () => ExampleSample[] = () => []
  let refreshSignaturePreview: () => Promise<void> = async () => {}

  const preprocessVectorCache = usePreprocessVectorCache({
    preprocess: deps.preprocess,
    getImageEl,
    ensureScaleInitialized: image.ensureScaleInitialized,
    preprocessMaskArgs: inputMask.preprocessMaskArgs,
    examplesWithSignatures: () => examplesWithSignatures(),
    setLocalError: deps.setLocalError,
  })

  const preprocessUi = useWorkspacePreprocess({
    flowStep: deps.flowStep,
    preprocessTab: deps.preprocessTab,
    templateTab: deps.templateTab,
    preprocess: deps.preprocess,
    preprocessPreview: deps.preprocessPreview,
    preprocessVectorCache,
    originalImageEl: deps.originalImageEl,
    getImageEl,
    ensureScaleInitialized: image.ensureScaleInitialized,
    preprocessMaskArgs: inputMask.preprocessMaskArgs,
    examplesWithSignatures: () => examplesWithSignatures(),
    activeUnderlayLayer,
    refreshSignaturePreview: () => refreshSignaturePreview(),
    setLocalError: deps.setLocalError,
    referenceWallThicknessPx: deps.referenceWallThicknessPx,
    gapsInkMode: deps.gapsInkMode,
    wallBw,
  })

  scheduleLivePreprocessPreview = preprocessUi.scheduleLivePreprocessPreview
  refreshOcrUnderlayPreview = preprocessUi.refreshOcrUnderlayPreview
  refreshLayerUnderlayPreview = preprocessUi.refreshLayerUnderlayPreview
  publishWallBwUnderlay = preprocessUi.publishWallBwUnderlay
  preprocessVectorCacheClear = () => preprocessVectorCache.clear()

  function bindSignaturePreview(signature: {
    examplesWithSignatures: () => ExampleSample[]
    refreshSignaturePreview: () => Promise<void>
  }): void {
    examplesWithSignatures = signature.examplesWithSignatures
    refreshSignaturePreview = signature.refreshSignaturePreview
  }

  function setRemasureWallAfterInputCommit(fn: () => Promise<void>): void {
    remasureWallAfterInputCommit = fn
  }

  return {
    inputMask,
    inkEdit,
    wallBw,
    image,
    preprocessVectorCache,
    preprocessUi,
    getImageEl,
    getEffectiveWallBwCanvas: () => wallBw.getEffectiveWallBwCanvas(),
    getEffectiveWallBwBytes: () => wallBw.getEffectiveWallBwBytes(),
    getBaseWallBw: () => wallBw.getBaseWallBw(),
    ensureWallBwReady,
    activeUnderlayLayer,
    scheduleLivePreprocessPreview: () => scheduleLivePreprocessPreview(),
    refreshOcrUnderlayPreview: () => refreshOcrUnderlayPreview(),
    refreshLayerUnderlayPreview: (layer?: PreprocessPanelLayer) =>
      refreshLayerUnderlayPreview(layer),
    preprocessVectorCacheClear: () => preprocessVectorCacheClear(),
    resetBakedRotation,
    bindSignaturePreview,
    setRemasureWallAfterInputCommit,
  }
}
