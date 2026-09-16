import type { ComputedRef, Ref } from 'vue'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { downloadFml, downloadText } from '@/core/fml/downloadFml'
import { stripStampGroupFromPlan } from '@/core/plan/facade-groups'
import { applyJunctionSanitizeToPlan } from '@/core/plan/materialize-wall-junctions'
import type { FloorPlan } from '@/core/plan/types'
import type { ViewerSessionDefaults } from '@/core/plan/viewer-session-defaults'
import {
  createPlgDocument,
  toPlgFloorDefaults,
  writePlg,
  type PlgSettings,
} from '@/core/plg/plg-document'
import { normalizeThicknessCatalog } from '@/core/plan/wall-thickness-catalog'
import { promptPlanExportFormat } from '@/ui/composables/plan-chrome-dialog'
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'

/**
 * Download `.fml` / `.plg`: serialiseert de live plattegrond, maakt er geen.
 * Beide paden flushen eerst velden + onderlegger en sanitizen knopen, zodat
 * een vuile canvas-staat niet in het bestand landt.
 */
export function useEditorDownload(deps: {
  plan: Ref<FloorPlan | null>
  fileName: Ref<string | null>
  scaleInputUnit: Ref<ScaleInputUnit>
  thicknessPresetCms: Ref<number[]>
  activeFloorDefaults: ComputedRef<ViewerSessionDefaults>
  defaultsForFloor: (index: number) => ViewerSessionDefaults
  flushPendingFieldCommits: () => void
  persistActiveUnderlayDrawing: () => void
}) {
  /** Live plan → FML-string alleen bij download (geen computed bij elke mutatie). */
  function buildCurrentFmlText(): string {
    if (!deps.plan.value) return ''
    const exportPlan = stripStampGroupFromPlan(deps.plan.value)
    return buildFmlV3(exportPlan, {
      name: exportPlan.name,
      bovenlichtDefault: (_floor, index) => deps.defaultsForFloor(index).bovenlichtDefault,
      windowBovenlichtDefault: (_floor, index) =>
        deps.defaultsForFloor(index).windowBovenlichtDefault,
      bovenlichtHeightCm: (_floor, index) => deps.defaultsForFloor(index).bovenlichtHeightCm,
      bovenlichtGapCm: (_floor, index) => deps.defaultsForFloor(index).bovenlichtGapCm,
      useMetric: loadUserSettings().unitSystem === 'metric',
    })
  }

  function buildPlgSettings(): PlgSettings {
    const settings = loadUserSettings()
    const catalog = normalizeThicknessCatalog(deps.thicknessPresetCms.value)
    return {
      unitSystem: settings.unitSystem,
      scaleInputUnit: deps.scaleInputUnit.value,
      planDisplayStyle: settings.planDisplay.planDisplayStyle ?? 'editor',
      showCanvasGrid: settings.planDisplay.showCanvasGrid !== false,
      // Hoogtes per verdieping; dikte-catalogus is project-lokaal (niet de globale Settings).
      defaults: toPlgFloorDefaults({
        ...settings.defaults,
        ...deps.activeFloorDefaults.value,
        thicknessCms: [...catalog],
      }),
    }
  }

  /** Flush + knoop-sanitize; `null` als er niets te exporteren is. */
  function prepareExportPlan(): FloorPlan | null {
    deps.flushPendingFieldCommits()
    deps.persistActiveUnderlayDrawing()
    if (!deps.plan.value) return null
    const junctioned = applyJunctionSanitizeToPlan(deps.plan.value)
    if (junctioned !== deps.plan.value) {
      deps.plan.value = junctioned
    }
    return deps.plan.value
  }

  function exportBaseName(plan: FloorPlan, fallback: string): string {
    return deps.fileName.value?.replace(/\.[^.]+$/i, '') || plan.name?.trim() || fallback
  }

  function downloadCurrentFml(): void {
    const prepared = prepareExportPlan()
    if (!prepared) return
    const text = buildCurrentFmlText()
    if (!text) return
    downloadFml(text, `${exportBaseName(prepared, 'fml-export')}.fml`)
  }

  function downloadCurrentPlg(): void {
    const prepared = prepareExportPlan()
    if (!prepared) return
    const exportPlan = stripStampGroupFromPlan(prepared)
    const base = exportBaseName(exportPlan, 'plan-export')
    const leftover = exportPlan.source?.leftover
    const doc = createPlgDocument({
      project: {
        id: `viewer-${base}`,
        name: exportPlan.name || base,
        address: '',
      },
      settings: buildPlgSettings(),
      plan: exportPlan,
      ...(leftover ? { foreign: { fml: leftover } } : {}),
    })
    downloadText(writePlg(doc), `${base}.plg`, 'application/json')
  }

  /** Zelfde popup als stap-4: kies .fml of .plg, daarna serialiseren. */
  async function downloadCurrentExport(): Promise<void> {
    if (!deps.plan.value) return
    const format = await promptPlanExportFormat()
    if (format === 'plg') downloadCurrentPlg()
    else if (format === 'fml') downloadCurrentFml()
  }

  return {
    buildCurrentFmlText,
    downloadCurrentFml,
    downloadCurrentPlg,
    downloadCurrentExport,
  }
}
