import { computed, nextTick, ref, type Ref } from 'vue'
import {
  createBlankFloor,
  createEmptyFloorPlan,
  emptyFloorNameIndexed,
} from '@/core/plan/empty-floor-plan'
import { ensureDefaultFacadeGroups, pruneFacadeGroups } from '@/core/plan/facade-groups'
import { applyJunctionSanitizeToPlan } from '@/core/plan/materialize-wall-junctions'
import { normalizeThicknessCatalog } from '@/core/plan/wall-thickness-catalog'
import { parseEditorPlanFile } from '@/ui/composables/editor/parse-editor-plan-file'
import {
  rebasePlanToItemRefid,
  type RebasePlanToItemRefidResult,
} from '@/core/plan/rebase-plan-to-item-refid'
import type { FloorOrientState } from '@/core/plan/floor-plan-orient'
import type { Floor, FloorPlan, ImportWarning } from '@/core/plan/types'
import {
  cloneFloorDefaults,
  floorDefaultsFromTemplate,
  readFloorDefaults,
  seedMissingFloorDefaults,
} from '@/core/plan/floor-defaults'
import { seedPlanFromUserSettings } from '@/ui/composables/editor/seed-plan-stack-defaults'
import { loadUserSettings } from '@/ui/composables/settings/user-settings'
import { getConfiguredAccessPassword } from '@/ui/access-gate'
import { ensurePlanUnderlaysUploaded } from '@/platform/underlay-upload'

function catalogFromUserDefaults(): number[] {
  return normalizeThicknessCatalog(loadUserSettings().defaults.thicknessCms)
}

export type LoadPlanOptions = {
  thicknessCms?: readonly number[]
}

type PlanLoadPhase = 'reading' | 'parsing' | 'building'

/** Laat de browser de overlay tekenen vóór sync-werk (import / muur-union). */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function floorDefaultsFromSettings() {
  const settings = loadUserSettings()
  return floorDefaultsFromTemplate({
    ...settings.defaults,
    openingFrameDefaults: settings.planDisplay.openingFrameDefaults,
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
  orientByFloor: Ref<Record<number, FloorOrientState>>
  pendingAlignRebase: Ref<RebasePlanToItemRefidResult | null>
  contentOpacity: Ref<number>
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
  applyThicknessCatalog: (cms: readonly number[]) => void
  clearUndoStacks: () => void
  pushUndo: () => void
}) {
  const loadPhase = ref<PlanLoadPhase | null>(null)
  const loadFileName = ref<string | null>(null)
  const isLoadingPlan = computed(() => loadPhase.value != null)

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
    deps.pushUndo()
    deps.plan.value = { ...current, name }
  }

  function renameFloor(index: number, name: string): void {
    const current = deps.plan.value
    const floor = current?.floors[index]
    if (!current || !floor) return
    deps.pushUndo()
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
    deps.pushUndo()
    const nextIndex = current.floors.length
    const sourceFloor = current.floors[deps.activeFloorIndex.value] ?? current.floors[0]
    const floor = createBlankFloor({
      name: emptyFloorNameIndexed(nextIndex),
      level: nextIndex,
      wallHeightCm: sourceFloor?.height,
      defaults: cloneFloorDefaults(readFloorDefaults(current, deps.activeFloorIndex.value)),
    })
    deps.plan.value = seedPlanFromUserSettings(
      { ...current, floors: [...current.floors, floor] },
      { facadeCatalog: true },
    )
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
    deps.pushUndo()
    const floors = current.floors.filter((_, i) => i !== index)
    const nextOrient: Record<number, FloorOrientState> = {}
    for (const [key, value] of Object.entries(deps.orientByFloor.value)) {
      const from = Number(key)
      if (!Number.isFinite(from) || from === index) continue
      const to = from > index ? from - 1 : from
      nextOrient[to] = value
    }
    deps.orientByFloor.value = nextOrient
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
    deps.clearUndoStacks()
    const settings = loadUserSettings()
    deps.plan.value = seedPlanFromUserSettings(
      createEmptyFloorPlan({
        wallHeightCm: settings.defaults.wallHeightCm,
        defaults: floorDefaultsFromSettings(),
      }),
      { facadeCatalog: true },
    )
    deps.applyThicknessCatalog(catalogFromUserDefaults())
    deps.contentOpacity.value = 0.8
    deps.hidePlanText.value = false
    resetTransientUi()
  }

  async function applyOpenedPlan(args: {
    plan: FloorPlan
    warnings: ImportWarning[]
    sourceName: string
    thicknessCms?: readonly number[]
  }): Promise<void> {
    deps.clearUndoStacks()
    pruneFacadeGroups(args.plan)
    ensureDefaultFacadeGroups(args.plan, loadUserSettings().planDisplay.facadeGroups)
    let opened = args.plan
    try {
      const uploaded = await ensurePlanUnderlaysUploaded(opened, {
        projectId: opened.name?.trim() || 'editor',
        floorIds: opened.floors.map((floor, index) => floor.name?.trim() || `floor-${index}`),
        token: getConfiguredAccessPassword(),
      })
      opened = uploaded.plan
    } catch {
      // Data-URL blijft; download probeert R2 opnieuw.
    }
    const settings = loadUserSettings()
    deps.plan.value = seedMissingFloorDefaults(applyJunctionSanitizeToPlan(opened), {
      template: floorDefaultsFromTemplate({
        ...settings.defaults,
        openingFrameDefaults: settings.planDisplay.openingFrameDefaults,
      }),
    })
    deps.applyThicknessCatalog(args.thicknessCms ?? catalogFromUserDefaults())
    deps.warnings.value = args.warnings
    deps.fileName.value = args.sourceName
    deps.activeFloorIndex.value = 0
    deps.orientByFloor.value = {}
    deps.pendingAlignRebase.value = null
    deps.resetInspectState()
    deps.cancelPlanRescale()
    deps.cancelUnderlayScale()
    await deps.syncUnderlayForActiveFloor()
    const preview = rebasePlanToItemRefid(opened)
    deps.pendingAlignRebase.value = preview.moved.length > 0 ? preview : null
    await nextTick()
    await yieldToPaint()
  }

  function failOpen(): void {
    deps.clearUndoStacks()
    deps.plan.value = null
    deps.applyThicknessCatalog(catalogFromUserDefaults())
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
  async function loadPlan(
    plan: FloorPlan,
    sourceName: string,
    options?: LoadPlanOptions,
  ): Promise<void> {
    deps.error.value = null
    deps.clearUnderlayState()
    loadPhase.value = 'building'
    loadFileName.value = sourceName
    await yieldToPaint()
    try {
      await applyOpenedPlan({
        plan,
        warnings: [],
        sourceName,
        thicknessCms: options?.thicknessCms,
      })
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
        thicknessCms:
          opened.kind === 'plg' ? opened.plgSettings?.defaults.thicknessCms : undefined,
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
    deps.applyThicknessCatalog(catalogFromUserDefaults())
    deps.contentOpacity.value = 0.8
    deps.hidePlanText.value = false
    resetTransientUi()
  }

  return {
    loadPhase,
    loadFileName,
    isLoadingPlan,
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
