import { ref, computed, watch, type Ref } from 'vue'
import type { useOpenCvLoader } from '../useOpenCvLoader'
import type { useHScaleCalibration } from '@/platform/calibration'
import type { usePreprocessPreview } from '../usePreprocessPreview'
import type { WorkspaceFlowStep } from './constants'
import { type PreprocessPanelLayer, type TemplateTab } from '@/cv/preprocess/layer-preprocess'
import type { ResultViewTab } from '@/cv/pipeline/merge-tab-outputs'
import type { PreprocessConfig } from '@/core/extraction/types'
import { bakeUnderlayCanvas } from '@/cv/tools/bakeUnderlayCanvas'
import { ROTATION_EPS_DEG } from '@/cv/tools/rotateMat'
import { hasPendingInputRotation } from '@/platform/canvas/rotationPreview'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { canvasToDataUrl } from '@/cv/tools/maskImage'
import type { PdfUnderlaySource } from '@/platform/upload'
import { tryBuildPdfRoiCanvas } from './commitPdfRoiUnderlay'
import {
  applyPixelScaleFactorToCalibration,
  buildOptimizationBase,
  canvasLikeToHtmlCanvas,
  findContentBounds,
  imageDimensions,
  imageSourceToCanvas,
  loadImage,
  normalizeWorkingCanvas,
  resolveScaleAfterInputBake,
  transformHScaleState,
  transformHScaleStateRotate180,
  transformHScaleStateRotation,
  transformSelectionRect,
} from './imageUtils'
import { resolveDisplayImageSrc } from './resolveDisplayImageSrc'
import type { SelectionRect } from '@/platform/selection'
import { tGlobal } from '@/ui/i18n'

