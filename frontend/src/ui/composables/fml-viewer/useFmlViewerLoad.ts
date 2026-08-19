import { computed, nextTick, ref, type Ref } from 'vue'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import {
  rebasePlanToItemRefid,
  type RebasePlanToItemRefidResult,
} from '@/core/fml/rebase-plan-to-item-refid'
import type { FloorOrientState } from '@/core/fml/floor-plan-orient'
import type { Floor, FloorPlan, ImportWarning } from '@/core/fml/types'
import {
  createFactoryViewerSessionDefaults,
  seedViewerDefaultsFromPlan,
  type ViewerSessionDefaults,
} from '@/core/fml/viewer-session-defaults'

type FmlLoadPhase = 'reading' | 'parsing' | 'building'

/** Laat de browser de overlay tekenen vóór sync-werk (import / muur-union). */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

/**
 * FML openen / wissen / floor-switch load-overlay voor de losse viewer.
 * Underlay + inspect reset blijven via deps (View houdt canvas/underlay wiring).
 */
export function useFmlViewerLoad(deps: {
  plan: Ref<FloorPlan | null>
  warnings: Ref<ImportWarning[]>
  error: Ref<string | null>
  fileName: Ref<string | null>
  activeFloorIndex: Ref<number>
  sessionDefaults: Ref<ViewerSessionDefaults>
  orientByFloor: Ref<Record<number, FloorOrientState>>
  pendingAlignRebase: Ref<RebasePlanToItemRefidResult | null>
  fmlOpacity: Ref<number>
  hidePlanText: Ref<boolean>
  floors: Ref<readonly Floor[]>
  // vue-i18n ComposerTranslation — keep loose to avoid coupling the composable to i18n types.
  t: (key: string, ...args: unknown[]) => string
  flushPreviewFieldCommits: () => void
  cancelFmlRescale: () => void
  clearUnderlayState: () => void
  syncUnderlayForActiveFloor: () => Promise<void>
  resetInspectState: () => void
}) {
  const loadPhase = ref<FmlLoadPhase | null>(null)
  const loadFileName = ref<string | null>(null)
  const isLoadingFml = computed(() => loadPhase.value != null)

  const loadStatusLabel = computed(() => {
    const phase = loadPhase.value
    if (!phase) return ''
    if (phase === 'reading') return deps.t('viewer.loadReading')
    if (phase === 'parsing') return deps.t('viewer.loadParsing')
    return deps.t('viewer.loadBuilding')
  })

  function floorLabel(index: number): string {
    const floor = deps.floors.value[index]
    if (!floor) return deps.t('project.floorNameIndexed', { n: index + 1 })
    const name = floor.name?.trim()
    if (name) return name
    return deps.t('project.floorNameIndexed', { n: index + 1 })
  }

  async function selectFloor(index: number): Promise<void> {
    if (index < 0 || index >= deps.floors.value.length) return
    if (index === deps.activeFloorIndex.value) return
    deps.flushPreviewFieldCommits()
    deps.cancelFmlRescale()
    await nextTick()
    loadPhase.value = 'building'
    loadFileName.value = floorLabel(index)
    await yieldToPaint()
    deps.activeFloorIndex.value = index
    await nextTick()
    await yieldToPaint()
    loadPhase.value = null
    loadFileName.value = null
  }

  async function onFileInput(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    deps.error.value = null
    deps.clearUnderlayState()
    loadPhase.value = 'reading'
    loadFileName.value = file.name
    await yieldToPaint()

    try {
      const rawText = await file.text()
      loadPhase.value = 'parsing'
      await yieldToPaint()

      const parsed = importFmlV3(rawText)
      loadPhase.value = 'building'
      await yieldToPaint()

      deps.plan.value = parsed.plan
      deps.sessionDefaults.value = seedViewerDefaultsFromPlan(parsed.plan, 0)
      deps.warnings.value = parsed.warnings
      deps.fileName.value = file.name
      deps.activeFloorIndex.value = 0
      deps.orientByFloor.value = {}
      deps.pendingAlignRebase.value = null
      deps.resetInspectState()
      await deps.syncUnderlayForActiveFloor()
      const preview = rebasePlanToItemRefid(parsed.plan)
      deps.pendingAlignRebase.value = preview.moved.length > 0 ? preview : null
      await nextTick()
      await yieldToPaint()
    } catch (err) {
      deps.plan.value = null
      deps.sessionDefaults.value = createFactoryViewerSessionDefaults()
      deps.warnings.value = []
      deps.fileName.value = null
      deps.activeFloorIndex.value = 0
      deps.orientByFloor.value = {}
      deps.pendingAlignRebase.value = null
      deps.resetInspectState()
      deps.clearUnderlayState()
      deps.error.value = err instanceof Error ? err.message : 'FML import mislukt.'
    } finally {
      loadPhase.value = null
      loadFileName.value = null
    }
  }

  function clearPlan(): void {
    deps.plan.value = null
    deps.sessionDefaults.value = createFactoryViewerSessionDefaults()
    deps.warnings.value = []
    deps.fileName.value = null
    deps.error.value = null
    deps.activeFloorIndex.value = 0
    deps.orientByFloor.value = {}
    deps.fmlOpacity.value = 0.8
    deps.hidePlanText.value = false
    deps.pendingAlignRebase.value = null
    deps.resetInspectState()
    loadPhase.value = null
    loadFileName.value = null
    deps.cancelFmlRescale()
    deps.clearUnderlayState()
  }

  return {
    loadPhase,
    loadFileName,
    isLoadingFml,
    loadStatusLabel,
    floorLabel,
    selectFloor,
    onFileInput,
    clearPlan,
  }
}
