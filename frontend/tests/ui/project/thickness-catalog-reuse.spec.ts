import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  createDefaultFloorDefaults,
  thicknessCatalogPatchFromFloorDefaults,
} from '@/ui/composables/project/defaults'
import { useWorkspaceProject } from '@/ui/composables/project/useWorkspaceProject'
import type { WorkspaceFlowStep } from '@/ui/composables/workspace/constants'
import { DEFAULT_PREPROCESS } from '@/platform/image'
import type { DrawingProfileId } from '@/platform/profile'
import type { SelectionRect } from '@/platform/selection'
import type { DevWorkspaceSession } from '@/platform/dev-workspace'
import { FACTORY_THICKNESS_CMS, limitsFromCatalog } from '@/core/plan/wall-thickness-catalog'

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

const DONOR_CMS = [7, 15, 30, 45] as const

describe('thicknessCatalogPatchFromFloorDefaults', () => {
  it('normaliseert catalogus en schrijft min/mid/max door', () => {
    const patch = thicknessCatalogPatchFromFloorDefaults({
      thicknessCms: [...DONOR_CMS],
      thicknessMinCm: 1,
      thicknessMidCm: 2,
      thicknessMaxCm: 3,
    })
    const limits = limitsFromCatalog([...DONOR_CMS])
    expect(patch.thicknessCms).toEqual([...DONOR_CMS])
    expect(patch.thicknessMinCm).toBe(limits.minCm)
    expect(patch.thicknessMidCm).toBe(limits.midCm)
    expect(patch.thicknessMaxCm).toBe(limits.maxCm)
  })

  it('valt terug op legacy min/mid/max zonder thicknessCms', () => {
    const patch = thicknessCatalogPatchFromFloorDefaults({
      thicknessCms: [],
      thicknessMinCm: 12,
      thicknessMidCm: 18,
      thicknessMaxCm: 24,
    })
    expect(patch.thicknessCms).toEqual([12, 18, 24])
    expect(patch.thicknessMinCm).toBe(12)
    expect(patch.thicknessMaxCm).toBe(24)
  })
})

function createHarness() {
  const flowStep = ref<WorkspaceFlowStep>('input')
  const imageSrc = ref<string | null>(null)
  const imageName = ref<string | null>(null)
  const preprocess = ref({ ...DEFAULT_PREPROCESS })
  const drawingProfileId = ref<DrawingProfileId>('open')
  const rects = ref<SelectionRect[]>([])
  const applyPlanDefaultsToUi = vi.fn()
  const applyPreprocessTune = vi.fn()
  const loadUnderlayWithScale = vi.fn<
    (
      src: string,
      name: string,
      scale?: DevWorkspaceSession['scale'],
      pdfSource?: unknown,
    ) => Promise<void>
  >(async () => undefined)

  const project = useWorkspaceProject({
    flowStep,
    imageSrc,
    imageName,
    preprocess,
    drawingProfileId,
    rects,
    captureCurrentSession: () => {
      throw new Error('no session')
    },
    restoreSession: vi.fn(async () => undefined),
    resetToEmptyFloor: vi.fn(),
    loadUnderlayWithScale,
    applyPreprocessTune,
    applyPlanDefaultsToUi,
    setLocalError: vi.fn(),
    getPreviewPlan: () => null,
    getPreviewUnderlayLayout: () => null,
    updatePreviewPlan: vi.fn(),
    getPlanNulpuntImageCm: () => null,
    setPlanNulpuntImageCm: vi.fn(),
    getPlanOrient: () => null,
    setPlanOrient: vi.fn(),
    clearLivePlanCanvas: vi.fn(),
  })

  return { project, rects, applyPlanDefaultsToUi, applyPreprocessTune, loadUnderlayWithScale }
}

