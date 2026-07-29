import { ref } from 'vue'
import type { ExampleSample, PreprocessConfig } from '@/core/extraction'
import { createWorkCanvas, type WorkCanvasSource } from '@/platform/image'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { formatCvError } from '@/cv/formatCvError'
import { runPreprocessLayer } from '@/cv/layers/preprocess-layer'
import { preparePreprocessMasks } from '@/cv/tools/preparePreprocessMasks'
import { matToCanvas } from '@/cv/port/preprocess'
import { resolveLayerPreprocess } from '@/cv/preprocess/layer-preprocess'
import { buildRoomReferenceMat } from '@/cv/walls/rooms/room-reference-preprocess'
import { carveOtsuWhiteIntoGapsMat, type GapsInkMode } from '@/cv/gaps'
import type { PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import type { CanvasLike } from '@/cv/port/canvasEnv'

function canvasAtOriginalSize(
  workCanvas: CanvasLike,
  originalWidth: number,
  originalHeight: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = originalWidth
  canvas.height = originalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(workCanvas as unknown as CanvasImageSource, 0, 0, originalWidth, originalHeight)
  return canvas
}

export function usePreprocessPreview() {
  const previewUrl = ref<string | null>(null)
  const ocrPreviewUrl = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  function resolvePreviewMasks(
    work: ReturnType<typeof createWorkCanvas>,
    masks?: PreprocessMaskInput,
    includeOcrMask = false,
  ): { eraserMask?: Uint8Array } {
    return preparePreprocessMasks({
      eraserMask: masks?.eraserMask,
      ocrMask: masks?.ocrMask,
      includeOcrMask,
      srcWidth: work.originalWidth,
      srcHeight: work.originalHeight,
      dstWidth: work.workWidth,
      dstHeight: work.workHeight,
    })
  }

  async function buildPreview(
    image: WorkCanvasSource,
    preprocess: PreprocessConfig,
    examples: ExampleSample[],
    masks?: PreprocessMaskInput,
    options?: { includeOcrMask?: boolean },
  ): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const cv = await waitForOpenCV()
      const work = createWorkCanvas(image)
      const prepared = resolvePreviewMasks(work, masks, options?.includeOcrMask ?? false)
      const out = runPreprocessLayer({
        cv,
        image: work.canvas,
        preprocess,
        examples,
        eraserMask: prepared.eraserMask,
      })
      const displayCanvas = canvasAtOriginalSize(
        out.previewCanvas,
        work.originalWidth,
        work.originalHeight,
      )
      previewUrl.value = displayCanvas.toDataURL('image/png')
      out.mat.delete()
    } catch (e) {
      error.value = formatCvError(e)
    } finally {
      loading.value = false
    }
  }

  async function buildInkWallPreview(
    image: WorkCanvasSource,
    preprocess: PreprocessConfig,
    masks?: PreprocessMaskInput,
    options?: {
      includeOcrMask?: boolean
      referenceWallThicknessPx?: number | null
    },
  ): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const cv = await waitForOpenCV()
      const work = createWorkCanvas(image)
      const prepared = resolvePreviewMasks(work, masks, options?.includeOcrMask ?? false)
      const out = buildRoomReferenceMat({
        cv,
        image: work.canvas,
        eraserMask: prepared.eraserMask,
        preprocess,
        referenceWallThicknessPx: options?.referenceWallThicknessPx ?? undefined,
        wallStyle: preprocess.wallStyle === 'solid' ? 'solid' : 'open',
      })
      const displayCanvas = canvasAtOriginalSize(
        out.previewCanvas,
        work.originalWidth,
        work.originalHeight,
      )
      previewUrl.value = displayCanvas.toDataURL('image/png')
      out.mat.delete()
    } catch (e) {
      error.value = formatCvError(e)
    } finally {
      loading.value = false
    }
  }

  /**
   * Gaten-preview. Detail: Otsu-wit alleen in gaten-zwart carveën
   * (wit op gaten blijft wit).
   */
  async function buildGapsPreview(
    image: WorkCanvasSource,
    preprocess: PreprocessConfig,
    examples: ExampleSample[],
    masks?: PreprocessMaskInput,
    options?: {
      includeOcrMask?: boolean
      gapsInkMode?: GapsInkMode
      referenceWallThicknessPx?: number | null
    },
  ): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const cv = await waitForOpenCV()
      const work = createWorkCanvas(image)
      const prepared = resolvePreviewMasks(work, masks, options?.includeOcrMask ?? false)
      const gapsOut = runPreprocessLayer({
        cv,
        image: work.canvas,
        preprocess: resolveLayerPreprocess(preprocess, 'gaps'),
        examples,
        eraserMask: prepared.eraserMask,
      })
      try {
        if (options?.gapsInkMode === 'detail') {
          const otsuOut = buildRoomReferenceMat({
            cv,
            image: work.canvas,
            eraserMask: prepared.eraserMask,
            preprocess,
            referenceWallThicknessPx: options.referenceWallThicknessPx ?? undefined,
            wallStyle: preprocess.wallStyle === 'solid' ? 'solid' : 'open',
          })
          try {
            carveOtsuWhiteIntoGapsMat(gapsOut.mat, otsuOut.mat)
          } finally {
            otsuOut.mat.delete()
          }
        }
        const previewCanvas = matToCanvas(cv, gapsOut.mat)
        const displayCanvas = canvasAtOriginalSize(
          previewCanvas,
          work.originalWidth,
          work.originalHeight,
        )
        previewUrl.value = displayCanvas.toDataURL('image/png')
      } finally {
        gapsOut.mat.delete()
      }
    } catch (e) {
      error.value = formatCvError(e)
    } finally {
      loading.value = false
    }
  }

  async function buildOcrPreview(
    image: WorkCanvasSource,
    baseConfig: PreprocessConfig,
    examples: ExampleSample[],
    masks?: PreprocessMaskInput,
  ): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const cv = await waitForOpenCV()
      const work = createWorkCanvas(image)
      const prepared = resolvePreviewMasks(work, masks, true)
      const out = runPreprocessLayer({
        cv,
        image: work.canvas,
        preprocess: resolveLayerPreprocess(baseConfig, 'walls'),
        examples,
        eraserMask: prepared.eraserMask,
      })
      const displayCanvas = canvasAtOriginalSize(
        out.previewCanvas,
        work.originalWidth,
        work.originalHeight,
      )
      ocrPreviewUrl.value = displayCanvas.toDataURL('image/png')
      out.mat.delete()
    } catch (e) {
      error.value = formatCvError(e)
    } finally {
      loading.value = false
    }
  }

  function clearPreview(): void {
    previewUrl.value = null
  }

  function clearOcrPreview(): void {
    ocrPreviewUrl.value = null
  }

  return {
    previewUrl,
    ocrPreviewUrl,
    loading,
    error,
    buildPreview,
    buildInkWallPreview,
    buildGapsPreview,
    buildOcrPreview,
    clearPreview,
    clearOcrPreview,
  }
}