export function useWorkspaceImage(deps: {
  imageSrc: Ref<string | null>
  imageName: Ref<string | null>
  flowStep: Ref<WorkspaceFlowStep>
  preprocessTab: Ref<PreprocessPanelLayer>
  templateTab: Ref<TemplateTab>
  resultTab: Ref<ResultViewTab>
  cvLoader: ReturnType<typeof useOpenCvLoader>
  scale: ReturnType<typeof useHScaleCalibration>
  preprocessPreview: ReturnType<typeof usePreprocessPreview>
  eraserTouched: Ref<boolean>
  eraserMask: Ref<Uint8Array | null>
  maskedWorkingSrc: Ref<string | null>
  maskedWorkingCanvas: Ref<HTMLCanvasElement | null>
  /** Composed wall B/W (base ⊕ OCR ⊕ ink) — preferred underlay on stap 2/3. */
  effectiveBwUrl?: Ref<string | null>
  refreshMaskedWorkingImage: () => void
  clearMaskAfterCommit: (width: number, height: number) => void
  ensureEraserMask: (width: number, height: number) => void
  setImageSource: (src: string, name: string) => void
  preprocess: Ref<PreprocessConfig>
  resetBakedRotation: () => void
  originalImageEl: Ref<HTMLImageElement | null>
  rects: Ref<SelectionRect[]>
  onAfterCommit?: () => Promise<void>
}) {
  const optimizationBaseSrc = ref<string | null>(null)
  const suppressNextSrcWatch = ref(false)
  /** PDF bytes for ROI re-render at input commit (memory-only). */
  const pdfUnderlaySource = ref<PdfUnderlaySource | null>(null)
  const inputCommitBusy = ref(false)
  /** Guards against stale async upscale completing after a newer upload. */
  let imageSrcLoadGeneration = 0
  let inputCommitInFlight: Promise<void> | null = null

  function setPdfUnderlaySource(source: PdfUnderlaySource | null): void {
    pdfUnderlaySource.value = source
  }

  function clearPdfUnderlaySource(): void {
    pdfUnderlaySource.value = null
  }

  function onImageLoaded(width: number, height: number): void {
    if (!deps.scale.state.value) {
      deps.scale.init(width, height)
    }
    deps.ensureEraserMask(width, height)
  }

  function ensureScaleInitialized(img: HTMLImageElement | HTMLCanvasElement): void {
    const { width, height } = imageDimensions(img)
    onImageLoaded(width, height)
  }

  async function getImageEl(
    maskedWorkingCanvas: Ref<HTMLCanvasElement | null>,
  ): Promise<HTMLImageElement | HTMLCanvasElement> {
    // Kleur-onderlegger (inkt zit in wallBw compose, niet meer in edit-canvas).
    if (deps.eraserTouched.value && maskedWorkingCanvas.value) {
      return maskedWorkingCanvas.value
    }
    const img = deps.originalImageEl.value
    if (img?.complete && img.naturalWidth > 0) return img
    throw new Error(tGlobal('input.errors.loadDrawingFirst'))
  }

  /** Werk-onderlegger na upload/commit (niet tab-afhankelijk) — gebruik voor FML/export. */
  const workingImageSrc = computed(
    () => optimizationBaseSrc.value ?? deps.imageSrc.value ?? undefined,
  )

  const displayImageSrc = computed(() =>
    resolveDisplayImageSrc({
      flowStep: deps.flowStep.value,
      preprocessTab: deps.preprocessTab.value,
      templateTab: deps.templateTab.value,
      resultTab: deps.resultTab.value,
      optimizationBaseSrc: optimizationBaseSrc.value,
      imageSrc: deps.imageSrc.value,
      ocrPreviewUrl: deps.preprocessPreview.ocrPreviewUrl.value,
      preprocessPreviewUrl: deps.preprocessPreview.previewUrl.value,
      effectiveBwUrl: deps.effectiveBwUrl?.value,
      eraserTouched: deps.eraserTouched.value,
      maskedWorkingSrc: deps.maskedWorkingSrc.value,
    }),
  )

  watch(
    deps.imageSrc,
    async (src) => {
      if (!src) return
      if (suppressNextSrcWatch.value) {
        suppressNextSrcWatch.value = false
        return
      }
      const generation = ++imageSrcLoadGeneration
      void deps.cvLoader.ensureOpenCv()
      try {
        const base = await buildOptimizationBase(src)
        if (generation !== imageSrcLoadGeneration) return
        optimizationBaseSrc.value = base.src
        deps.originalImageEl.value = base.image
        if (base.scale !== 1) {
          applyPixelScaleFactorToCalibration(
            deps.scale,
            base.scale,
            base.image.naturalWidth,
            base.image.naturalHeight,
          )
        }
        onImageLoaded(base.image.naturalWidth, base.image.naturalHeight)
      } catch {
        if (generation !== imageSrcLoadGeneration) return
        optimizationBaseSrc.value = src
        const fallback = await loadImage(src)
        if (generation !== imageSrcLoadGeneration) return
        deps.originalImageEl.value = fallback
        onImageLoaded(fallback.naturalWidth, fallback.naturalHeight)
      }
    },
    { immediate: true },
  )

  async function loadExactWorkingImage(dataUrl: string): Promise<HTMLImageElement> {
    void deps.cvLoader.ensureOpenCv()
    const img = await loadImage(dataUrl)
    optimizationBaseSrc.value = dataUrl
    deps.originalImageEl.value = img
    onImageLoaded(img.naturalWidth, img.naturalHeight)
    return img
  }

  function prepareExactImageSrcLoad(): void {
    suppressNextSrcWatch.value = true
  }

  const canBakeInputRotation = computed(
    () =>
      !inputCommitBusy.value &&
      !!(deps.originalImageEl.value || deps.imageSrc.value) &&
      hasPendingInputRotation(deps.preprocess.value),
  )

  /** Rotatie (uitgebreid canvas) → trim/upscale → masker/rotatie in beeld bakken. */
  async function commitInputStepImage(): Promise<void> {
    if (inputCommitInFlight) return inputCommitInFlight
    inputCommitInFlight = runInputStepCommit().finally(() => {
      inputCommitInFlight = null
    })
    return inputCommitInFlight
  }

  async function bakeInputRotation(): Promise<void> {
    if (!hasPendingInputRotation(deps.preprocess.value)) return
    await commitInputStepImage()
  }

  async function runInputStepCommit(): Promise<void> {
    const preprocess = deps.preprocess.value
    const totalRotation = (preprocess.autoRotationDeg ?? 0) + (preprocess.rotationDeg ?? 0)
    const hasRotation = preprocess.rotate180 || Math.abs(totalRotation) > ROTATION_EPS_DEG
    const needsCommit = deps.eraserTouched.value || hasRotation
    if (!needsCommit) return

    inputCommitBusy.value = true
    try {
      await runInputStepCommitBody(preprocess, totalRotation, hasRotation)
    } finally {
      inputCommitBusy.value = false
    }
  }

  async function runInputStepCommitBody(
    preprocess: PreprocessConfig,
    totalRotation: number,
    hasRotation: boolean,
  ): Promise<void> {
    const hadMask = deps.eraserTouched.value
    deps.refreshMaskedWorkingImage()

    let source: HTMLCanvasElement | null
    if (hadMask && deps.maskedWorkingCanvas.value) {
      source = deps.maskedWorkingCanvas.value
    } else {
      const img = deps.originalImageEl.value
      if (!img?.complete) return
      source = imageSourceToCanvas(img)
    }
    if (!source) return

    const sourceWidth = source.width
    const sourceHeight = source.height

    let bakeSource = source
    let densityFactor = 1
    let roiCropOffset = { x: 0, y: 0 }
    let usedPdfRoi = false

    const pdfSource = pdfUnderlaySource.value
    if (hadMask && pdfSource) {
      const bounds = findContentBounds(source)
      if (bounds) {
        try {
          const roi = await tryBuildPdfRoiCanvas({
            pdfSource,
            bounds,
            sourceWidth,
            sourceHeight,
            eraserMask: deps.eraserMask.value,
          })
          if (roi) {
            bakeSource = roi.canvas
            densityFactor = roi.densityFactor
            roiCropOffset = { x: bounds.left, y: bounds.top }
            usedPdfRoi = true
          }
        } catch {
          // Fallback: legacy bake + blur-upscale.
        }
      }
    }

    const cv = await waitForOpenCV()
    const baked = canvasLikeToHtmlCanvas(bakeUnderlayCanvas(cv, bakeSource, preprocess))
    const normalized = normalizeWorkingCanvas(baked)
    const totalScale = densityFactor * normalized.scale
    const dataUrl = canvasToDataUrl(normalized.canvas)
    const name = deps.imageName.value ?? 'onderlegger.png'

    prepareExactImageSrcLoad()
    deps.setImageSource(dataUrl, name)

    const img = await loadImage(dataUrl)
    optimizationBaseSrc.value = dataUrl
    deps.originalImageEl.value = img
    onImageLoaded(img.naturalWidth, img.naturalHeight)

    if (deps.scale.confirmed.value) {
      // Bevestigde px/mm = dichtheid in pre-bake ruimte. Rotatie wijzigt geen densiteit,
      // wel as-rollen bij 90°/270°; daarna commit-upscale / PDF-ROI densiteit meenemen.
      const bakedRotation = totalRotation + (preprocess.rotate180 ? 180 : 0)
      deps.scale.applyCardinalAxisSwapToConfirmedScale(bakedRotation)
      deps.scale.applyUpscaleToConfirmedScale(totalScale)
    }

    const scaleAfterBake = resolveScaleAfterInputBake({
      scaleConfirmed: deps.scale.confirmed.value,
      hasRotation,
      hasScaleState: !!deps.scale.state.value,
    })
    if (scaleAfterBake === 'reinit') {
      // Rotate-then-scale: verse H/V-linialen op rechtgetrokken beeld; mm blijft.
      deps.scale.init(img.naturalWidth, img.naturalHeight)
    } else if (scaleAfterBake === 'transform' && deps.scale.state.value) {
      let state = deps.scale.state.value
      if (usedPdfRoi) {
        state = transformHScaleState(
          state,
          {
            offsetX: roiCropOffset.x,
            offsetY: roiCropOffset.y,
            scale: densityFactor,
          },
          bakeSource.width,
          bakeSource.height,
        )
        if (preprocess.rotate180) {
          state = transformHScaleStateRotate180(state, bakeSource.width, bakeSource.height)
        }
        if (Math.abs(totalRotation) > ROTATION_EPS_DEG) {
          state = transformHScaleStateRotation(
            state,
            bakeSource.width,
            bakeSource.height,
            totalRotation,
            baked.width,
            baked.height,
          )
        }
        deps.scale.state.value = transformHScaleState(
          state,
          {
            offsetX: normalized.cropOffset.x,
            offsetY: normalized.cropOffset.y,
            scale: normalized.scale,
          },
          img.naturalWidth,
          img.naturalHeight,
        )
      } else {
        if (preprocess.rotate180) {
          state = transformHScaleStateRotate180(state, sourceWidth, sourceHeight)
        }
        if (Math.abs(totalRotation) > ROTATION_EPS_DEG) {
          state = transformHScaleStateRotation(
            state,
            sourceWidth,
            sourceHeight,
            totalRotation,
            baked.width,
            baked.height,
          )
        }
        deps.scale.state.value = transformHScaleState(
          state,
          {
            offsetX: normalized.cropOffset.x,
            offsetY: normalized.cropOffset.y,
            scale: normalized.scale,
          },
          img.naturalWidth,
          img.naturalHeight,
        )
      }
    }

    if (deps.rects.value.length > 0) {
      if (usedPdfRoi) {
        deps.rects.value = deps.rects.value.map((rect) => {
          const inRoi = transformSelectionRect(rect, {
            sourceWidth,
            sourceHeight,
            rotate180: false,
            uiRotationDeg: 0,
            bakedWidth: bakeSource.width,
            bakedHeight: bakeSource.height,
            cropOffset: roiCropOffset,
            scale: densityFactor,
            outWidth: bakeSource.width,
            outHeight: bakeSource.height,
          })
          const next = transformSelectionRect(inRoi, {
            sourceWidth: bakeSource.width,
            sourceHeight: bakeSource.height,
            rotate180: preprocess.rotate180,
            uiRotationDeg: totalRotation,
            bakedWidth: baked.width,
            bakedHeight: baked.height,
            cropOffset: normalized.cropOffset,
            scale: normalized.scale,
            outWidth: img.naturalWidth,
            outHeight: img.naturalHeight,
          })
          return { ...rect, ...next }
        })
      } else {
        deps.rects.value = deps.rects.value.map((rect) => {
          const next = transformSelectionRect(rect, {
            sourceWidth,
            sourceHeight,
            rotate180: preprocess.rotate180,
            uiRotationDeg: totalRotation,
            bakedWidth: baked.width,
            bakedHeight: baked.height,
            cropOffset: normalized.cropOffset,
            scale: normalized.scale,
            outWidth: img.naturalWidth,
            outHeight: img.naturalHeight,
          })
          return { ...rect, ...next }
        })
      }
    }

    if (hadMask) {
      deps.clearMaskAfterCommit(img.naturalWidth, img.naturalHeight)
    } else {
      deps.ensureEraserMask(img.naturalWidth, img.naturalHeight)
    }
    deps.resetBakedRotation()
    // After crop/gum the working image is no longer full-page raster space —
    // drop PDF source so a later erase cannot map ROI with stale coords.
    if (hadMask || usedPdfRoi) {
      clearPdfUnderlaySource()
    }
    await deps.onAfterCommit?.()
  }

  function resetImageSource() {
    optimizationBaseSrc.value = null
    suppressNextSrcWatch.value = false
    deps.originalImageEl.value = null
    clearPdfUnderlaySource()
  }

  return {
    optimizationBaseSrc,
    workingImageSrc,
    displayImageSrc,
    pdfUnderlaySource,
    setPdfUnderlaySource,
    clearPdfUnderlaySource,
    getImageEl,
    ensureScaleInitialized,
    onImageLoaded,
    resetImageSource,
    loadExactWorkingImage,
    prepareExactImageSrcLoad,
    commitInputStepImage,
    bakeInputRotation,
    canBakeInputRotation,
    inputCommitBusy,
    imageDimensions,
  }
}