describe('reuseUnderlayFromProject thickness catalog', () => {

  it('neemt donor-catalogus over zonder LBE-rects of B/W-tune', async () => {
    const { project, rects, applyPlanDefaultsToUi, applyPreprocessTune, loadUnderlayWithScale } =
      createHarness()
    const donorId = project.activeFloorId.value
    const donorLimits = limitsFromCatalog([...DONOR_CMS])

    project.updateActiveFloorDefaults({
      thicknessCms: [...DONOR_CMS],
      thicknessMinCm: donorLimits.minCm,
      thicknessMidCm: donorLimits.midCm,
      thicknessMaxCm: donorLimits.maxCm,
    })
    project.ensureSourceUnderlay({
      src: PNG_SRC,
      name: 'bg.png',
      scale: { distanceMmX: 1000, distanceMmY: 1000, confirmed: true },
    })

    const next = project.addFloor({ name: '1e' })
    expect(project.activeFloorId.value).toBe(next.id)

    // Doel bewust op fabriek zetten (addFloor kopieert al donor-defaults).
    const factory = createDefaultFloorDefaults()
    project.updateActiveFloorDefaults({
      thicknessCms: [...FACTORY_THICKNESS_CMS],
      thicknessMinCm: factory.thicknessMinCm,
      thicknessMidCm: factory.thicknessMidCm,
      thicknessMaxCm: factory.thicknessMaxCm,
    })
    applyPlanDefaultsToUi.mockClear()
    rects.value = [
      {
        id: 'donor-wall-ref',
        type: 'wall',
        x: 10,
        y: 10,
        width: 40,
        height: 8,
        wallThicknessCm: 15,
      },
    ]

    await project.reuseUnderlayFromProject(donorId)

    expect(loadUnderlayWithScale).toHaveBeenCalledTimes(1)
    expect(applyPreprocessTune).not.toHaveBeenCalled()
    // Project-laag raakt rects niet; loadUnderlayWithScale wist ze in de echte workspace.
    expect(rects.value).toHaveLength(1)

    const defaults = project.activeFloorDefaults.value
    expect(defaults.thicknessCms).toEqual([...DONOR_CMS])
    expect(defaults.thicknessMinCm).toBe(donorLimits.minCm)
    expect(defaults.thicknessMidCm).toBe(donorLimits.midCm)
    expect(defaults.thicknessMaxCm).toBe(donorLimits.maxCm)
    expect(applyPlanDefaultsToUi).toHaveBeenCalled()
    const synced = applyPlanDefaultsToUi.mock.calls.at(-1)?.[0]
    expect(synced?.thicknessCms).toEqual([...DONOR_CMS])
  })
})

describe('buildMergedProjectPlan converter → editor', () => {
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  function floorWithWall(name = 'Begane grond') {
    return {
      name,
      level: 0,
      height: 260,
      walls: [
        { id: 'w0', a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, thickness: 20, openings: [] },
      ],
    }
  }

  it('hangt de detectie-scan als drawing en levert de floor-catalogus', () => {
    const { project } = createHarness()
    const id = project.activeFloorId.value
    const donorLimits = limitsFromCatalog([...DONOR_CMS])
    project.updateActiveFloorDefaults({
      thicknessCms: [...DONOR_CMS],
      thicknessMinCm: donorLimits.minCm,
      thicknessMidCm: donorLimits.midCm,
      thicknessMaxCm: donorLimits.maxCm,
    })
    const generated = floorWithWall()
    const prev = project.projectState.value
    project.projectState.value = {
      ...prev,
      blobs: {
        ...prev.blobs,
        [id]: {
          session: {
            schemaVersion: 2,
            createdAt: '2026-09-14T00:00:00.000Z',
            imageName: 'bg.png',
            imageWidth: 2000,
            imageHeight: 1000,
            workingImagePng: PNG,
            preprocess: { ...DEFAULT_PREPROCESS },
            drawingProfileId: 'open',
            scale: {
              distanceMmX: 3000,
              distanceMmY: 3000,
              confirmed: true,
              confirmedPixelsPerMillimeterX: 2,
              confirmedPixelsPerMillimeterY: 2,
            },
            eraserTouched: false,
            flow: {
              targetFlowStep: 'result',
              profileConfirmed: true,
              restoreMode: 'exact',
            },
          },
          generatedFloor: generated,
          previewPlan: { name: 'p', floors: [generated] },
          previewUnderlayLayout: { origin: { x: 10, y: 20 }, pxPerMmX: 2, pxPerMmY: 2 },
          planNulpuntImageCm: null,
          planOrient: null,
          sourceUnderlay: null,
          pdfUnderlaySource: null,
          sourcePdfUnderlay: null,
        },
      },
    }

    const plan = project.buildMergedProjectPlan()
    expect(plan?.floors[0]?.drawing?.url).toBe(PNG)
    expect(plan?.floors[0]?.drawing?.width).toBeCloseTo(100)
    expect(project.mergedThicknessCatalog()).toEqual([...DONOR_CMS])
  })
})
