import { computed, nextTick, ref, type Ref } from 'vue'
import type { Floor, FloorPlan } from '@/core/plan/types'
import type { SourceToWorkingTransform } from '@/core/plan/source-underlay-transform'
import { floorDefaultsFromTemplate } from '@/core/plan/floor-defaults'
import { wallsInStampGroup } from '@/core/plan/facade-groups'
import { unionThicknessCatalogs } from '@/core/plan/wall-thickness-catalog'
import type { PreprocessConfig } from '@/platform/image'
import { clonePlain, type DevWorkspaceSession } from '@/platform/dev-workspace'
import type { DrawingProfileId } from '@/platform/profile'
import type { SelectionRect } from '@/platform/selection'
import {
  createProjectPersistController,
  deleteOtherProjects,
  deleteProject,
  saveProject,
} from '@/platform/project-store'
import { isPersistSizeError, persistErrorMessage } from '@/platform/project-store/persist-errors'
import { clearDevSessionsStore } from '@/platform/dev-workspace/idb'
import type { WorkspaceFlowStep } from '@/ui/composables/workspace/constants'
import type { RestoreSessionOptions } from '@/ui/composables/workspace/workspace-dev-session-restore-flow'
import { tGlobal } from '@/ui/i18n'
import {
  createDefaultFloorDefaults,
  createDefaultFloorMeta,
  createEmptyProjectState,
  createFloorId,
  floorNameIndexedNl,
  thicknessCatalogPatchFromFloorDefaults,
} from './defaults'
import { projectStepCanProceed } from '@/ui/composables/workspace/constants'
import {
  attachWorkspaceUnderlayToFloor,
  layoutFromSessionScale,
} from './attach-workspace-underlay'
import { mergeFloorPlans } from './merge-floor-plans'
import { mirrorFloorBlobVertical } from './mirror-floor-blob'
import {
  getProjectPdfStore,
  setProjectPdfStore,
  clonePdfUnderlaySource,
  type PdfUnderlaySource,
} from '@/platform/upload'
import {
  keepSourceUnderlayRotation,
  pdfMetaFromSource,
  resolveReuseInputRotation,
  resolveReusePdfBytes,
  type ReuseUnderlayLoadOptions,
  type UnderlayInputRotation,
} from './reuse-underlay-pdf'
import type {
  FloorMeta,
  FloorOrientPersist,
  FloorWorkspaceBlob,
  PreviewUnderlayLayout,
  ProjectPlanDefaults,
  ProjectMeta,
  PlanUnderlay,
  ProjectSourceUnderlay,
  ProjectState,
} from './types'
import { floorStatusFromFlowStep, resolveHydrateFlowStep, type FloorFlowStep } from './types'

export type WorkspaceProjectDeps = {
  flowStep: Ref<WorkspaceFlowStep>
  imageSrc: Ref<string | null>
  imageName: Ref<string | null>
  preprocess: Ref<PreprocessConfig>
  drawingProfileId: Ref<DrawingProfileId>
  rects: Ref<SelectionRect[]>
  /** Capture huidige live workspace; throwt zonder image. */
  captureCurrentSession: (options?: { forceExactRestore?: boolean }) => DevWorkspaceSession
  /** Herstel session in live workspace (zelfde pad als DevSession). */
  restoreSession: (session: DevWorkspaceSession, options?: RestoreSessionOptions) => Promise<void>
  /** Lege floor: wipe image/masks/detectie, flow → input. */
  resetToEmptyFloor: () => void
  /** Zet image + optioneel scale snapshot (onderlegger overnemen). */
  loadUnderlayWithScale: (
    src: string,
    name: string,
    scale?: DevWorkspaceSession['scale'],
    pdfSource?: PdfUnderlaySource | null,
    reuseOpts?: ReuseUnderlayLoadOptions,
  ) => Promise<void>
  /**
   * Pas alleen B/W-tune + profile toe (geen LBE-rects, geen gemeten muurdikte —
   * die wijkt na per-floor crop af).
   */
  applyPreprocessTune: (params: {
    preprocess: PreprocessConfig
    drawingProfileId: DrawingProfileId
  }) => void
  setLocalError: (message: string | null) => void
  /** Huidige FML-preview (incl. edits), of null. */
  getPreviewPlan: () => FloorPlan | null
  /** Underlay-layout bij huidige preview (origin + px/mm). */
  getPreviewUnderlayLayout: () => PreviewUnderlayLayout | null
  /** Zet live FML-preview (na project-spiegel zonder floor-switch). */
  updatePreviewPlan: (plan: FloorPlan, layout?: PreviewUnderlayLayout | null) => void
  /** Gebruikers-nulpunt in scant-cm, of null. */
  getPlanNulpuntImageCm: () => { x: number; y: number } | null
  /** Zet nulpunt bij floor-hydrate (na restore). */
  setPlanNulpuntImageCm: (point: { x: number; y: number } | null) => void
  /** FML-oriëntatie (spiegel/90°) t.o.v. canonieke generate. */
  getPlanOrient: () => FloorOrientPersist | null
  setPlanOrient: (state: FloorOrientPersist | null) => void
  /**
   * Wis live FML-preview ná capture, vóór activeFloorId-wissel —
   * anders remount de canvas met de vorige verdieping als plan.
   */
  clearLivePlanCanvas: () => void
  /** Sync FML UI-defaults vanuit effectieve floor defaults. */
  applyPlanDefaultsToUi?: (defaults: ProjectPlanDefaults) => void
  /** Skip IndexedDB-write tijdens running / restoring. */
  shouldSkipPersist?: () => boolean
  /** Runtime PDF source for ROI re-render (memory-only across floor switch). */
  getPdfUnderlaySource?: () => PdfUnderlaySource | null
  setPdfUnderlaySource?: (source: PdfUnderlaySource | null) => void
  /**
   * Re-raster a full PDF page and load it as the working underlay.
   * Used by «Onderlegger overnemen» so a new crop can ROI-render from the PDF.
   */
  loadUnderlayFromPdf?: (
    pdfSource: PdfUnderlaySource,
    name: string,
    scale?: DevWorkspaceSession['scale'],
    reuseOpts?: ReuseUnderlayLoadOptions,
  ) => Promise<void>
}

