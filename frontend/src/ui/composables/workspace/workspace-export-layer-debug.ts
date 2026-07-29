import type { Ref } from 'vue'
import type { ExtractionOutput } from '@/core/extraction'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import { downloadText } from '@/core/fml/downloadFml'
import { formatCvError } from '@/cv/formatCvError'
import {
  buildLayerDebugReport,
  formatLayerDebugMarkdown,
} from '@/platform/export/layer-debug-report'
import type { BoundDoor, OrientedDoor, ResolvedDoorCandidate } from '@/cv/doors'
import type { BoundWindow, WindowBindRejection } from '@/cv/windows'
import { exportBasename } from './workspace-export-shared'

export type WorkspaceExportLayerDebugDeps = {
  imageName: Ref<string | null>
  tabOutputs: Ref<TabDetectionOutputs>
  combinedOutput: Ref<ExtractionOutput | null>
  setLocalError: (message: string | null) => void
  boundDoors?: Ref<BoundDoor[]>
  resolvedDoors?: Ref<ResolvedDoorCandidate[]>
  orientedDoors?: Ref<OrientedDoor[]>
  boundWindows?: Ref<BoundWindow[]>
  windowBindRejections?: Ref<WindowBindRejection[]>
}

/** Public key remains `exportExamplesReport` (layer-debug-report; not legacy examples-report). */
export function createWorkspaceExportLayerDebug(deps: WorkspaceExportLayerDebugDeps) {
  function exportExamplesReport() {
    void (async () => {
      try {
        const safe = exportBasename(deps.imageName.value, 'layer-debug')
        const exportOutput = deps.tabOutputs.value.walls ?? deps.combinedOutput.value
        const report = buildLayerDebugReport({
          drawing: deps.imageName.value,
          output: exportOutput,
          openings: {
            resolvedDoors: deps.resolvedDoors?.value ?? [],
            boundDoors: deps.boundDoors?.value ?? [],
            orientedDoors: deps.orientedDoors?.value ?? [],
            boundWindows: deps.boundWindows?.value ?? [],
            windowBindRejections: deps.windowBindRejections?.value ?? [],
          },
        })
        if (!report.layers.layer5) {
          throw new Error(
            'Laag 5 ontbreekt in export — rond muur-detectie af (finalize) en probeer opnieuw.',
          )
        }
        downloadText(
          JSON.stringify(report, null, 2),
          `${safe}-layer-debug.json`,
          'application/json',
        )
        downloadText(formatLayerDebugMarkdown(report), `${safe}-layer-debug.md`, 'text/markdown')
      } catch (e) {
        deps.setLocalError(formatCvError(e))
      }
    })()
  }

  return { exportExamplesReport }
}
