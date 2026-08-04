import { computed, ref, watch, type Ref } from 'vue'
import type { OcrTextCandidate } from '@/core/extraction'
import type { PreprocessConfig } from '@/platform/image'
import { createWorkCanvas } from '@/platform/image'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { matToCanvas } from '@/cv/port/preprocess'
import { resolveLayerPreprocess } from '@/cv/preprocess/layer-preprocess'
import { runOcrScanLayers } from '@/cv/layers/preprocess-layer'
import { resolveOcrLanguage, warmUpOcrWorker } from '@/cv/port/ocrWorker'
import { collectOcrRawHits, filterOcrTextCandidates } from '@/cv/port/ocrText'
import { ocrHitKey } from '@/cv/port/ocrHitKey'
import type { OcrWordHit } from '@/cv/port/ocrTextFilters'
import { formatCvError } from '@/cv/formatCvError'
import { preparePreprocessMasks, type PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import { tGlobal } from '@/ui/i18n'
import type { useOpenCvLoader } from '../useOpenCvLoader'

function scaleOcrHits<T extends OcrTextCandidate>(words: T[], inv: number): T[] {
  return words.map((word) => ({
    ...word,
    x: word.x * inv,
    y: word.y * inv,
    width: word.width * inv,
    height: word.height * inv,
  }))
}

export function useWorkspaceOcr(deps: {
  preprocess: Ref<PreprocessConfig>
  cvLoader: ReturnType<typeof useOpenCvLoader>
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  ensureScaleInitialized: (img: HTMLImageElement | HTMLCanvasElement) => void
  preprocessMaskArgs: () => PreprocessMaskInput
  applyOcrTextMask: (regions: OcrTextCandidate[]) => Promise<void>
  clearOcrTextMask: () => void
  refreshOcrPreview: () => Promise<void>
  setLocalError: (message: string | null) => void
}) {
  const ocrRawHits = ref<OcrWordHit[]>([])
  const ocrCandidates = ref<OcrTextCandidate[]>([])
  const ocrExcludedKeys = ref<Set<string>>(new Set())
  const ocrScanning = ref(false)
  const ocrUnderlayMaxEdgePx = ref(2000)

  const ocrHitList = computed(() =>
    [...ocrCandidates.value].sort(
      (a, b) => b.confidence - a.confidence || a.text.localeCompare(b.text),
    ),
  )

  function ocrFilterParams() {
    return {
      minConfidence: Math.max(0, Math.min(100, deps.preprocess.value.ocrMinConfidence ?? 85)),
      mode: deps.preprocess.value.ocrMode ?? 'general',
      underlayMaxEdgePx: ocrUnderlayMaxEdgePx.value,
    } as const
  }

  async function applyOcrFilter(options?: { reportEmpty?: boolean }): Promise<void> {
    if (ocrRawHits.value.length === 0) return

    deps.setLocalError(null)
    let filtered = filterOcrTextCandidates(ocrRawHits.value, ocrFilterParams())
    if (ocrExcludedKeys.value.size > 0) {
      filtered = filtered.filter((hit) => !ocrExcludedKeys.value.has(ocrHitKey(hit)))
    }
    ocrCandidates.value = filtered

    if (filtered.length === 0) {
      deps.clearOcrTextMask()
      if (options?.reportEmpty) {
        deps.setLocalError(tGlobal('templates.errors.noTextFound'))
      }
      return
    }

    await deps.applyOcrTextMask(filtered)
  }

  function removeOcrHit(key: string) {
    if (!key || ocrExcludedKeys.value.has(key)) return
    ocrExcludedKeys.value = new Set([...ocrExcludedKeys.value, key])
    void applyOcrFilter()
  }

  function clearOcrScan() {
    ocrRawHits.value = []
    ocrCandidates.value = []
    ocrExcludedKeys.value = new Set()
    deps.clearOcrTextMask()
  }

  /** Herstel kandidatenlijst + shift-verwijderen na dev-snapshot (zonder opnieuw scannen). */
  function restoreOcrFromRegions(regions: OcrTextCandidate[]): void {
    if (regions.length === 0) {
      ocrRawHits.value = []
      ocrCandidates.value = []
      ocrExcludedKeys.value = new Set()
      return
    }
    const hits: OcrWordHit[] = regions.map((region) => ({
      ...region,
      pass: 'horizontal',
    }))
    ocrRawHits.value = hits
    ocrCandidates.value = regions.map((region) => ({ ...region }))
    ocrExcludedKeys.value = new Set()
  }

  async function runOcrScan(): Promise<void> {
    deps.setLocalError(null)
    if (!deps.preprocess.value.ocrEnabled) {
      deps.setLocalError(tGlobal('templates.errors.enableOcr'))
      return
    }
    ocrScanning.value = true
    try {
      if (!deps.cvLoader.ready.value) {
        await deps.cvLoader.ensureOpenCv()
      }
      const cv = await waitForOpenCV()
      const img = await deps.getImageEl()
      deps.ensureScaleInitialized(img)
      const work = createWorkCanvas(img)
      const ocrPreprocess = resolveLayerPreprocess(deps.preprocess.value, 'walls')
      const prepared = preparePreprocessMasks({
        ...deps.preprocessMaskArgs(),
        includeOcrMask: false,
        srcWidth: work.originalWidth,
        srcHeight: work.originalHeight,
        dstWidth: work.workWidth,
        dstHeight: work.workHeight,
      })
      const layerCtx = {
        cv,
        image: work.canvas,
        preprocess: ocrPreprocess,
        examples: [],
        eraserMask: prepared.eraserMask,
      }
      const language = resolveOcrLanguage(deps.preprocess.value.ocrLanguages)
      const workerReady = warmUpOcrWorker(language)

      const { bw, grayscale } = runOcrScanLayers(layerCtx)
      const scanCanvas = matToCanvas(cv, bw.mat) as unknown as HTMLCanvasElement
      const grayscaleCanvas = matToCanvas(cv, grayscale.mat) as unknown as HTMLCanvasElement
      bw.mat.delete()
      grayscale.mat.delete()

      await workerReady

      const rawHits = await collectOcrRawHits({
        image: scanCanvas,
        grayscaleImage: grayscaleCanvas,
        language,
        mode: deps.preprocess.value.ocrMode ?? 'general',
        detectVertical: deps.preprocess.value.ocrDetectVertical ?? false,
      })
      const inv = work.scale >= 1 ? 1 : 1 / work.scale
      ocrUnderlayMaxEdgePx.value = Math.max(work.originalWidth, work.originalHeight)
      ocrRawHits.value = scaleOcrHits(rawHits, inv)
      ocrExcludedKeys.value = new Set()
      await applyOcrFilter({ reportEmpty: true })
    } catch (e) {
      deps.setLocalError(formatCvError(e))
    } finally {
      ocrScanning.value = false
    }
  }

  watch(
    () => [deps.preprocess.value.ocrMinConfidence, deps.preprocess.value.ocrMode] as const,
    () => {
      if (ocrRawHits.value.length === 0) return
      void applyOcrFilter()
    },
  )

  return {
    ocrCandidates,
    ocrHitList,
    ocrRawHitCount: () => ocrRawHits.value.length,
    ocrScanning,
    runOcrScan,
    clearOcrScan,
    removeOcrHit,
    restoreOcrFromRegions,
  }
}
