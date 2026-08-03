import { computed, ref, type Ref } from 'vue'
import type { Floor, FloorPlan } from '@/core/fml/types'
import type { PreprocessConfig } from '@/platform/image'
import { clonePlain, type DevWorkspaceSession } from '@/platform/dev-workspace'
import type { DrawingProfileId } from '@/platform/profile'
import type { SelectionRect } from '@/platform/selection'
import type { WorkspaceFlowStep } from '@/ui/composables/workspace/constants'
import type { RestoreSessionOptions } from '@/ui/composables/workspace/workspace-dev-session-restore-flow'
import {
  createDefaultFloorFmlDefaults,
  createDefaultFloorMeta,
  createEmptyProjectState,
  createFloorId,
} from './defaults'
import { projectStepCanProceed } from '@/ui/composables/workspace/constants'
import { mergeFloorPlans } from './merge-floor-plans'
import type {
  FloorMeta,
  FloorWorkspaceBlob,
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
   * Snelle floor-switch naar stap 4: image + schaal + opgeslagen FML-preview.
   * Geen detectie/BW/openings-herpipeline.
   */
  restoreResultFloorFast: (params: {
    workingImagePng: string
    imageName: string
    scale: DevWorkspaceSession['scale']
    previewPlan: FloorPlan
  }) => Promise<void>
  /**
   * Pas B/W-tune + profile toe (geen LBE-rects — die kloppen niet na per-floor crop).
   * Optioneel gemeten muurdikte overnemen.
   */
  applyPreprocessTune: (params: {
    preprocess: PreprocessConfig
    drawingProfileId: DrawingProfileId
    referenceWallThicknessPx?: number | null
  }) => void
  setLocalError: (message: string | null) => void
  /** Huidige FML-preview (incl. edits), of null. */
  getPreviewPlan: () => FloorPlan | null
  /** Sync FML UI-defaults vanuit effectieve floor defaults. */
  applyFmlDefaultsToUi?: (defaults: ProjectFmlDefaults) => void
}

