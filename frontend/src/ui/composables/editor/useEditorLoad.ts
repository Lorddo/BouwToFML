import { computed, nextTick, ref, type Ref } from 'vue'
import {
  createBlankFloor,
  createEmptyFloorPlan,
  emptyFloorNameIndexed,
} from '@/core/fml/empty-floor-plan'
import { ensureDefaultFacadeGroups, pruneFacadeGroups } from '@/core/fml/facade-groups'
import { applyJunctionSanitizeToPlan } from '@/core/fml/materialize-wall-junctions'
import { parseEditorPlanFile } from '@/ui/composables/editor/parse-editor-plan-file'
import {
  rebasePlanToItemRefid,
  type RebasePlanToItemRefidResult,
} from '@/core/fml/rebase-plan-to-item-refid'
import type { FloorOrientState } from '@/core/fml/floor-plan-orient'
import type { Floor, FloorPlan, ImportWarning } from '@/core/fml/types'
import {
  createFactoryViewerSessionDefaults,
  seedViewerDefaultsFromPlan,
  sessionDefaultsFromPartial,
  type ViewerSessionDefaults,
} from '@/core/fml/viewer-session-defaults'
import { seedPlanFromUserSettings } from '@/ui/composables/editor/seed-plan-stack-defaults'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'

type FmlLoadPhase = 'reading' | 'parsing' | 'building'

/** Laat de browser de overlay tekenen vóór sync-werk (import / muur-union). */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function sessionDefaultsFromSettings(): ViewerSessionDefaults {
  const d = loadUserSettings().defaults
  return sessionDefaultsFromPartial({
    wallHeightCm: d.wallHeightCm,
    doorHeightCm: d.doorHeightCm,
    windowHeightCm: d.windowHeightCm,
    windowSillZCm: d.windowSillZCm,
    bovenlichtDefault: d.bovenlichtDefault,
    windowBovenlichtDefault: d.windowBovenlichtDefault,
    bovenlichtHeightCm: d.bovenlichtHeightCm,
    bovenlichtGapCm: d.bovenlichtGapCm,
  })
}

/**
 * FML openen / wissen / floor-switch load-overlay voor de losse viewer.
 * Underlay + inspect reset blijven via deps (View houdt canvas/underlay wiring).
 */
