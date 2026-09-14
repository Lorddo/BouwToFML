import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useWorkspaceProject } from '@/ui/composables/project/useWorkspaceProject'
import type { WorkspaceFlowStep } from '@/ui/composables/workspace/constants'
import { DEFAULT_PREPROCESS } from '@/platform/image'
import type { PdfUnderlaySource } from '@/platform/upload'
import type { DrawingProfileId } from '@/platform/profile'
import type { SelectionRect } from '@/platform/selection'
import { resolveReusePdfBytes } from '@/ui/composables/project/reuse-underlay-pdf'
import { getProjectPdfStore, setProjectPdfStore } from '@/platform/upload'
import type { DevWorkspaceSession } from '@/platform/dev-workspace'

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

function pdfSource(label: string): PdfUnderlaySource {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    pageNumber: 1,
    fileName: label,
    pageRenderScale: 2,
    pageWidthPx: 3000,
    pageHeightPx: 2000,
  }
}

function createHarness(livePdf: { current: PdfUnderlaySource | null }) {
  const flowStep = ref<WorkspaceFlowStep>('input')
  const imageSrc = ref<string | null>(null)
  const imageName = ref<string | null>(null)
  const preprocess = ref({ ...DEFAULT_PREPROCESS })
  const drawingProfileId = ref<DrawingProfileId>('open')
  const rects = ref<SelectionRect[]>([])
  const loadUnderlayWithScale = vi.fn<
    (
      src: string,
      name: string,
      scale?: DevWorkspaceSession['scale'],
      pdfSource?: PdfUnderlaySource | null,
    ) => Promise<void>
  >(async () => undefined)
  const loadUnderlayFromPdf = vi.fn<
    (
      pdfSource: PdfUnderlaySource,
      name: string,
      scale?: DevWorkspaceSession['scale'],
    ) => Promise<void>
  >(async () => undefined)
  const setLocalError = vi.fn()

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
    loadUnderlayFromPdf,
    applyPreprocessTune: vi.fn(),
    setLocalError,
    getPreviewPlan: () => null,
    getPreviewUnderlayLayout: () => null,
    updatePreviewPlan: vi.fn(),
    getPlanNulpuntImageCm: () => null,
    setPlanNulpuntImageCm: vi.fn(),
    getPlanOrient: () => null,
    setPlanOrient: vi.fn(),
    clearLivePlanCanvas: vi.fn(),
    getPdfUnderlaySource: () => livePdf.current,
    setPdfUnderlaySource: (source) => {
      livePdf.current = source
    },
  })

  return { project, loadUnderlayWithScale, loadUnderlayFromPdf, setLocalError }
}

describe('reuse-underlay-pdf helpers', () => {
  it('kiest sessie-bytes vóór donor- en project-bytes', () => {
    const donor = pdfSource('donor.pdf')
    const project = pdfSource('project.pdf')
    const session = pdfSource('session.pdf')
    expect(
      resolveReusePdfBytes({ sessionPdf: session, donorPdf: donor, projectPdf: project })?.fileName,
    ).toBe('session.pdf')
    expect(resolveReusePdfBytes({ donorPdf: donor, projectPdf: project })?.fileName).toBe(
      'donor.pdf',
    )
    expect(resolveReusePdfBytes({ donorPdf: null, projectPdf: project })?.fileName).toBe(
      'project.pdf',
    )
    expect(resolveReusePdfBytes({ donorPdf: null, projectPdf: null })).toBeNull()
  })

  it('negeert een bron waarvan pdf.js de buffer al leegde', () => {
    const empty = pdfSource('dead.pdf')
    empty.bytes = new Uint8Array()
    expect(
      resolveReusePdfBytes({ sessionPdf: empty, projectPdf: pdfSource('ok.pdf') })?.fileName,
    ).toBe('ok.pdf')
  })
})

