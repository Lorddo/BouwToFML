import type { Ref } from 'vue'
import type { PreprocessConfig } from '@/platform/image'
import type { PreprocessPanelLayer } from '@/cv/preprocess/layer-preprocess'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { usePreprocessPreview } from '../usePreprocessPreview'
import { downloadCanvasPng } from '@/core/fml/downloadFml'
import { renderBinaryMaskRleCanvas } from '@/cv/util/binary-mask-rle'
import { formatCvError } from '@/cv/formatCvError'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { bakeUnderlayCanvas } from '@/cv/tools/bakeUnderlayCanvas'
import { canvasLikeToHtmlCanvas, imageSourceToCanvas } from './imageUtils'
import { downloadDataUrl, underlayDownloadFilename } from './workspace-export-shared'

export type WorkspaceExportUnderlayDeps = {
  imageName: Ref<string | null>
  preprocess: Ref<PreprocessConfig>
  preprocessTab: Ref<PreprocessPanelLayer>
  preprocessPreview: ReturnType<typeof usePreprocessPreview>
  /** Composed wall B/W URL (base ⊕ OCR ⊕ ink). */
  effectiveBwUrl?: Ref<string | null>
  tabOutputs: Ref<TabDetectionOutputs>
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  refreshLayerUnderlayPreview: (layer?: PreprocessPanelLayer) => Promise<void>
  setLocalError: (message: string | null) => void
}

export function createWorkspaceExportUnderlay(deps: WorkspaceExportUnderlayDeps) {
  async function downloadUnderlay() {
    deps.setLocalError(null)
    try {
      const img = await deps.getImageEl()
      const base = imageSourceToCanvas(img)
      const cv = await waitForOpenCV()
      const baked = bakeUnderlayCanvas(cv, base, deps.preprocess.value)
      downloadCanvasPng(
        canvasLikeToHtmlCanvas(baked),
        underlayDownloadFilename(deps.imageName.value),
      )
    } catch (e) {
      deps.setLocalError(formatCvError(e))
    }
  }

  async function downloadPreprocessedUnderlay() {
    deps.setLocalError(null)
    try {
      const layer = deps.preprocessTab.value
      if (layer === 'ocr') {
        await deps.refreshLayerUnderlayPreview(layer)
        const dataUrl = deps.preprocessPreview.ocrPreviewUrl.value
        if (!dataUrl) throw new Error('Geen bewerkte onderlegger beschikbaar.')
        downloadDataUrl(
          dataUrl,
          underlayDownloadFilename(deps.imageName.value, `onderlegger-bewerkt-${layer}`),
        )
        return
      }
      // Muren / stap 2–3: composed effective B/W (base ⊕ OCR ⊕ ink).
      await deps.refreshLayerUnderlayPreview('walls')
      const dataUrl = deps.effectiveBwUrl?.value ?? deps.preprocessPreview.previewUrl.value
      if (!dataUrl) {
        throw new Error('Geen bewerkte onderlegger beschikbaar.')
      }
      downloadDataUrl(
        dataUrl,
        underlayDownloadFilename(deps.imageName.value, 'onderlegger-bewerkt-walls'),
      )
    } catch (e) {
      deps.setLocalError(formatCvError(e))
    }
  }

  function downloadUsedWallMask() {
    deps.setLocalError(null)
    try {
      const maskRle = deps.tabOutputs.value.walls?.roomWallMaskRle
      if (!maskRle) {
        throw new Error('Geen muurmasker — rond eerst muur-detectie af (finalize).')
      }
      const canvas = renderBinaryMaskRleCanvas(maskRle)
      downloadCanvasPng(canvas, underlayDownloadFilename(deps.imageName.value, 'muurmask-gebruikt'))
    } catch (e) {
      deps.setLocalError(formatCvError(e))
    }
  }

  return {
    downloadUnderlay,
    downloadPreprocessedUnderlay,
    downloadUsedWallMask,
  }
}