export function useEditorLoad(deps: {
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
  cancelPlanRescale: () => void
  cancelUnderlayScale: () => void
  persistActiveUnderlayDrawing: () => void
  clearUnderlayState: () => void
  syncUnderlayForActiveFloor: () => Promise<void>
  resetInspectState: () => void
  hydrateFloorDefaultsFromPlan: (plan: FloorPlan | null) => void
  addFloorDefaultsSlot: (index: number, source?: ViewerSessionDefaults) => void
  removeFloorDefaultsSlot: (index: number) => void
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

  function resetTransientUi(): void {
    deps.warnings.value = []
    deps.fileName.value = null
    deps.error.value = null
    deps.activeFloorIndex.value = 0
    deps.orientByFloor.value = {}
    deps.pendingAlignRebase.value = null
    deps.resetInspectState()
    loadPhase.value = null
    loadFileName.value = null
    deps.cancelPlanRescale()
    deps.cancelUnderlayScale()
    deps.clearUnderlayState()
  }

  async function selectFloor(index: number): Promise<void> {
    if (index < 0 || index >= deps.floors.value.length) return
    if (index === deps.activeFloorIndex.value) return
    deps.flushPreviewFieldCommits()
    deps.persistActiveUnderlayDrawing()
    deps.cancelPlanRescale()
    deps.cancelUnderlayScale()
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

  function setPlanName(name: string): void {
    const current = deps.plan.value
    if (!current) return
    deps.plan.value = { ...current, name }
  }

  function renameFloor(index: number, name: string): void {
    const current = deps.plan.value
    const floor = current?.floors[index]
    if (!current || !floor) return
    deps.plan.value = {
      ...current,
      floors: current.floors.map((item, i) => (i === index ? { ...item, name } : item)),
    }
  }

  async function addFloor(): Promise<void> {
    const current = deps.plan.value
    if (!current) return
    deps.flushPreviewFieldCommits()
    deps.persistActiveUnderlayDrawing()
    deps.cancelPlanRescale()
    deps.cancelUnderlayScale()
    const nextIndex = current.floors.length
    const defaults = sessionDefaultsFromSettings()
    const floor = createBlankFloor({
      name: emptyFloorNameIndexed(nextIndex),
      level: nextIndex,
      wallHeightCm: defaults.wallHeightCm,
    })
    deps.plan.value = seedPlanFromUserSettings(
      { ...current, floors: [...current.floors, floor] },
      { facadeCatalog: true },
    )
    deps.addFloorDefaultsSlot(nextIndex, defaults)
    await selectFloor(nextIndex)
  }

  async function removeFloor(index: number): Promise<void> {
    const current = deps.plan.value
    if (!current || current.floors.length <= 1) return
    if (index < 0 || index >= current.floors.length) return
    deps.flushPreviewFieldCommits()
    if (index === deps.activeFloorIndex.value) {
      deps.persistActiveUnderlayDrawing()
    }
    deps.cancelPlanRescale()
    deps.cancelUnderlayScale()
    const floors = current.floors.filter((_, i) => i !== index)
    const nextOrient: Record<number, FloorOrientState> = {}
    for (const [key, value] of Object.entries(deps.orientByFloor.value)) {
      const from = Number(key)
      if (!Number.isFinite(from) || from === index) continue
      const to = from > index ? from - 1 : from
      nextOrient[to] = value
    }
    deps.orientByFloor.value = nextOrient
    deps.removeFloorDefaultsSlot(index)
    deps.plan.value = { ...current, floors }
    const nextActive =
      deps.activeFloorIndex.value > index
        ? deps.activeFloorIndex.value - 1
        : Math.min(deps.activeFloorIndex.value, floors.length - 1)
    deps.activeFloorIndex.value = Math.max(0, nextActive)
    await deps.syncUnderlayForActiveFloor()
  }

  function startNewPlan(): void {
    deps.flushPreviewFieldCommits()
    const defaults = sessionDefaultsFromSettings()
    deps.plan.value = seedPlanFromUserSettings(
      createEmptyFloorPlan({ wallHeightCm: defaults.wallHeightCm }),
      { facadeCatalog: true },
    )
    deps.sessionDefaults.value = defaults
    deps.hydrateFloorDefaultsFromPlan(deps.plan.value)
    deps.fmlOpacity.value = 0.8
    deps.hidePlanText.value = false
    resetTransientUi()
  }

  async function applyOpenedPlan(args: {
    plan: FloorPlan
    warnings: ImportWarning[]
    sourceName: string
    sessionDefaults?: ViewerSessionDefaults
  }): Promise<void> {
    pruneFacadeGroups(args.plan)
    ensureDefaultFacadeGroups(args.plan, loadUserSettings().fmlViewer.facadeGroups)
    deps.plan.value = applyJunctionSanitizeToPlan(args.plan)
    deps.sessionDefaults.value =
      args.sessionDefaults ?? seedViewerDefaultsFromPlan(args.plan, 0)
    deps.hydrateFloorDefaultsFromPlan(args.plan)
    deps.warnings.value = args.warnings
    deps.fileName.value = args.sourceName
    deps.activeFloorIndex.value = 0
    deps.orientByFloor.value = {}
    deps.pendingAlignRebase.value = null
    deps.resetInspectState()
    deps.cancelPlanRescale()
    deps.cancelUnderlayScale()
    await deps.syncUnderlayForActiveFloor()
    const preview = rebasePlanToItemRefid(args.plan)
    deps.pendingAlignRebase.value = preview.moved.length > 0 ? preview : null
    await nextTick()
    await yieldToPaint()
  }

  function failOpen(): void {
    deps.plan.value = null
    deps.sessionDefaults.value = createFactoryViewerSessionDefaults()
    deps.hydrateFloorDefaultsFromPlan(null)
    deps.warnings.value = []
    deps.fileName.value = null
    deps.activeFloorIndex.value = 0
    deps.orientByFloor.value = {}
    deps.pendingAlignRebase.value = null
    deps.resetInspectState()
    deps.clearUnderlayState()
  }

  /** True als de editor al een getekende/geladen plattegrond heeft (niet leeg). */
  function hasOpenContent(): boolean {
    return editorPlanHasContent(deps.plan.value)
  }

  /** In-memory openen (converter → editor, geen download). */
  async function loadPlan(plan: FloorPlan, sourceName: string): Promise<void> {
    deps.error.value = null
    deps.clearUnderlayState()
    loadPhase.value = 'building'
    loadFileName.value = sourceName
    await yieldToPaint()
    try {
      await applyOpenedPlan({ plan, warnings: [], sourceName })
    } catch (err) {
      failOpen()
      deps.error.value = err instanceof Error ? err.message : deps.t('viewer.importFailed')
    } finally {
      loadPhase.value = null
      loadFileName.value = null
    }
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

      const opened = parseEditorPlanFile(rawText)
      loadPhase.value = 'building'
      await yieldToPaint()

      await applyOpenedPlan({
        plan: opened.plan,
        warnings: opened.warnings,
        sourceName: file.name,
        sessionDefaults:
          opened.kind === 'plg' && opened.plgSettings
            ? sessionDefaultsFromPartial(opened.plgSettings.defaults)
            : undefined,
      })
    } catch (err) {
      failOpen()
      deps.error.value = err instanceof Error ? err.message : deps.t('viewer.importFailed')
    } finally {
      loadPhase.value = null
      loadFileName.value = null
    }
  }

  function clearPlan(): void {
    deps.plan.value = null
    deps.sessionDefaults.value = createFactoryViewerSessionDefaults()
    deps.hydrateFloorDefaultsFromPlan(null)
    deps.fmlOpacity.value = 0.8
    deps.hidePlanText.value = false
    resetTransientUi()
  }

  return {
    loadPhase,
    loadFileName,
    isLoadingFml,
    loadStatusLabel,
    floorLabel,
    selectFloor,
    setPlanName,
    renameFloor,
    addFloor,
    removeFloor,
    startNewPlan,
    loadPlan,
    hasOpenContent,
    onFileInput,
    clearPlan,
  }
}

/** Leeg «Nieuw plan» telt niet; muren/kamers/objecten wel. */
export function editorPlanHasContent(plan: FloorPlan | null): boolean {
  if (!plan) return false
  return plan.floors.some(
    (floor) =>
      (floor.walls?.length ?? 0) > 0 ||
      (floor.areas?.length ?? 0) > 0 ||
      (floor.items?.length ?? 0) > 0,
  )
}