describe('reuseUnderlayFromProject PDF source', () => {
  afterEach(() => {
    setProjectPdfStore(null)
  })

  it('rastert opnieuw uit de donor-PDF na crop (niet de PNG)', async () => {
    const livePdf = { current: pdfSource('plan.pdf') as PdfUnderlaySource | null }
    const { project, loadUnderlayWithScale, loadUnderlayFromPdf } = createHarness(livePdf)
    const donorId = project.activeFloorId.value

    project.ensureSourceUnderlay(
      {
        src: PNG_SRC,
        name: 'plan.pdf',
        scale: { distanceMmX: 1000, distanceMmY: 1000, confirmed: true },
      },
      livePdf.current,
    )

    livePdf.current = null
    project.captureActiveFloorIntoBlob()

    const donorBlob = project.projectState.value.blobs[donorId]
    expect(donorBlob?.sourcePdfUnderlay?.fileName).toBe('plan.pdf')
    expect(donorBlob?.pdfUnderlaySource).toBeNull()

    const next = project.addFloor({ name: '1e' })
    expect(project.activeFloorId.value).toBe(next.id)

    await project.reuseUnderlayFromProject(donorId)

    expect(loadUnderlayFromPdf).toHaveBeenCalledTimes(1)
    expect(loadUnderlayFromPdf.mock.calls[0][0]?.fileName).toBe('plan.pdf')
    expect(loadUnderlayWithScale).not.toHaveBeenCalled()
  })

  it('gebruikt de sessie-store als Vue-state de PDF kwijt is', async () => {
    const livePdf = { current: null as PdfUnderlaySource | null }
    const { project, loadUnderlayFromPdf } = createHarness(livePdf)
    const donorId = project.activeFloorId.value

    project.ensureSourceUnderlay(
      {
        src: PNG_SRC,
        name: 'plan.pdf',
        scale: { distanceMmX: 1000, distanceMmY: 1000, confirmed: true },
      },
      null,
    )
    setProjectPdfStore(pdfSource('session.pdf'))
    expect(getProjectPdfStore()?.fileName).toBe('session.pdf')

    project.addFloor({ name: '1e' })
    await project.reuseUnderlayFromProject(donorId)

    expect(loadUnderlayFromPdf.mock.calls[0][0]?.fileName).toBe('session.pdf')
  })

  it('gebruikt project-PDF als de donor-blob leeg is', async () => {
    const livePdf = { current: null as PdfUnderlaySource | null }
    const { project, loadUnderlayFromPdf } = createHarness(livePdf)
    const donorId = project.activeFloorId.value

    project.ensureSourceUnderlay(
      {
        src: PNG_SRC,
        name: 'plan.pdf',
        scale: { distanceMmX: 1000, distanceMmY: 1000, confirmed: true },
      },
      null,
    )
    project.setSourcePdfUnderlay(pdfSource('shared.pdf'))

    project.addFloor({ name: '1e' })
    await project.reuseUnderlayFromProject(donorId)

    expect(loadUnderlayFromPdf.mock.calls[0][0]?.fileName).toBe('shared.pdf')
  })

  it('wist de PDF niet bij schaal-bevestigen ná crop', () => {
    const livePdf = { current: pdfSource('plan.pdf') as PdfUnderlaySource | null }
    const { project } = createHarness(livePdf)
    const id = project.activeFloorId.value
    project.ensureSourceUnderlay(
      {
        src: PNG_SRC,
        name: 'plan.pdf',
        scale: { distanceMmX: 1000, distanceMmY: 1000, confirmed: true },
      },
      livePdf.current,
    )
    livePdf.current = null
    project.ensureSourceUnderlay(
      {
        src: PNG_SRC,
        name: 'plan.pdf',
        scale: { distanceMmX: 1000, distanceMmY: 1000, confirmed: true },
      },
      null,
    )
    expect(project.projectState.value.blobs[id]?.sourcePdfUnderlay?.fileName).toBe('plan.pdf')
  })

  it('zonder PDF-bytes valt terug op de PNG-bron', async () => {
    const livePdf = { current: null as PdfUnderlaySource | null }
    const { project, loadUnderlayWithScale, loadUnderlayFromPdf } = createHarness(livePdf)
    const donorId = project.activeFloorId.value

    project.ensureSourceUnderlay(
      {
        src: PNG_SRC,
        name: 'plan.pdf',
        scale: { distanceMmX: 1000, distanceMmY: 1000, confirmed: true },
        pdf: {
          pageNumber: 1,
          fileName: 'plan.pdf',
          pageRenderScale: 2,
          pageWidthPx: 3000,
          pageHeightPx: 2000,
        },
      },
      null,
    )
    project.addFloor({ name: '1e' })
    await project.reuseUnderlayFromProject(donorId)

    expect(loadUnderlayFromPdf).not.toHaveBeenCalled()
    expect(loadUnderlayWithScale).toHaveBeenCalledTimes(1)
  })

  it('PNG-donor blijft zonder PDF-bron', async () => {
    const livePdf = { current: null as PdfUnderlaySource | null }
    const { project, loadUnderlayWithScale, loadUnderlayFromPdf } = createHarness(livePdf)
    const donorId = project.activeFloorId.value

    project.ensureSourceUnderlay(
      {
        src: PNG_SRC,
        name: 'scan.png',
        scale: { distanceMmX: 1000, distanceMmY: 1000, confirmed: true },
      },
      null,
    )
    project.addFloor({ name: '1e' })
    await project.reuseUnderlayFromProject(donorId)

    expect(loadUnderlayFromPdf).not.toHaveBeenCalled()
    const [, , , pdf] = loadUnderlayWithScale.mock.calls[0]
    expect(pdf ?? null).toBeNull()
  })
})
