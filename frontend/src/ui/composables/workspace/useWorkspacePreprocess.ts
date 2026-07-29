import { watch, type Ref } from 'vue'
import type { ExampleSample } from '@/core/extraction'
import type { PreprocessConfig } from '@/platform/image'
import {
  isPreprocessLayerId,
  layerTuneFingerprintParts,
  resolveLayerPreprocess,
  underlayPreviewFingerprint,
  type PreprocessPanelLayer,
  type TemplateTab,
} from '@/cv/preprocess/layer-preprocess'
import type { GapsInkMode } from '@/cv/gaps'
import type { PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import type { usePreprocessPreview } from '../usePreprocessPreview'
import type { usePreprocessVectorCache } from './usePreprocessVectorCache'
import { formatCvError } from '@/cv/formatCvError'
import { PREPROCESS_PREVIEW_DEBOUNCE_MS, type WorkspaceFlowStep } from './constants'
import type { WorkspaceWallBwCompose } from './useWorkspaceWallBwCompose'

export function useWorkspacePreprocess(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  preprocessTab: Ref<PreprocessPanelLayer>
  templateTab: Ref<TemplateTab>
  preprocess: Ref<PreprocessConfig>
  preprocessPreview: ReturnType<typeof usePreprocessPreview>
  preprocessVectorCache: ReturnType<typeof usePreprocessVectorCache>
  originalImageEl: Ref<HTMLImageElement | null>
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  ensureScaleInitialized: (img: HTMLImageElement | HTMLCanvasElement) => void
  preprocessMaskArgs: () => PreprocessMaskInput
  examplesWithSignatures: () => ExampleSample[]
  activeUnderlayLayer: () => PreprocessPanelLayer
  refreshSignaturePreview: () => Promise<void>
  setLocalError: (message: string | null) => void
  referenceWallThicknessPx: Ref<number | null>
  gapsInkMode: Ref<GapsInkMode>
  wallBw?: WorkspaceWallBwCompose
}) {
  let livePreviewTimer: ReturnType<typeof setTimeout> | null = null
  let lastUnderlayFingerprint = underlayPreviewFingerprint(deps.preprocess.value)
  let lastFingerprintLayers = layerTuneFingerprintParts(lastUnderlayFingerprint)

  function underlayPreviewInputsChanged(): { wall: boolean; ocr: boolean; gaps: boolean } {
    const next = underlayPreviewFingerprint(deps.preprocess.value)
    const nextLayers = layerTuneFingerprintParts(next)
    const storageChanged = {
      wall: nextLayers.wall !== lastFingerprintLayers.wall,
      ocr: nextLayers.ocr !== lastFingerprintLayers.ocr,
      gaps: nextLayers.gaps !== lastFingerprintLayers.gaps,
    }
    if (!storageChanged.wall && !storageChanged.ocr && !storageChanged.gaps) {
      return { wall: false, ocr: false, gaps: false }
    }
    lastUnderlayFingerprint = next
    lastFingerprintLayers = nextLayers
    // OCR runtime deelt wallLayer — preview-invalidatie volgt wall, niet legacy ocrLayer.
    return {
      wall: storageChanged.wall,
      ocr: storageChanged.wall,
      gaps: storageChanged.gaps,
    }
  }

  function detectionUnderlayIncludesOcrMask(): boolean {
    return deps.flowStep.value === 'templates' || deps.flowStep.value === 'result'
  }

  async function refreshWallVectorCache(includeOcrMask = detectionUnderlayIncludesOcrMask()) {
    await deps.preprocessVectorCache.refresh({ includeOcrMask })
  }

  async function publishWallBwUnderlay(): Promise<void> {
    if (!deps.wallBw) return
    const url = await deps.wallBw.composeAndPublish({
      includeOcr: detectionUnderlayIncludesOcrMask(),
    })
    if (url) deps.preprocessPreview.previewUrl.value = url
  }

  async function refreshLayerUnderlayPreview(
    layer: PreprocessPanelLayer = deps.activeUnderlayLayer(),
  ) {
    if (
      deps.flowStep.value !== 'preprocess' &&
      deps.flowStep.value !== 'templates' &&
      deps.flowStep.value !== 'result'
    ) {
      return
    }
    deps.setLocalError(null)
    try {
      // Muren: composed B/W (base ⊕ OCR ⊕ ink) — geen kleur-rethreshold voor display.
      if (layer === 'walls' && deps.wallBw) {
        const img = deps.originalImageEl.value
        if (img) deps.ensureScaleInitialized(img)
        await deps.wallBw.rebuildBaseWallBw()
        await publishWallBwUnderlay()
        return
      }
      const img = await deps.getImageEl()
      deps.ensureScaleInitialized(img)
      const maskArgs = deps.preprocessMaskArgs()
      if (layer === 'ocr') {
        await deps.preprocessPreview.buildOcrPreview(
          img,
          deps.preprocess.value,
          deps.examplesWithSignatures(),
          maskArgs,
        )
        return
      }
      if (layer === 'inkWall') {
        await deps.preprocessPreview.buildInkWallPreview(img, deps.preprocess.value, maskArgs, {
          includeOcrMask: detectionUnderlayIncludesOcrMask(),
          referenceWallThicknessPx: deps.referenceWallThicknessPx.value,
        })
        return
      }
      if (layer === 'gaps') {
        await deps.preprocessPreview.buildGapsPreview(
          img,
          deps.preprocess.value,
          deps.examplesWithSignatures(),
          maskArgs,
          {
            includeOcrMask: detectionUnderlayIncludesOcrMask(),
            gapsInkMode: deps.gapsInkMode.value,
            referenceWallThicknessPx: deps.referenceWallThicknessPx.value,
          },
        )
        return
      }
      if (!isPreprocessLayerId(layer)) return
      await deps.preprocessPreview.buildPreview(
        img,
        resolveLayerPreprocess(deps.preprocess.value, layer),
        deps.examplesWithSignatures(),
        maskArgs,
        { includeOcrMask: detectionUnderlayIncludesOcrMask() },
      )
    } catch (e) {
      deps.setLocalError(formatCvError(e))
    }
  }

  async function refreshAllDetectionUnderlays(): Promise<void> {
    await refreshOcrUnderlayPreview()
    await refreshLayerUnderlayPreview('walls')
  }

  async function onBuildVectorDebug() {
    deps.setLocalError(null)
    await refreshWallVectorCache(false)
  }

  /** Bij overgang naar detectie: alleen bouwen als stap 2 nog geen cache heeft. */
  async function ensureVectorCacheIfNeeded() {
    if (deps.preprocessVectorCache.cache.value) return
    await refreshWallVectorCache(false)
  }

  function invalidateVectorCache() {
    deps.preprocessVectorCache.clear()
  }

  async function onApplyPreprocessPreview() {
    await refreshLayerUnderlayPreview(deps.preprocessTab.value)
  }

  function scheduleLayerPreviewRefresh(changed: { wall: boolean; ocr: boolean; gaps: boolean }) {
    if (!deps.originalImageEl.value?.complete) return
    if (deps.flowStep.value !== 'preprocess') return
    if (!changed.wall && !changed.ocr && !changed.gaps) return
    if (livePreviewTimer) clearTimeout(livePreviewTimer)
    livePreviewTimer = setTimeout(() => {
      const tab = deps.preprocessTab.value
      if (tab === 'inkWall' && changed.wall) {
        void refreshLayerUnderlayPreview('inkWall')
        return
      }
      if (changed.wall && tab === 'walls') void refreshLayerUnderlayPreview('walls')
      if (changed.gaps && tab === 'gaps') void refreshLayerUnderlayPreview('gaps')
      // OCR deelt muur-tune — geen aparte preprocess-tab meer.
    }, PREPROCESS_PREVIEW_DEBOUNCE_MS)
  }

  function scheduleLivePreprocessPreview() {
    scheduleLayerPreviewRefresh({ wall: true, ocr: true, gaps: true })
  }

  async function onLayerTuneCopied(target: PreprocessPanelLayer) {
    if (target === 'walls') invalidateVectorCache()
    // Gedeelde previewUrl — ververs de actieve tab, niet de doellaag (anders overschrijft
    // kopiëren op Muren de canvas met Gaten-B/W terwijl je nog op Muren staat).
    await refreshLayerUnderlayPreview(deps.preprocessTab.value)
  }

  function onResetPreview() {
    deps.preprocessPreview.clearPreview()
    deps.preprocessVectorCache.clear()
  }

  function clearLivePreviewTimer() {
    if (livePreviewTimer) clearTimeout(livePreviewTimer)
  }

  async function refreshOcrUnderlayPreview() {
    deps.setLocalError(null)
    try {
      const img = await deps.getImageEl()
      deps.ensureScaleInitialized(img)
      await deps.preprocessPreview.buildOcrPreview(
        img,
        deps.preprocess.value,
        deps.examplesWithSignatures(),
        deps.preprocessMaskArgs(),
      )
    } catch (e) {
      deps.setLocalError(formatCvError(e))
    }
  }

  watch(deps.preprocessTab, () => {
    if (deps.flowStep.value !== 'preprocess') return
    void refreshLayerUnderlayPreview(deps.preprocessTab.value)
  })

  watch(
    deps.preprocess,
    () => {
      const changed = underlayPreviewInputsChanged()
      if (!changed.wall && !changed.ocr && !changed.gaps) return
      if (deps.flowStep.value === 'preprocess') {
        if (changed.wall) invalidateVectorCache()
        scheduleLayerPreviewRefresh(changed)
        return
      }
      if (deps.flowStep.value === 'templates' || deps.flowStep.value === 'result') {
        void refreshAllDetectionUnderlays()
        // Stap 3 Gaten: gapsLayer-wijziging → demote via useWorkspaceGapsFaces (niet gaps-B/W canvas).
        if (deps.flowStep.value !== 'templates' || deps.templateTab.value !== 'walls') {
          void deps.refreshSignaturePreview()
        }
      }
    },
    { deep: true },
  )

  watch(deps.flowStep, (step) => {
    if (step === 'preprocess') {
      void refreshLayerUnderlayPreview(deps.preprocessTab.value)
    }
  })

  watch(deps.originalImageEl, () => {
    if (deps.flowStep.value === 'preprocess') {
      void refreshLayerUnderlayPreview(deps.preprocessTab.value)
    }
  })

  watch(deps.referenceWallThicknessPx, () => {
    if (deps.flowStep.value === 'preprocess' && deps.preprocessTab.value === 'inkWall') {
      void refreshLayerUnderlayPreview('inkWall')
    }
    // Detail-carve op stap 2 Gaten-tab; stap 3 demote luistert zelf naar dikte.
    if (
      deps.gapsInkMode.value === 'detail' &&
      deps.flowStep.value === 'preprocess' &&
      deps.preprocessTab.value === 'gaps'
    ) {
      void refreshLayerUnderlayPreview('gaps')
    }
  })

  watch(deps.gapsInkMode, () => {
    // Alleen stap 2 Gaten-preview; stap 3 canvas blijft muur-B/W (demote in GapsFaces).
    if (deps.flowStep.value === 'preprocess' && deps.preprocessTab.value === 'gaps') {
      void refreshLayerUnderlayPreview('gaps')
    }
  })

  return {
    refreshLayerUnderlayPreview,
    refreshAllDetectionUnderlays,
    publishWallBwUnderlay,
    onApplyPreprocessPreview,
    onBuildVectorDebug,
    ensureVectorCacheIfNeeded,
    scheduleLivePreprocessPreview,
    onResetPreview,
    onLayerTuneCopied,
    clearLivePreviewTimer,
    refreshOcrUnderlayPreview,
  }
}
