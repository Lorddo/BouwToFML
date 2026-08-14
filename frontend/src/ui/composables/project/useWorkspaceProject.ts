import { computed, nextTick, ref, type Ref } from 'vue'
import type { Floor, FloorPlan } from '@/core/fml/types'
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
import { clearDevSessionsStore } from '@/platform/dev-workspace/idb'
import type { WorkspaceFlowStep } from '@/ui/composables/workspace/constants'
import type { RestoreSessionOptions } from '@/ui/composables/workspace/workspace-dev-session-restore-flow'
import { tGlobal } from '@/ui/i18n'
import {
  createDefaultFloorFmlDefaults,
  createDefaultFloorMeta,
  createEmptyProjectState,
  createFloorId,
  floorNameIndexedNl,
} from './defaults'
import { projectStepCanProceed } from '@/ui/composables/workspace/constants'
import { mergeFloorPlans } from './merge-floor-plans'
import type { PdfUnderlaySource } from '@/platform/upload'
import type {
  FloorMeta,
  FloorWorkspaceBlob,
  PreviewUnderlayLayout,
  ProjectFmlDefaults,
  ProjectMeta,
  ProjectSourceUnderlay,
  ProjectState,
} from './types'
import { floorStatusFromFlowStep } from './types'

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
  /** Gebruikers-nulpunt in scant-cm, of null. */
  getFmlNulpuntImageCm: () => { x: number; y: number } | null
  /** Zet nulpunt bij floor-hydrate (na restore). */
  setFmlNulpuntImageCm: (point: { x: number; y: number } | null) => void
  /**
   * Wis live FML-preview ná capture, vóór activeFloorId-wissel —
   * anders remount de canvas met de vorige verdieping als plan.
   */
  clearLiveFmlPreview: () => void
  /** Sync FML UI-defaults vanuit effectieve floor defaults. */
  applyFmlDefaultsToUi?: (defaults: ProjectFmlDefaults) => void
  /** Skip IndexedDB-write tijdens running / restoring. */
  shouldSkipPersist?: () => boolean
  /** Runtime PDF source for ROI re-render (memory-only across floor switch). */
  getPdfUnderlaySource?: () => PdfUnderlaySource | null
  setPdfUnderlaySource?: (source: PdfUnderlaySource | null) => void
}

function emptyBlob(): FloorWorkspaceBlob {
  return {
    session: null,
    generatedFloor: null,
    previewPlan: null,
    previewUnderlayLayout: null,
    fmlNulpuntImageCm: null,
    sourceUnderlay: null,
    pdfUnderlaySource: null,
  }
}

function isDurableUnderlaySrc(src: string | null | undefined): boolean {
  return !!src && !src.startsWith('blob:')
}

/** Fallback als oude blob nog geen layout had — origin 0; px/mm uit schaal-snapshot. */
function layoutFromSessionScale(
  scale: DevWorkspaceSession['scale'] | null | undefined,
): PreviewUnderlayLayout | null {
  if (!scale?.confirmed) return null
  const pxPerMmX =
    'confirmedPixelsPerMillimeterX' in scale &&
    typeof scale.confirmedPixelsPerMillimeterX === 'number'
      ? scale.confirmedPixelsPerMillimeterX
      : 0
  const pxPerMmY =
    'confirmedPixelsPerMillimeterY' in scale &&
    typeof scale.confirmedPixelsPerMillimeterY === 'number'
      ? scale.confirmedPixelsPerMillimeterY
      : pxPerMmX
  if (!(pxPerMmX > 0) || !(pxPerMmY > 0)) return null
  return { origin: { x: 0, y: 0 }, pxPerMmX, pxPerMmY }
}

function isQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { name?: string; code?: number; message?: string }
  if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true
  if (e.code === 22 || e.code === 1014) return true
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : ''
  return msg.includes('quota') || (msg.includes('storage') && msg.includes('full'))
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
        if (!isQuotaExceeded(error) && attempt.label === 'default') {
          // Non-quota: still try cleanup once (DataClone / transient), then fail.
          continue
        }
        if (!isQuotaExceeded(error) && attempt.label !== 'default') {
          break
        }
      }
    }

    if (isQuotaExceeded(lastError)) {
      deps.setLocalError(tGlobal('project.errors.persistQuota'))
      console.warn('[project-store] quota exceeded after cleanup', lastError)
      return
    }
    deps.setLocalError(tGlobal('project.errors.persistFailed'))
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

  function updateActiveFloorDefaults(
    patch: Partial<ProjectFmlDefaults>,
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
        f.id === id ? { ...f, defaults: createDefaultFloorFmlDefaults() } : f,
      ),
    }
    syncActiveFloorDefaultsToUi()
    persistProjectDebounced()
  }

  function effectiveDefaultsForFloor(floorId: string): ProjectFmlDefaults {
    const floor = state.value.floors.find((f) => f.id === floorId)
    // Merge met factory: oude persisted floors missen nieuwe keys (bv. windowBovenlichtDefault).
    return floor
      ? { ...createDefaultFloorFmlDefaults(), ...floor.defaults }
      : createDefaultFloorFmlDefaults()
  }

  function syncActiveFloorDefaultsToUi(): void {
    deps.applyFmlDefaultsToUi?.(effectiveDefaultsForFloor(state.value.activeFloorId))
  }

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
      // Geen image → behoud vorige session of null.
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
    const liveNulpunt = deps.getFmlNulpuntImageCm()
    const fmlNulpuntImageCm = liveNulpunt ? clonePlain(liveNulpunt) : null
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
          fmlNulpuntImageCm,
          // Schaal-bevestiging schrijft bronscan op de blob; niet wissen bij floor-switch.
          sourceUnderlay: prev.sourceUnderlay ?? null,
          // Memory-only; not persisted to IndexedDB.
          pdfUnderlaySource: deps.getPdfUnderlaySource?.() ?? prev.pdfUnderlaySource ?? null,
        },
      },
    }
  }

  async function hydrateFloor(floorId: string): Promise<void> {
    const blob = state.value.blobs[floorId] ?? emptyBlob()
    syncActiveFloorDefaultsToUi()
    if (!blob.session) {
      deps.setPdfUnderlaySource?.(null)
      deps.resetToEmptyFloor()
      deps.flowStep.value = 'input'
      return
    }
    const targetStep =
      blob.session.schemaVersion === 2 ? blob.session.flow.targetFlowStep : 'templates'
    const isResult = targetStep === 'result'
    // Altijd volledige session-restore (refs/dikte/detectie/B/W).
    // Oude «fast result»-pad wiste LBE-refs via clearWorkspaceForSession — breekt
    // stap-terug preserve na floor-switch/resume.
    await deps.restoreSession(blob.session, {
      skipOpeningsRerun: isResult,
      applyPreviewPlan: isResult ? (blob.previewPlan ?? null) : null,
      applyPreviewUnderlayLayout: isResult
        ? (blob.previewUnderlayLayout ?? layoutFromSessionScale(blob.session.scale))
        : null,
      applyFmlNulpuntImageCm: isResult ? (blob.fmlNulpuntImageCm ?? null) : null,
    })
    if (!isResult) {
      deps.setFmlNulpuntImageCm(null)
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
        deps.clearLiveFmlPreview()
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

  /**
   * Schaal bevestigd op actieve floor → bronscan per floor (+ project-level legacy).
   * Altijd overschrijven: her-upload + opnieuw bevestigen moet de donor bijwerken.
   * Alleen aanroepen met de nog-niet-gecropte original (duurzame PNG).
   */
  function ensureSourceUnderlay(underlay: ProjectSourceUnderlay): void {
    if (!isDurableUnderlaySrc(underlay.src)) return
    const id = state.value.activeFloorId
    const prev = state.value.blobs[id] ?? emptyBlob()
    const next = { ...underlay }
    state.value = {
      ...state.value,
      sourceUnderlay: next,
      blobs: {
        ...state.value.blobs,
        [id]: { ...prev, sourceUnderlay: next },
      },
    }
    persistCtrl.persistNow()
  }

  /** Expliciete knop stap 1: bronscan + schaal van donor-floor (geen crop). */
  async function reuseUnderlayFromProject(donorFloorId?: string): Promise<void> {
    const donors = listUnderlayDonorFloors()
    const preferred =
      donorFloorId && donors.some((d) => d.id === donorFloorId)
        ? donorFloorId
        : (resolveDonorFloorId() ?? donors[0]?.id ?? null)
    const source = preferred ? getFloorSourceUnderlay(preferred) : null
    if (source?.src) {
      if (source.src.startsWith('blob:')) {
        deps.setLocalError(tGlobal('input.errors.projectSourceExpired'))
        return
      }
      try {
        await deps.loadUnderlayWithScale(source.src, source.name, source.scale)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        deps.setLocalError(tGlobal('input.errors.reuseFailed', { message }))
      }
      return
    }
    deps.setLocalError(tGlobal('input.errors.noProjectSource'))
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
    syncActiveFloorDefaultsToUi()
  }

  function resetProject(): void {
    const previousId = state.value.meta.id
    persistCtrl.dispose()
    state.value = createEmptyProjectState()
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
      floors.push({
        ...generated,
        name: meta.name,
        level: meta.level,
        height: defaults.wallHeightCm,
      })
    }
    if (floors.length === 0) return null
    return mergeFloorPlans(state.value.meta.name, floors)
  }

  function storeGeneratedFloorForActive(floor: Floor | null): void {
    const id = state.value.activeFloorId
    const prev = state.value.blobs[id] ?? emptyBlob()
    const livePlan = deps.getPreviewPlan()
    const liveLayout = deps.getPreviewUnderlayLayout()
    const liveNulpunt = deps.getFmlNulpuntImageCm()
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
          fmlNulpuntImageCm: liveNulpunt ? clonePlain(liveNulpunt) : null,
        },
      },
      floors: state.value.floors.map((f) =>
        f.id === id && floor ? { ...f, status: 'result' } : f,
      ),
    }
    persistCtrl.persistNow()
  }

  /** Floors (niet actief) met FML-muren voor muurstempel. */
  function listStampDonorFloors(): Array<{ id: string; name: string; wallCount: number }> {
    const activeId = state.value.activeFloorId
    const out: Array<{ id: string; name: string; wallCount: number }> = []
    for (const meta of state.value.floors) {
      if (meta.id === activeId) continue
      const blob = state.value.blobs[meta.id]
      const floor = blob?.previewPlan?.floors[0] ?? blob?.generatedFloor
      const wallCount = floor?.walls?.length ?? 0
      if (wallCount <= 0) continue
      out.push({ id: meta.id, name: meta.name, wallCount })
    }
    return out
  }

  function getStampDonorWalls(
    donorFloorId: string,
  ): { walls: Floor['walls']; originCm: { x: number; y: number } } | null {
    const blob = state.value.blobs[donorFloorId]
    const floor = blob?.previewPlan?.floors[0] ?? blob?.generatedFloor
    if (!floor?.walls?.length) return null
    return { walls: floor.walls, originCm: { x: 0, y: 0 } }
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
    reuseUnderlayFromProject,
    copyPreprocessAndRefsFromDonor,
    listUnderlayDonorFloors,
    listPreprocessDonorFloors,
    listStampDonorFloors,
    getStampDonorWalls,
    enterActiveFloorFromProject,
    leaveFloorToProject,
    captureActiveFloorIntoBlob,
    persistProject,
    applyPersistedState,
    resetProject,
    buildMergedProjectPlan,
    storeGeneratedFloorForActive,
    resolveDonorFloorId,
  }
}