function emptyBlob(): FloorWorkspaceBlob {
  return {
    session: null,
    generatedFloor: null,
    previewPlan: null,
    previewUnderlayLayout: null,
    planNulpuntImageCm: null,
    planOrient: null,
    sourceUnderlay: null,
    planUnderlay: null,
    sourceToWorking: null,
    pdfUnderlaySource: null,
    sourcePdfUnderlay: null,
  }
}

function isDurableUnderlaySrc(src: string | null | undefined): boolean {
  return !!src && !src.startsWith('blob:')
}

function sessionWithTargetStep(
  session: DevWorkspaceSession,
  target: FloorFlowStep,
): DevWorkspaceSession {
  if (session.schemaVersion !== 2 || session.flow.targetFlowStep === target) return session
  return {
    ...session,
    flow: { ...session.flow, targetFlowStep: target },
  }
}

function bumpSessionTargetToLiveStep(
  session: DevWorkspaceSession | null,
  liveStep: WorkspaceFlowStep,
): DevWorkspaceSession | null {
  if (!session || session.schemaVersion !== 2) return session
  const bumped = resolveHydrateFlowStep(session.flow.targetFlowStep, floorStatusFromFlowStep(liveStep))
  return sessionWithTargetStep(session, bumped)
}

export function useWorkspaceProject(deps: WorkspaceProjectDeps) {
  const state = ref<ProjectState>(createEmptyProjectState())
  const switchingFloor = ref(false)

  const projectMeta = computed(() => state.value.meta)
  const projectFloors = computed(() => state.value.floors)
  const activeFloorId = computed(() => state.value.activeFloorId)
  const activeFloor = computed(
    () => state.value.floors.find((f) => f.id === state.value.activeFloorId) ?? null,
  )
  const sourceUnderlay = computed(() => state.value.sourceUnderlay)
  const activeFloorDefaults = computed(() => effectiveDefaultsForFloor(state.value.activeFloorId))

  const canProceedFromProject = computed(() =>
    projectStepCanProceed({
      name: state.value.meta.name,
      address: state.value.meta.address,
      floorCount: state.value.floors.length,
      activeFloorId: state.value.activeFloorId,
    }),
  )

  const canReuseUnderlay = computed(() => listUnderlayDonorFloors().length > 0)

  const canCopyPreprocessRefs = computed(() => listPreprocessDonorFloors().length > 0)

  async function writeProjectToIdb(): Promise<void> {
    // Quota-ladder: alle CV-slanking (detection/classify/PDF) via PersistProjectOptions
    // op de converter-sidecar in serialize — plan-helft blijft intact.
    const attempts: Array<{
      label: string
      before?: () => Promise<void>
      options?: Parameters<typeof saveProject>[1]
    }> = [
      { label: 'default', options: { omitResultDetection: true, omitLegacyProjectSource: true } },
      {
        label: 'quota-cleanup',
        before: async () => {
          await deleteOtherProjects(state.value.meta.id).catch(() => undefined)
          await clearDevSessionsStore().catch(() => undefined)
        },
        options: {
          omitResultDetection: true,
          omitLegacyProjectSource: true,
          stripClassifyRasters: true,
          omitSourcePdf: true,
          omitStampRasters: true,
        },
      },
    ]

    let lastError: unknown = null
    for (const attempt of attempts) {
      try {
        await attempt.before?.()
        await saveProject(state.value, attempt.options)
        // Eén actief projectrecord tegelijk.
        await deleteOtherProjects(state.value.meta.id).catch(() => undefined)
        return
      } catch (error) {
        lastError = error
        if (attempt.label === 'default') {
          // Quota, «too large» of DataClone: slankere tweede poging.
          continue
        }
        if (!isPersistSizeError(error)) {
          break
        }
      }
    }

    if (isPersistSizeError(lastError)) {
      deps.setLocalError(tGlobal('project.errors.persistQuota'))
      console.warn('[project-store] persist size/quota exceeded after cleanup', lastError)
      return
    }
    const detail = persistErrorMessage(lastError)
    deps.setLocalError(
      detail
        ? tGlobal('project.errors.persistFailedDetail', { message: detail })
        : tGlobal('project.errors.persistFailed'),
    )
    console.warn('[project-store] save failed', lastError)
  }

  const persistCtrl = createProjectPersistController({
    save: writeProjectToIdb,
    shouldSkip: () => switchingFloor.value || deps.shouldSkipPersist?.() === true,
    onError: (error) => {
      console.warn('[project-store] persist controller error', error)
    },
  })

  /**
   * Capture actieve floor + schrijf ProjectState naar IndexedDB.
   * Geen throw naar de UI — mislukte save breekt de flow niet.
   */
  function persistProject(_reason?: string): void {
    if (deps.flowStep.value !== 'project') {
      captureActiveFloorIntoBlob()
    }
    persistCtrl.persistNow()
  }

  function persistProjectDebounced(): void {
    persistCtrl.persistDebounced()
  }

  function resolveDonorFloorId(): string | null {
    const active = state.value.activeFloorId
    const withSession = state.value.floors.filter(
      (f) => f.id !== active && !!state.value.blobs[f.id]?.session,
    )
    if (withSession.length === 0) return null
    // Prefer previous in list, else first other with session.
    const idx = state.value.floors.findIndex((f) => f.id === active)
    for (let i = idx - 1; i >= 0; i--) {
      const id = state.value.floors[i]?.id
      if (id && state.value.blobs[id]?.session) return id
    }
    return withSession[0]?.id ?? null
  }

  /** Bronscan van een floor; legacy fallback op project-level sourceUnderlay. */
  function getFloorSourceUnderlay(floorId: string): ProjectSourceUnderlay | null {
    const fromFloor = state.value.blobs[floorId]?.sourceUnderlay
    if (fromFloor && isDurableUnderlaySrc(fromFloor.src)) return fromFloor
    // Oude saves: alleen project-level bron — gebruik als donor voor eerdere floors met session.
    const projectSrc = state.value.sourceUnderlay
    if (!projectSrc || !isDurableUnderlaySrc(projectSrc.src)) return null
    const hasAnyFloorSource = state.value.floors.some((f) =>
      isDurableUnderlaySrc(state.value.blobs[f.id]?.sourceUnderlay?.src),
    )
    if (hasAnyFloorSource) return null
    if (!state.value.blobs[floorId]?.session) return null
    return projectSrc
  }

  function listUnderlayDonorFloors(): Array<{ id: string; name: string }> {
    const activeId = state.value.activeFloorId
    const out: Array<{ id: string; name: string }> = []
    for (const meta of state.value.floors) {
      if (meta.id === activeId) continue
      if (!getFloorSourceUnderlay(meta.id)) continue
      out.push({ id: meta.id, name: meta.name })
    }
    return out
  }

  function listPreprocessDonorFloors(): Array<{ id: string; name: string }> {
    const activeId = state.value.activeFloorId
    const out: Array<{ id: string; name: string }> = []
    for (const meta of state.value.floors) {
      if (meta.id === activeId) continue
      if (!state.value.blobs[meta.id]?.session?.preprocess) continue
      out.push({ id: meta.id, name: meta.name })
    }
    return out
  }

  function updateProjectMeta(patch: Partial<ProjectMeta>): void {
    state.value = {
      ...state.value,
      meta: { ...state.value.meta, ...patch },
    }
    persistProjectDebounced()
  }

  function updateAllFloorDefaults(
    patch: Partial<ProjectPlanDefaults>,
    options?: { syncUi?: boolean },
  ): void {
    state.value = {
      ...state.value,
      floors: state.value.floors.map((f) => ({ ...f, defaults: { ...f.defaults, ...patch } })),
    }
    if (options?.syncUi !== false) syncActiveFloorDefaultsToUi()
    persistProjectDebounced()
  }

  function updateActiveFloorDefaults(
    patch: Partial<ProjectPlanDefaults>,
    options?: { syncUi?: boolean },
  ): void {
    const id = state.value.activeFloorId
    state.value = {
      ...state.value,
      floors: state.value.floors.map((f) =>
        f.id === id ? { ...f, defaults: { ...f.defaults, ...patch } } : f,
      ),
    }
    if (options?.syncUi === false) {
      persistProjectDebounced()
      return
    }
    syncActiveFloorDefaultsToUi()
    persistProjectDebounced()
  }

  function resetActiveFloorDefaults(): void {
    const id = state.value.activeFloorId
    state.value = {
      ...state.value,
      floors: state.value.floors.map((f) =>
        f.id === id ? { ...f, defaults: createDefaultFloorDefaults() } : f,
      ),
    }
    syncActiveFloorDefaultsToUi()
    persistProjectDebounced()
  }

  function effectiveDefaultsForFloor(floorId: string): ProjectPlanDefaults {
    const floor = state.value.floors.find((f) => f.id === floorId)
    // Merge met factory: oude persisted floors missen nieuwe keys (bv. windowBovenlichtDefault).
    return floor
      ? { ...createDefaultFloorDefaults(), ...floor.defaults }
      : createDefaultFloorDefaults()
  }

  function syncActiveFloorDefaultsToUi(): void {
    deps.applyPlanDefaultsToUi?.(effectiveDefaultsForFloor(state.value.activeFloorId))
  }

  /**
   * Snapshot actieve floor → runtime blob (session + previewPlan/…).
   * Persist (`toPersistedProject`) splitst daarna naar plan-helft + CV-sidecar.
   */
  function captureActiveFloorIntoBlob(): void {
    const id = state.value.activeFloorId
    const prev = state.value.blobs[id] ?? emptyBlob()
    let session: DevWorkspaceSession | null = prev.session
    try {
      if (deps.imageSrc.value) {
        // Floor-switch: altijd exact (incl. stap 4) — geen detectie-replay bij terugkeer.
        session = deps.captureCurrentSession({ forceExactRestore: true })
        // Never store project as target step on a floor blob.
        if (session.schemaVersion === 2 && session.flow.targetFlowStep === 'project') {
          session = {
            ...session,
            flow: { ...session.flow, targetFlowStep: 'input' },
          }
        }
      }
    } catch {
      // Capture kan falen (image nog bezig, stamp+exact te zwaar) — houd de
      // vorige session, maar til targetFlowStep mee zodat resume niet op stap 2 blijft.
      session = bumpSessionTargetToLiveStep(session, deps.flowStep.value)
    }

    const livePlan = deps.getPreviewPlan()
    // Per-floor blob: alleen floors[0] van de live preview (workspace = single-floor).
    // Voorkomt dat een multi-floor import/plan andere verdiepingen meeschrijft.
    const previewPlan = livePlan
      ? clonePlain({
          ...livePlan,
          floors: livePlan.floors[0] ? [livePlan.floors[0]] : [],
        })
      : (prev.previewPlan ?? null)
    const liveLayout = deps.getPreviewUnderlayLayout()
    const previewUnderlayLayout = liveLayout
      ? clonePlain(liveLayout)
      : (prev.previewUnderlayLayout ?? null)
    // Live nulpunt is source of truth voor déze floor (ook null) — geen prev lekken
    // naar een andere verdieping bij switch.
    const liveNulpunt = deps.getPlanNulpuntImageCm()
    const planNulpuntImageCm = liveNulpunt ? clonePlain(liveNulpunt) : null
    const liveOrient = deps.getPlanOrient()
    const planOrient = liveOrient ? clonePlain(liveOrient) : null
    const generatedFloor = previewPlan?.floors[0] ?? prev.generatedFloor
    const status = floorStatusFromFlowStep(deps.flowStep.value)
    const floorStatus = session ? (status === 'empty' ? 'input' : status) : 'empty'

    state.value = {
      ...state.value,
      floors: state.value.floors.map((f) => (f.id === id ? { ...f, status: floorStatus } : f)),
      blobs: {
        ...state.value.blobs,
        [id]: {
          session,
          generatedFloor,
          previewPlan,
          previewUnderlayLayout,
          planNulpuntImageCm,
          planOrient,
          // Schaal-bevestiging schrijft bronscan op de blob; niet wissen bij floor-switch.
          sourceUnderlay: prev.sourceUnderlay ?? null,
          planUnderlay: prev.planUnderlay ?? null,
          sourceToWorking: prev.sourceToWorking ?? null,
          // Live PDF (full-page space). After crop the getter is null — do not keep
          // prev (stale coords on the cropped working image).
          pdfUnderlaySource: deps.getPdfUnderlaySource
            ? (deps.getPdfUnderlaySource() ?? null)
            : (prev.pdfUnderlaySource ?? null),
          // Donor PDF survives crop so reuse can re-raster a new ROI.
          sourcePdfUnderlay: prev.sourcePdfUnderlay ?? null,
        },
      },
    }
  }

  /**
   * Schrijf een previewPlan in een floor-blob (undo/redo vóór hydrate).
   * Raakt de live canvas niet — caller doet switchFloor of updatePreviewPlan.
   */
  function writePreviewPlanToFloorBlob(
    floorId: string,
    plan: FloorPlan,
    options?: { layoutOrigin?: { x: number; y: number } | null },
  ): void {
    if (!state.value.floors.some((f) => f.id === floorId)) return
    const prev = state.value.blobs[floorId] ?? emptyBlob()
    const previewPlan = clonePlain({
      ...plan,
      floors: plan.floors[0] ? [plan.floors[0]] : [],
    })
    let previewUnderlayLayout = prev.previewUnderlayLayout
    if (options && 'layoutOrigin' in options && previewUnderlayLayout) {
      previewUnderlayLayout = clonePlain({
        ...previewUnderlayLayout,
        origin: options.layoutOrigin
          ? { x: options.layoutOrigin.x, y: options.layoutOrigin.y }
          : previewUnderlayLayout.origin,
      })
    }
    state.value = {
      ...state.value,
      blobs: {
        ...state.value.blobs,
        [floorId]: {
          ...prev,
          previewPlan,
          generatedFloor: previewPlan.floors[0] ?? prev.generatedFloor,
          previewUnderlayLayout,
        },
      },
    }
  }

  /**
   * Herstel floor uit blob: session = CV-sidecar + plan.scale (na IDB-restore samengevoegd).
   * Result-floor zonder detectionExact → stap 3 leeg; 3→4 via previewPlan.
   */
  async function hydrateFloor(floorId: string): Promise<void> {
    const blob = state.value.blobs[floorId] ?? emptyBlob()
    syncActiveFloorDefaultsToUi()
    if (!blob.session) {
      deps.setPdfUnderlaySource?.(null)
      deps.resetToEmptyFloor()
      deps.flowStep.value = 'input'
      return
    }
    const floorStatus =
      state.value.floors.find((f) => f.id === floorId)?.status ?? 'empty'
    const sessionTarget =
      blob.session.schemaVersion === 2 ? blob.session.flow.targetFlowStep : 'templates'
    const targetStep = resolveHydrateFlowStep(sessionTarget, floorStatus)
    const session = sessionWithTargetStep(blob.session, targetStep)
    const isResult = targetStep === 'result'
    // Altijd volledige session-restore (refs/dikte/detectie/B/W).
    // Oude «fast result»-pad wiste LBE-refs via clearWorkspaceForSession — breekt
    // stap-terug preserve na floor-switch/resume.
    await deps.restoreSession(session, {
      skipOpeningsRerun: isResult,
      applyPreviewPlan: isResult ? (blob.previewPlan ?? null) : null,
      applyPreviewUnderlayLayout: isResult
        ? (blob.previewUnderlayLayout ?? layoutFromSessionScale(blob.session.scale))
        : null,
      applyPlanNulpuntImageCm: isResult ? (blob.planNulpuntImageCm ?? null) : null,
      applyPlanOrient: isResult ? (blob.planOrient ?? null) : null,
    })
    if (!isResult) {
      deps.setPlanNulpuntImageCm(null)
      deps.setPlanOrient(null)
    }
    deps.setPdfUnderlaySource?.(blob.pdfUnderlaySource ?? null)
  }

  async function switchFloor(floorId: string): Promise<void> {
    if (floorId === state.value.activeFloorId) return
    if (!state.value.floors.some((f) => f.id === floorId)) {
      deps.setLocalError(tGlobal('project.errors.floorNotFound'))
      return
    }
    switchingFloor.value = true
    deps.setLocalError(null)
    let shouldPersist = false
    try {
      if (deps.flowStep.value !== 'project') {
        captureActiveFloorIntoBlob()
        // Ná capture: live preview wissen vóór activeFloorId-wissel. Remount (key=floorId)
        // zou anders nog de vorige previewPlan als props krijgen — nulpunt-apply bakte
        // die stale geometrie daarna in de nieuwe floor.
        deps.clearLivePlanCanvas()
      }
      state.value = { ...state.value, activeFloorId: floorId }
      if (deps.flowStep.value === 'project') {
        // Stay on project; hydrate when leaving stap 0.
        shouldPersist = true
        return
      }
      await hydrateFloor(floorId)
      // Laat Vue prop-updates (plan/nulpunt/underlay) flushen vóór watches weer mogen
      // schrijven naar de actieve blob — voorkomt vorige-floor lek in previewPlan.
      await nextTick()
      shouldPersist = true
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      deps.setLocalError(message)
      throw e
    } finally {
      switchingFloor.value = false
      if (shouldPersist) persistCtrl.persistNow()
    }
  }

  function addFloor(params?: { name?: string; level?: number }): FloorMeta {
    captureActiveFloorIntoBlob()
    const maxLevel = state.value.floors.reduce((m, f) => Math.max(m, f.level), -1)
    const donorDefaults = effectiveDefaultsForFloor(state.value.activeFloorId)
    const floor = createDefaultFloorMeta({
      id: createFloorId(),
      name: params?.name ?? floorNameIndexedNl(state.value.floors.length),
      level: params?.level ?? maxLevel + 1,
      status: 'empty',
      defaults: { ...donorDefaults },
    })
    state.value = {
      ...state.value,
      floors: [...state.value.floors, floor],
      blobs: { ...state.value.blobs, [floor.id]: emptyBlob() },
      activeFloorId: floor.id,
    }
    if (deps.flowStep.value !== 'project') {
      deps.resetToEmptyFloor()
      deps.flowStep.value = 'input'
    }
    syncActiveFloorDefaultsToUi()
    persistCtrl.persistNow()
    return floor
  }

  function removeFloor(floorId: string): void {
    if (state.value.floors.length <= 1) {
      deps.setLocalError(tGlobal('project.errors.keepOneFloor'))
      return
    }
    const nextFloors = state.value.floors.filter((f) => f.id !== floorId)
    const { [floorId]: _removed, ...restBlobs } = state.value.blobs
    const nextActive =
      state.value.activeFloorId === floorId
        ? (nextFloors[0]?.id ?? state.value.activeFloorId)
        : state.value.activeFloorId
    state.value = {
      ...state.value,
      floors: nextFloors,
      blobs: restBlobs,
      activeFloorId: nextActive,
    }
    if (nextActive !== floorId && deps.flowStep.value !== 'project') {
      void hydrateFloor(nextActive).then(() => persistCtrl.persistNow())
    } else {
      persistCtrl.persistNow()
    }
  }

  function renameFloor(floorId: string, name: string): void {
    // Geen trim tijdens typen — anders verdwijnt spatie in "1e verdieping".
    // Lege naam (alleen whitespace) negeren.
    if (!name.trim()) return
    state.value = {
      ...state.value,
      floors: state.value.floors.map((f) => (f.id === floorId ? { ...f, name } : f)),
    }
    persistProjectDebounced()
  }

  function reorderFloors(orderedIds: string[]): void {
    const byId = new Map(state.value.floors.map((f) => [f.id, f]))
    const next: FloorMeta[] = []
    for (const id of orderedIds) {
      const floor = byId.get(id)
      if (floor) next.push(floor)
    }
    for (const floor of state.value.floors) {
      if (!orderedIds.includes(floor.id)) next.push(floor)
    }
    state.value = {
      ...state.value,
      floors: next.map((f, index) => ({ ...f, level: index })),
    }
    persistProjectDebounced()
  }

  function setSourceUnderlay(underlay: ProjectSourceUnderlay | null): void {
    state.value = { ...state.value, sourceUnderlay: underlay }
    persistCtrl.persistNow()
  }

  function setPlanPlate(plate: {
    planUnderlay: PlanUnderlay
    sourceToWorking: SourceToWorkingTransform
    /** `undefined` = inputRotation op de bronscan niet aanraken. */
    inputRotation?: UnderlayInputRotation | null
  }): void {
    const id = state.value.activeFloorId
    const prev = state.value.blobs[id] ?? emptyBlob()
    const nextSource =
      plate.inputRotation !== undefined && prev.sourceUnderlay
        ? { ...prev.sourceUnderlay, inputRotation: plate.inputRotation }
        : prev.sourceUnderlay
    const nextProjectSource =
      plate.inputRotation !== undefined && state.value.sourceUnderlay
        ? { ...state.value.sourceUnderlay, inputRotation: plate.inputRotation }
        : state.value.sourceUnderlay
    state.value = {
      ...state.value,
      ...(plate.inputRotation !== undefined ? { sourceUnderlay: nextProjectSource } : {}),
      blobs: {
        ...state.value.blobs,
        [id]: {
          ...prev,
          planUnderlay: {
            ...plate.planUnderlay,
            ...(prev.planUnderlay?.src === plate.planUnderlay.src && prev.planUnderlay.remoteUrl
              ? { remoteUrl: prev.planUnderlay.remoteUrl }
              : {}),
          },
          sourceToWorking: { ...plate.sourceToWorking },
          sourceUnderlay: nextSource,
        },
      },
    }
    persistCtrl.persistNow()
  }

  function setPlanUnderlayRemoteUrl(floorId: string, remoteUrl: string): void {
    const prev = state.value.blobs[floorId] ?? emptyBlob()
    if (!prev.planUnderlay) return
    state.value = {
      ...state.value,
      blobs: {
        ...state.value.blobs,
        [floorId]: {
          ...prev,
          planUnderlay: { ...prev.planUnderlay, remoteUrl },
        },
      },
    }
  }

  /**
   * Schaal bevestigd op actieve floor → bronscan per floor (+ project-level legacy).
   * Altijd overschrijven: her-upload + opnieuw bevestigen moet de donor bijwerken.
   * Alleen aanroepen met de nog-niet-gecropte original (duurzame PNG).
   * PDF-bytes wissen we hier niet — alleen `setSourcePdfUnderlay(null)` bij een nieuwe raster-upload.
   */
  function ensureSourceUnderlay(
    underlay: ProjectSourceUnderlay,
    pdfSource?: PdfUnderlaySource | null,
  ): void {
    if (!isDurableUnderlaySrc(underlay.src)) return
    const id = state.value.activeFloorId
    const prev = state.value.blobs[id] ?? emptyBlob()
    const rawPdf = pdfSource ?? prev.sourcePdfUnderlay ?? state.value.sourcePdfUnderlay ?? null
    const keptPdf = rawPdf ? clonePdfUnderlaySource(rawPdf) : null
    const next: ProjectSourceUnderlay = {
      ...underlay,
      pdf: pdfSource
        ? pdfMetaFromSource(pdfSource)
        : (underlay.pdf ?? prev.sourceUnderlay?.pdf ?? null),
      inputRotation: keepSourceUnderlayRotation(
        underlay.inputRotation,
        prev.sourceUnderlay?.inputRotation,
      ),
      scaleSpace: underlay.scaleSpace ?? prev.sourceUnderlay?.scaleSpace,
    }
    state.value = {
      ...state.value,
      sourceUnderlay: next,
      sourcePdfUnderlay: keptPdf ?? state.value.sourcePdfUnderlay ?? null,
      blobs: {
        ...state.value.blobs,
        [id]: {
          ...prev,
          sourceUnderlay: next,
          sourcePdfUnderlay: keptPdf,
        },
      },
    }
    persistCtrl.persistNow()
    if (keptPdf) setProjectPdfStore(keptPdf)
  }

  /** Set/clear the shared in-memory PDF (upload). Raster upload must pass null. */
  function setSourcePdfUnderlay(source: PdfUnderlaySource | null): void {
    const id = state.value.activeFloorId
    const prev = state.value.blobs[id] ?? emptyBlob()
    const cloned = source ? clonePdfUnderlaySource(source) : null
    state.value = {
      ...state.value,
      sourcePdfUnderlay: cloned,
      blobs: {
        ...state.value.blobs,
        [id]: { ...prev, sourcePdfUnderlay: cloned },
      },
    }
    persistCtrl.persistNow()
    setProjectPdfStore(cloned)
  }

  /**
   * Expliciete knop stap 1: bronscan + schaal + rotatie van donor-floor (geen crop).
   * Bronplaat (3k) wint van PDF-her-raster — schaal staat in die pixels.
   * PDF-bytes blijven hangen voor een latere ROI-crop.
   * Neemt ook de muurdikte-catalogus over (cm + min/mid/max); géén LBE-rects
   * en géén gemeten dikte — refs tekent de tekenaar opnieuw op deze verdieping.
   */
  async function reuseUnderlayFromProject(donorFloorId?: string): Promise<void> {
    const donors = listUnderlayDonorFloors()
    const preferred =
      donorFloorId && donors.some((d) => d.id === donorFloorId)
        ? donorFloorId
        : (resolveDonorFloorId() ?? donors[0]?.id ?? null)
    const source = preferred ? getFloorSourceUnderlay(preferred) : null
    if (!source?.src) {
      deps.setLocalError(tGlobal('input.errors.noProjectSource'))
      return
    }
    if (source.src.startsWith('blob:')) {
      deps.setLocalError(tGlobal('input.errors.projectSourceExpired'))
      return
    }

    const donorBlob = preferred ? (state.value.blobs[preferred] ?? null) : null
    const donorPdf = donorBlob?.sourcePdfUnderlay ?? null
    const pdfSource = resolveReusePdfBytes({
      sessionPdf: getProjectPdfStore(),
      donorPdf,
      projectPdf: state.value.sourcePdfUnderlay ?? null,
    })
    const reuseOpts: ReuseUnderlayLoadOptions = {
      inputRotation: resolveReuseInputRotation({
        source,
        transform: donorBlob?.sourceToWorking ?? null,
        sessionPreprocess: donorBlob?.session?.preprocess ?? null,
      }),
      scaleSpace: source.scaleSpace ?? 'source',
    }

    try {
      if (pdfSource) setSourcePdfUnderlay(pdfSource)
      if (isDurableUnderlaySrc(source.src)) {
        await deps.loadUnderlayWithScale(
          source.src,
          source.name,
          source.scale,
          pdfSource,
          reuseOpts,
        )
      } else if (pdfSource && deps.loadUnderlayFromPdf) {
        await deps.loadUnderlayFromPdf(pdfSource, source.name, source.scale, reuseOpts)
      } else {
        await deps.loadUnderlayWithScale(
          source.src,
          source.name,
          source.scale,
          pdfSource,
          reuseOpts,
        )
      }
      // Catalogus ná succesvolle load: zelfde donor als de scan, zonder refs/meting.
      if (preferred) {
        updateActiveFloorDefaults(
          thicknessCatalogPatchFromFloorDefaults(effectiveDefaultsForFloor(preferred)),
        )
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      deps.setLocalError(tGlobal('input.errors.reuseFailed', { message }))
    }
  }

  /**
   * Expliciete knop stap 2: alleen B/W-tune (+ drawing profile).
   * Geen LBE-rects, geen gemeten muurdikte — na per-floor crop kloppen die niet.
   */
  function copyPreprocessAndRefsFromDonor(donorFloorId?: string): void {
    const donors = listPreprocessDonorFloors()
    const preferred =
      donorFloorId && donors.some((d) => d.id === donorFloorId)
        ? donorFloorId
        : (resolveDonorFloorId() ?? donors[0]?.id ?? null)
    const session = preferred ? state.value.blobs[preferred]?.session : null
    if (!session) {
      deps.setLocalError(tGlobal('preprocess.errors.noDonorPreprocess'))
      return
    }
    deps.applyPreprocessTune({
      preprocess: session.preprocess,
      drawingProfileId: session.drawingProfileId,
    })
  }

  /** Bij verlaten stap 0 → standaard F0; bij resume `keepActiveFloor` behouden. */
  async function enterActiveFloorFromProject(options?: {
    keepActiveFloor?: boolean
  }): Promise<void> {
    if (!options?.keepActiveFloor) {
      const firstId = state.value.floors[0]?.id
      if (firstId && firstId !== state.value.activeFloorId) {
        state.value = { ...state.value, activeFloorId: firstId }
        syncActiveFloorDefaultsToUi()
      }
    }
    await hydrateFloor(state.value.activeFloorId)
  }

  /** Bij terug naar stap 0: capture huidige floor (flowStep zet de caller). */
  function leaveFloorToProject(): void {
    captureActiveFloorIntoBlob()
    persistCtrl.persistNow()
  }

  function applyPersistedState(next: ProjectState): void {
    state.value = next
    setProjectPdfStore(next.sourcePdfUnderlay ?? null)
    syncActiveFloorDefaultsToUi()
  }

  function resetProject(): void {
    const previousId = state.value.meta.id
    persistCtrl.dispose()
    state.value = createEmptyProjectState()
    setProjectPdfStore(null)
    deps.resetToEmptyFloor()
    deps.flowStep.value = 'project'
    syncActiveFloorDefaultsToUi()
    void deleteProject(previousId).catch((error) => {
      console.warn('[project-store] delete on reset failed', error)
    })
  }

  function buildMergedProjectPlan(): ReturnType<typeof mergeFloorPlans> | null {
    captureActiveFloorIntoBlob()
    const floors: Floor[] = []
    for (const meta of state.value.floors) {
      const blob = state.value.blobs[meta.id]
      const generated = blob?.previewPlan?.floors[0] ?? blob?.generatedFloor ?? null
      if (!generated) continue
      const defaults = effectiveDefaultsForFloor(meta.id)
      const stamped = {
        ...generated,
        name: meta.name,
        level: meta.level,
        height: defaults.wallHeightCm,
        defaults: floorDefaultsFromTemplate(defaults),
      }
      floors.push(blob ? attachWorkspaceUnderlayToFloor(stamped, blob) : stamped)
    }
    if (floors.length === 0) return null
    return mergeFloorPlans(state.value.meta.name, floors)
  }

  /** Unie van catalogi van floors mét plattegrond — editor is project-breed. */
  function mergedThicknessCatalog(): number[] {
    const catalogs: number[][] = []
    for (const meta of state.value.floors) {
      const blob = state.value.blobs[meta.id]
      if (!blob?.previewPlan?.floors[0] && !blob?.generatedFloor) continue
      catalogs.push(
        thicknessCatalogPatchFromFloorDefaults(effectiveDefaultsForFloor(meta.id)).thicknessCms,
      )
    }
    return unionThicknessCatalogs(catalogs)
  }

  /**
   * Verticale X-flip van alle floors met FML om hun nulpunt — zonder floor-switch.
   * @returns aantal gespiegelde floors (0 = niets gedaan).
   */
  function applyProjectMirrorVertical(): number {
    captureActiveFloorIntoBlob()
    const activeId = state.value.activeFloorId
    const nextBlobs: Record<string, FloorWorkspaceBlob> = { ...state.value.blobs }
    let count = 0
    let activeMirrored: FloorWorkspaceBlob | null = null
    for (const meta of state.value.floors) {
      const prev = nextBlobs[meta.id] ?? emptyBlob()
      const { blob, mirrored } = mirrorFloorBlobVertical(prev)
      if (!mirrored) continue
      nextBlobs[meta.id] = blob
      count += 1
      if (meta.id === activeId) activeMirrored = blob
    }
    if (count === 0) return 0
    state.value = { ...state.value, blobs: nextBlobs }
    if (activeMirrored) {
      deps.setPlanOrient(activeMirrored.planOrient ?? null)
      const livePlan =
        activeMirrored.previewPlan ??
        (activeMirrored.generatedFloor
          ? {
              name: state.value.meta.name,
              floors: [activeMirrored.generatedFloor],
            }
          : null)
      if (livePlan) {
        deps.updatePreviewPlan(livePlan, activeMirrored.previewUnderlayLayout)
      }
    }
    persistCtrl.persistNow()
    return count
  }

  function planFromActiveBlob(): FloorPlan | null {
    const blob = state.value.blobs[state.value.activeFloorId]
    if (!blob) return null
    if (blob.previewPlan?.floors[0]) return blob.previewPlan
    if (blob.generatedFloor) {
      return { name: state.value.meta.name, floors: [blob.generatedFloor] }
    }
    return null
  }

  /** Live of blob-plattegrond van de actieve floor — 3→4 na resume alleen als stap 3 leeg is. */
  function hasActiveFloorPlan(): boolean {
    if (deps.getPreviewPlan()?.floors[0]) return true
    return planFromActiveBlob() != null
  }

  /** Zet blob-FML live als de preview weg is (hydrate op stap 3). */
  function restoreActiveFloorPreviewIfNeeded(): void {
    if (deps.getPreviewPlan()?.floors[0]) return
    const blob = state.value.blobs[state.value.activeFloorId]
    const plan = planFromActiveBlob()
    if (!blob || !plan) return
    deps.updatePreviewPlan(plan, blob.previewUnderlayLayout ?? null)
    deps.setPlanNulpuntImageCm(blob.planNulpuntImageCm ?? null)
    deps.setPlanOrient(blob.planOrient ?? null)
  }

  /** True als ≥1 floor een plattegrond heeft (`previewPlan` / generatedFloor — geen download). */
  function hasAnyFloorPlan(): boolean {
    for (const meta of state.value.floors) {
      const blob = state.value.blobs[meta.id]
      if (blob?.previewPlan?.floors[0] || blob?.generatedFloor) return true
    }
    return false
  }

  /** True als alle floors mét plattegrond flipX aan hebben (toggle-styling). */
  function projectOrientFlipXActive(): boolean {
    let seen = 0
    for (const meta of state.value.floors) {
      const blob = state.value.blobs[meta.id]
      if (!blob?.previewPlan?.floors[0] && !blob?.generatedFloor) continue
      seen += 1
      if (blob.planOrient?.flipX !== true) return false
    }
    return seen > 0
  }

  function storeGeneratedFloorForActive(floor: Floor | null): void {
    const id = state.value.activeFloorId
    const prev = state.value.blobs[id] ?? emptyBlob()
    const livePlan = deps.getPreviewPlan()
    const liveLayout = deps.getPreviewUnderlayLayout()
    const liveNulpunt = deps.getPlanNulpuntImageCm()
    const liveOrient = deps.getPlanOrient()
    const previewPlan = livePlan
      ? clonePlain({
          ...livePlan,
          floors: livePlan.floors[0] ? [livePlan.floors[0]] : [],
        })
      : prev.previewPlan
    state.value = {
      ...state.value,
      blobs: {
        ...state.value.blobs,
        [id]: {
          ...prev,
          generatedFloor: floor ? clonePlain(floor) : null,
          previewPlan,
          previewUnderlayLayout: liveLayout ? clonePlain(liveLayout) : prev.previewUnderlayLayout,
          planNulpuntImageCm: liveNulpunt ? clonePlain(liveNulpunt) : null,
          planOrient: liveOrient ? clonePlain(liveOrient) : null,
        },
      },
      floors: state.value.floors.map((f) =>
        f.id === id && floor ? { ...f, status: 'result' } : f,
      ),
    }
    persistCtrl.persistNow()
  }

  /** Floors (niet actief) met FML-muren voor muurstempel. */
  function listStampDonorFloors(): Array<{
    id: string
    name: string
    wallCount: number
    stampWallCount: number
  }> {
    const activeId = state.value.activeFloorId
    const out: Array<{
      id: string
      name: string
      wallCount: number
      stampWallCount: number
    }> = []
    for (const meta of state.value.floors) {
      if (meta.id === activeId) continue
      const blob = state.value.blobs[meta.id]
      const plan = blob?.previewPlan ?? null
      const floor = plan?.floors[0] ?? blob?.generatedFloor
      const wallCount = floor?.walls?.length ?? 0
      if (wallCount <= 0) continue
      const stampWallCount = plan != null ? wallsInStampGroup(plan, 0).length : 0
      out.push({ id: meta.id, name: meta.name, wallCount, stampWallCount })
    }
    return out
  }

  function getStampDonorWalls(donorFloorId: string): {
    walls: Floor['walls']
    stampWalls: Floor['walls']
    originCm: { x: number; y: number }
    plan: import('@/core/plan/types').FloorPlan | null
  } | null {
    const blob = state.value.blobs[donorFloorId]
    const plan = blob?.previewPlan ?? null
    const floor = plan?.floors[0] ?? blob?.generatedFloor
    if (!floor?.walls?.length) return null
    const stampWalls = plan != null ? wallsInStampGroup(plan, 0) : []
    return { walls: floor.walls, stampWalls, originCm: { x: 0, y: 0 }, plan }
  }

  return {
    projectState: state,
    projectMeta,
    projectFloors,
    activeFloorId,
    activeFloor,
    sourceUnderlay,
    activeFloorDefaults,
    canProceedFromProject,
    canReuseUnderlay,
    canCopyPreprocessRefs,
    switchingFloor,
    updateProjectMeta,
    updateActiveFloorDefaults,
    updateAllFloorDefaults,
    resetActiveFloorDefaults,
    effectiveDefaultsForFloor,
    syncActiveFloorDefaultsToUi,
    switchFloor,
    addFloor,
    removeFloor,
    renameFloor,
    reorderFloors,
    setSourceUnderlay,
    ensureSourceUnderlay,
    setPlanPlate,
    setPlanUnderlayRemoteUrl,
    setSourcePdfUnderlay,
    reuseUnderlayFromProject,
    copyPreprocessAndRefsFromDonor,
    listUnderlayDonorFloors,
    listPreprocessDonorFloors,
    listStampDonorFloors,
    getStampDonorWalls,
    enterActiveFloorFromProject,
    leaveFloorToProject,
    captureActiveFloorIntoBlob,
    writePreviewPlanToFloorBlob,
    persistProject,
    applyPersistedState,
    resetProject,
    buildMergedProjectPlan,
    mergedThicknessCatalog,
    applyProjectMirrorVertical,
    hasAnyFloorPlan,
    hasActiveFloorPlan,
    restoreActiveFloorPreviewIfNeeded,
    projectOrientFlipXActive,
    storeGeneratedFloorForActive,
    resolveDonorFloorId,
  }
}