function emptyBlob(): FloorWorkspaceBlob {
  return { session: null, generatedFloor: null, previewPlan: null }
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

  const canReuseUnderlay = computed(() => {
    const src = state.value.sourceUnderlay?.src
    return !!src && !src.startsWith('blob:')
  })

  const canCopyPreprocessRefs = computed(() => {
    const donor = resolveDonorFloorId()
    if (!donor) return false
    const session = state.value.blobs[donor]?.session
    return !!session?.preprocess
  })

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

  function updateProjectMeta(patch: Partial<ProjectMeta>): void {
    state.value = {
      ...state.value,
      meta: { ...state.value.meta, ...patch },
    }
  }

  function updateActiveFloorDefaults(patch: Partial<ProjectFmlDefaults>): void {
    const id = state.value.activeFloorId
    state.value = {
      ...state.value,
      floors: state.value.floors.map((f) =>
        f.id === id ? { ...f, defaults: { ...f.defaults, ...patch } } : f,
      ),
    }
    syncActiveFloorDefaultsToUi()
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
  }

  function effectiveDefaultsForFloor(floorId: string): ProjectFmlDefaults {
    const floor = state.value.floors.find((f) => f.id === floorId)
    return floor ? { ...floor.defaults } : createDefaultFloorFmlDefaults()
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
    const previewPlan = livePlan ? clonePlain(livePlan) : (prev.previewPlan ?? null)
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
        },
      },
    }
  }

  async function hydrateFloor(floorId: string): Promise<void> {
    const blob = state.value.blobs[floorId] ?? emptyBlob()
    syncActiveFloorDefaultsToUi()
    if (!blob.session) {
      deps.resetToEmptyFloor()
      deps.flowStep.value = 'input'
      return
    }
    const targetStep =
      blob.session.schemaVersion === 2 ? blob.session.flow.targetFlowStep : 'templates'
    const isResult = targetStep === 'result'
    // Snelle pad: result + bewaard FML → geen detectie/BW rebuild.
    if (isResult && blob.previewPlan) {
      await deps.restoreResultFloorFast({
        workingImagePng: blob.session.workingImagePng,
        imageName: blob.session.imageName,
        scale: blob.session.scale,
        previewPlan: blob.previewPlan,
      })
      return
    }
    await deps.restoreSession(blob.session, {
      skipOpeningsRerun: isResult,
      applyPreviewPlan: isResult ? (blob.previewPlan ?? null) : null,
    })
  }

  async function switchFloor(floorId: string): Promise<void> {
    if (floorId === state.value.activeFloorId) return
    if (!state.value.floors.some((f) => f.id === floorId)) {
      deps.setLocalError('Verdieping niet gevonden.')
      return
    }
    switchingFloor.value = true
    deps.setLocalError(null)
    try {
      if (deps.flowStep.value !== 'project') {
        captureActiveFloorIntoBlob()
      }
      state.value = { ...state.value, activeFloorId: floorId }
      if (deps.flowStep.value === 'project') {
        // Stay on project; hydrate when leaving stap 0.
        return
      }
      await hydrateFloor(floorId)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      deps.setLocalError(message)
      throw e
    } finally {
      switchingFloor.value = false
    }
  }

  function addFloor(params?: { name?: string; level?: number }): FloorMeta {
    captureActiveFloorIntoBlob()
    const maxLevel = state.value.floors.reduce((m, f) => Math.max(m, f.level), -1)
    const donorDefaults = effectiveDefaultsForFloor(state.value.activeFloorId)
    const floor = createDefaultFloorMeta({
      id: createFloorId(),
      name: params?.name ?? `Verdieping ${state.value.floors.length}`,
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
    return floor
  }

  function removeFloor(floorId: string): void {
    if (state.value.floors.length <= 1) {
      deps.setLocalError('Er moet minstens één verdieping blijven.')
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
      void hydrateFloor(nextActive)
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
  }

  function setSourceUnderlay(underlay: ProjectSourceUnderlay | null): void {
    state.value = { ...state.value, sourceUnderlay: underlay }
  }

  /**
   * Eerste bevestigde schaal op de nog-niet-gecropte scan → projectbron.
   * Nooit overschrijven met post-crop working image.
   */
  function ensureSourceUnderlay(underlay: ProjectSourceUnderlay): void {
    if (state.value.sourceUnderlay?.src) return
    state.value = { ...state.value, sourceUnderlay: { ...underlay } }
  }

  /** Expliciete knop stap 1: bronscan + schaal (geen crop van een eerdere floor). */
  async function reuseUnderlayFromProject(): Promise<void> {
    const source = state.value.sourceUnderlay
    if (source?.src) {
      if (source.src.startsWith('blob:')) {
        deps.setLocalError(
          'Projectbron is verlopen (blob-URL). Bevestig opnieuw de schaal op de eerste verdieping, of upload de scan opnieuw.',
        )
        return
      }
      try {
        await deps.loadUnderlayWithScale(source.src, source.name, source.scale)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        deps.setLocalError(`Onderlegger overnemen mislukt: ${message}`)
      }
      return
    }
    deps.setLocalError(
      'Nog geen projectbron. Bevestig eerst de schaal op een verdieping (vóór crop) — dan kun je die hier overnemen.',
    )
  }

  /**
   * Expliciete knop stap 2: alleen B/W-tune (+ optioneel gemeten dikte).
   * Geen LBE-rects — na per-floor crop kloppen coordinaten niet.
   */
  function copyPreprocessAndRefsFromDonor(): void {
    const donorId = resolveDonorFloorId()
    const session = donorId ? state.value.blobs[donorId]?.session : null
    if (!session) {
      deps.setLocalError('Geen verdieping met voorbewerking om over te nemen.')
      return
    }
    deps.applyPreprocessTune({
      preprocess: session.preprocess,
      drawingProfileId: session.drawingProfileId,
      referenceWallThicknessPx: session.referenceWallThicknessPx ?? null,
    })
  }

  /** Bij verlaten stap 0 → altijd F0 (eerste in lijst), daarna hydrate. */
  async function enterActiveFloorFromProject(): Promise<void> {
    const firstId = state.value.floors[0]?.id
    if (firstId && firstId !== state.value.activeFloorId) {
      state.value = { ...state.value, activeFloorId: firstId }
      syncActiveFloorDefaultsToUi()
    }
    await hydrateFloor(state.value.activeFloorId)
  }

  /** Bij terug naar stap 0: capture huidige floor (flowStep zet de caller). */
  function leaveFloorToProject(): void {
    captureActiveFloorIntoBlob()
  }

  function resetProject(): void {
    state.value = createEmptyProjectState()
    deps.resetToEmptyFloor()
    deps.flowStep.value = 'project'
    syncActiveFloorDefaultsToUi()
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
    state.value = {
      ...state.value,
      blobs: {
        ...state.value.blobs,
        [id]: {
          ...prev,
          generatedFloor: floor,
          previewPlan: livePlan ? clonePlain(livePlan) : prev.previewPlan,
        },
      },
      floors: state.value.floors.map((f) =>
        f.id === id && floor ? { ...f, status: 'result' } : f,
      ),
    }
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
    enterActiveFloorFromProject,
    leaveFloorToProject,
    captureActiveFloorIntoBlob,
    resetProject,
    buildMergedProjectPlan,
    storeGeneratedFloorForActive,
    resolveDonorFloorId,
  }
}
