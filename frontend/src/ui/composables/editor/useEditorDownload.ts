import type { Ref } from 'vue'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { downloadFml, downloadText } from '@/core/fml/downloadFml'
import { stripStampGroupFromPlan } from '@/core/plan/facade-groups'
import { applyJunctionSanitizeToPlan } from '@/core/plan/materialize-wall-junctions'
import type { FloorPlan } from '@/core/plan/types'
import { readFloorDefaults } from '@/core/plan/floor-defaults'
import {
  createPlgDocument,
  toPlgFloorDefaults,
  writePlg,
  type PlgSettings,
} from '@/core/plg/plg-document'
import { normalizeThicknessCatalog } from '@/core/plan/wall-thickness-catalog'
import { promptPlanExportFormat } from '@/ui/composables/plan-chrome-dialog'
import { getConfiguredAccessPassword } from '@/ui/access-gate'
import { ensurePlanUnderlaysUploaded } from '@/platform/underlay-upload'
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
  activeFloorIndex: Ref<number>
  flushPendingFieldCommits: () => void
  persistActiveUnderlayDrawing: () => void
}) {
  function buildPlgSettings(): PlgSettings {
    const settings = loadUserSettings()
    const catalog = normalizeThicknessCatalog(deps.thicknessPresetCms.value)
    const floorDefaults = deps.plan.value
      ? readFloorDefaults(deps.plan.value, deps.activeFloorIndex.value)
      : undefined
    return {
      unitSystem: settings.unitSystem,
      scaleInputUnit: deps.scaleInputUnit.value,
      planDisplayStyle: settings.planDisplay.planDisplayStyle ?? 'editor',
      showCanvasGrid: settings.planDisplay.showCanvasGrid !== false,
      defaults: toPlgFloorDefaults({
        ...settings.defaults,
        ...floorDefaults,
        wallHeightCm:
          deps.plan.value?.floors[deps.activeFloorIndex.value]?.height ??
          settings.defaults.wallHeightCm,
        thicknessCms: [...catalog],
      }),
    }
  }

  function buildFmlTextFromPlan(plan: FloorPlan): string {
    const exportPlan = stripStampGroupFromPlan(plan)
    return buildFmlV3(exportPlan, {
      name: exportPlan.name,
      useMetric: loadUserSettings().unitSystem === 'metric',
    })
  }

  /** Live plan → FML-string alleen bij download (geen computed bij elke mutatie). */
  function buildCurrentFmlText(): string {
    if (!deps.plan.value) return ''
    return buildFmlTextFromPlan(deps.plan.value)
  }

  /** Flush + knoop-sanitize; `null` als er niets te exporteren is. */
  async function prepareExportPlan(): Promise<FloorPlan | null> {
    deps.flushPendingFieldCommits()
    deps.persistActiveUnderlayDrawing()
    if (!deps.plan.value) return null
    const junctioned = applyJunctionSanitizeToPlan(deps.plan.value)
    if (junctioned !== deps.plan.value) {
      deps.plan.value = junctioned
    }
    try {
      const uploaded = await ensurePlanUnderlaysUploaded(deps.plan.value, {
        projectId: deps.plan.value.name || 'editor',
        floorIds: deps.plan.value.floors.map((floor, index) => floor.name || `floor-${index}`),
        token: getConfiguredAccessPassword(),
      })
      if (uploaded.urls.length > 0) {
        deps.plan.value = uploaded.plan
      }
      return uploaded.plan
    } catch {
      return deps.plan.value
    }
  }

  function exportBaseName(plan: FloorPlan, fallback: string): string {
    return deps.fileName.value?.replace(/\.[^.]+$/i, '') || plan.name?.trim() || fallback
  }

  async function downloadCurrentFml(): Promise<void> {
    const prepared = await prepareExportPlan()
    if (!prepared) return
    const text = buildFmlTextFromPlan(prepared)
    if (!text) return
    downloadFml(text, `${exportBaseName(prepared, 'fml-export')}.fml`)
  }

  async function downloadCurrentPlg(): Promise<void> {
    const prepared = await prepareExportPlan()
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
    if (format === 'plg') await downloadCurrentPlg()
    else if (format === 'fml') await downloadCurrentFml()
  }

  return {
    buildCurrentFmlText,
    downloadCurrentFml,
    downloadCurrentPlg,
    downloadCurrentExport,
  }
}
