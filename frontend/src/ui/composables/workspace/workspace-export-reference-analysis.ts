import type { Ref } from 'vue'
import type { PreprocessConfig } from '@/platform/image'
import type { PreprocessMaskInput } from '@/cv/tools/preparePreprocessMasks'
import type { SelectionRect } from '@/platform/selection'
import { downloadText } from '@/core/fml/downloadFml'
import { formatCvError } from '@/cv/formatCvError'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { buildReferenceAnalysisHtml } from '@/platform/export/reference-analysis-report'
import { analyzeAllReferenceRects } from '@/cv/refs/analyze-all-refs'
import type { GapsInkMode } from '@/cv/gaps'
import { exportBasename } from './workspace-export-shared'

export type WorkspaceExportReferenceAnalysisDeps = {
  imageName: Ref<string | null>
  preprocess: Ref<PreprocessConfig>
  rects: Ref<SelectionRect[]>
  getImageEl: () => Promise<HTMLImageElement | HTMLCanvasElement>
  preprocessMaskArgs: () => PreprocessMaskInput
  setLocalError: (message: string | null) => void
  applyAutoGapsInkMode?: (mode: GapsInkMode) => void
  getBaseWallBw?: () => { data: Uint8Array; width: number; height: number } | null
}

export function createWorkspaceExportReferenceAnalysis(deps: WorkspaceExportReferenceAnalysisDeps) {
  async function exportReferenceAnalysis() {
    deps.setLocalError(null)
    try {
      const refRects = deps.rects.value.filter(
        (r) => r.type === 'wall' || r.type === 'door' || r.type === 'window',
      )
      if (refRects.length === 0) {
        throw new Error('Geen referentievakken — teken eerst muur en/of deur/raam in stap 2.')
      }
      const img = await deps.getImageEl()
      const cv = await waitForOpenCV()
      const report = await analyzeAllReferenceRects({
        cv,
        image: img,
        drawing: deps.imageName.value,
        preprocess: deps.preprocess.value,
        eraserMask: deps.preprocessMaskArgs().eraserMask ?? undefined,
        baseBw: deps.getBaseWallBw?.() ?? undefined,
        rects: refRects.map((r) => ({
          id: r.id,
          type: r.type as 'wall' | 'door' | 'window',
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        })),
      })
      if (report.wall) {
        deps.applyAutoGapsInkMode?.(report.wall.renderStyle === 'details' ? 'detail' : 'solid')
      }
      const safe = exportBasename(deps.imageName.value, 'referenties')
      downloadText(
        buildReferenceAnalysisHtml(report),
        `${safe}-referentie-analyse.html`,
        'text/html',
      )
    } catch (e) {
      console.error('[exportReferenceAnalysis]', e)
      deps.setLocalError(formatCvError(e))
    }
  }

  return { exportReferenceAnalysis }
}
