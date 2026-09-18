import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useWorkspaceProject } from '@/ui/composables/project/useWorkspaceProject'
import type { WorkspaceFlowStep } from '@/ui/composables/workspace/constants'
import { DEFAULT_PREPROCESS } from '@/platform/image'
import type { DrawingProfileId } from '@/platform/profile'
import type { SelectionRect } from '@/platform/selection'
import type { DevWorkspaceSession } from '@/platform/dev-workspace'
import type { DevWorkspaceSessionV2 } from '@/platform/dev-workspace/types'
import { createEmptyProjectState } from '@/ui/composables/project/defaults'
import type { ProjectState } from '@/ui/composables/project/types'
import type { RestoreSessionOptions } from '@/ui/composables/workspace/workspace-dev-session-restore-flow'

vi.mock('@/platform/project-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/project-store')>()
  return {
    ...actual,
    createProjectPersistController: () => ({
      persistNow: vi.fn(),
      persistDebounced: vi.fn(),
      dispose: vi.fn(),
    }),
    saveProject: vi.fn(async () => undefined),
    deleteOtherProjects: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
  }
})

const PNG_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function sessionAt(step: DevWorkspaceSessionV2['flow']['targetFlowStep']): DevWorkspaceSessionV2 {
  return {
    schemaVersion: 2,
    createdAt: '2026-09-17T00:00:00.000Z',
    imageName: 'floor.png',
    imageWidth: 100,
    imageHeight: 100,
    workingImagePng: PNG_SRC,
    preprocess: { ...DEFAULT_PREPROCESS },
    drawingProfileId: 'open',
    scale: {
      distanceMmX: 1000,
      distanceMmY: 1000,
      confirmed: true,
    },
    eraserTouched: false,
    flow: {
      targetFlowStep: step,
      restoreMode: 'exact',
      profileConfirmed: true,
    },
  }
}

function previewPlan() {
  return {
    name: 'Test',
    floors: [{ name: 'BG', level: 0, height: 260, walls: [] }],
  }
}

function createHarness(opts?: { captureThrows?: boolean }) {
  const flowStep = ref<WorkspaceFlowStep>('project')
  const imageSrc = ref<string | null>(PNG_SRC)
  const imageName = ref<string | null>('floor.png')
  const preprocess = ref({ ...DEFAULT_PREPROCESS })
  const drawingProfileId = ref<DrawingProfileId>('open')
  const rects = ref<SelectionRect[]>([])
  const restoreSession = vi.fn<(session: DevWorkspaceSession, options?: RestoreSessionOptions) => Promise<void>>(
    async () => undefined,
  )
  const setPlanNulpuntImageCm = vi.fn()
  const setPlanOrient = vi.fn()

  const project = useWorkspaceProject({
    flowStep,
    imageSrc,
    imageName,
    preprocess,
    drawingProfileId,
    rects,
    captureCurrentSession: () => {
      if (opts?.captureThrows) throw new Error('stamp capture too heavy')
      throw new Error('no session')
    },
    restoreSession,
    resetToEmptyFloor: vi.fn(),
    loadUnderlayWithScale: vi.fn(async () => undefined),
    applyPreprocessTune: vi.fn(),
    setLocalError: vi.fn(),
    getPreviewPlan: () => previewPlan(),
    getPreviewUnderlayLayout: () => null,
    updatePreviewPlan: vi.fn(),
    getPlanNulpuntImageCm: () => null,
    setPlanNulpuntImageCm,
    getPlanOrient: () => null,
    setPlanOrient,
    clearLivePlanCanvas: vi.fn(),
  })

  return { project, flowStep, restoreSession, setPlanNulpuntImageCm }
}

function staleResultState(): ProjectState {
  const empty = createEmptyProjectState({ id: 'proj-resume', name: 'Test', address: 'Straat 1' })
  const floorId = empty.floors[0].id
  return {
    ...empty,
    floors: empty.floors.map((f) => (f.id === floorId ? { ...f, status: 'result' } : f)),
    blobs: {
      [floorId]: {
        session: sessionAt('preprocess'),
        generatedFloor: previewPlan().floors[0],
        previewPlan: previewPlan(),
        previewUnderlayLayout: null,
        planNulpuntImageCm: null,
        planOrient: null,
        sourceUnderlay: null,
        planUnderlay: null,
        sourceToWorking: null,
        pdfUnderlaySource: null,
        sourcePdfUnderlay: null,
      },
    },
  }
}

describe('resume na stale preprocess-session', () => {
  it('hydrate naar result als floor-status result is en session nog op stap 2 staat', async () => {
    const { project, restoreSession } = createHarness()
    const state = staleResultState()
    project.applyPersistedState(state)

    await project.enterActiveFloorFromProject({ keepActiveFloor: true })

    expect(restoreSession).toHaveBeenCalledTimes(1)
    const [session, options] = restoreSession.mock.calls[0]
    expect(session.schemaVersion).toBe(2)
    if (session.schemaVersion === 2) {
      expect(session.flow.targetFlowStep).toBe('result')
    }
    expect(options?.applyPreviewPlan).toBeTruthy()
  })

  it('tilt targetFlowStep mee als capture faalt op stap 4', () => {
    const { project, flowStep } = createHarness({ captureThrows: true })
    const state = staleResultState()
    project.applyPersistedState(state)
    flowStep.value = 'result'

    project.captureActiveFloorIntoBlob()

    const floorId = state.activeFloorId
    const session = project.projectState.value.blobs[floorId]?.session
    expect(session?.schemaVersion).toBe(2)
    if (session?.schemaVersion === 2) {
      expect(session.flow.targetFlowStep).toBe('result')
    }
    expect(project.projectState.value.floors[0]?.status).toBe('result')
  })
})
