import { ref, type Ref } from 'vue'
import type { ExampleSample } from '@/core/extraction'
import type { PreprocessConfig } from '@/platform/image'
import { createWorkCanvas, scaleSegmentsToOriginal } from '@/platform/image'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { formatCvError } from '@/cv/formatCvError'
import { runPreprocessLayer } from '@/cv/layers/preprocess-layer'
import { preparePreprocessMasks, type PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import { resolveLayerPreprocess } from '@/cv/preprocess/layer-preprocess'
import {
  buildPreprocessVectorCache,
  type PreprocessVectorCache,
} from '@/cv/preprocess/preprocess-vector-cache'

export function usePreprocessVectorCache(deps: {
  preprocess: Ref<PreprocessConfig>
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  ensureScaleInitialized: (img: HTMLImageElement | HTMLCanvasElement) => void
  preprocessMaskArgs: () => PreprocessMaskInput
  examplesWithSignatures: () => ExampleSample[]
  setLocalError: (message: string | null) => void
}) {
  const cache = ref<PreprocessVectorCache | null>(null)
  const loading = ref(false)

  function resolvePreviewMasks(
    work: ReturnType<typeof createWorkCanvas>,
    masks?: PreprocessMaskInput,
    includeOcrMask = false,
  ) {
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

  async function refresh(options?: { includeOcrMask?: boolean }): Promise<void> {
    loading.value = true
    deps.setLocalError(null)
    try {
      const cv = await waitForOpenCV()
      const img = await deps.getImageEl()
      deps.ensureScaleInitialized(img)
      const work = createWorkCanvas(img)
      const prepared = resolvePreviewMasks(work, deps.preprocessMaskArgs(), options?.includeOcrMask ?? false)
      const wallPreprocess = resolveLayerPreprocess(deps.preprocess.value, 'walls')
      const out = runPreprocessLayer({
        cv,
        image: work.canvas,
        preprocess: wallPreprocess,
        examples: deps.examplesWithSignatures(),
        eraserMask: prepared.eraserMask,
      })
      const built = buildPreprocessVectorCache(cv, out.mat, {
        wallKernelOverridePx: deps.preprocess.value.wallKernelOverridePx,
      })
      out.mat.delete()

      const scale = work.scale
      cache.value = {
        workScale: scale,
        rawInk: scaleSegmentsToOriginal(built.rawInk, scale),
        simplifiedInk: scaleSegmentsToOriginal(built.simplifiedInk, scale),
        skeleton: scaleSegmentsToOriginal(built.skeleton, scale),
        meta: built.meta,
      }
    } catch (e) {
      deps.setLocalError(formatCvError(e))
      cache.value = null
    } finally {
      loading.value = false
    }
  }

  function clear(): void {
    cache.value = null
  }

  return {
    cache,
    loading,
    refresh,
    clear,
  }
}
