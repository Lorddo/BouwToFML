import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useWorkspaceProject } from '@/ui/composables/project/useWorkspaceProject'
import type { WorkspaceFlowStep } from '@/ui/composables/workspace/constants'
import { DEFAULT_PREPROCESS } from '@/platform/image'
import type { PdfUnderlaySource } from '@/platform/upload'
import type { DrawingProfileId } from '@/platform/profile'
import type { SelectionRect } from '@/platform/selection'
import {
  keepSourceUnderlayRotation,
  resolveReuseInputRotation,
  resolveReusePdfBytes,
  snapshotSourceUnderlayReuse,
  type ReuseUnderlayLoadOptions,
} from '@/ui/composables/project/reuse-underlay-pdf'
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
      reuseOpts?: ReuseUnderlayLoadOptions,
    ) => Promise<void>
  >(async () => undefined)
  const loadUnderlayFromPdf = vi.fn<
    (
      pdfSource: PdfUnderlaySource,
      name: string,
      scale?: DevWorkspaceSession['scale'],
      reuseOpts?: ReuseUnderlayLoadOptions,
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

  it('kiest opgeslagen rotatie vóór bake-transform en session-preprocess', () => {
    expect(
      resolveReuseInputRotation({
        source: { inputRotation: { rotationDeg: 2.5, rotate180: false } },
        transform: { rotationDeg: 12, rotate180: true },
        sessionPreprocess: { rotationDeg: 40, rotate180: false },
      }),
    ).toEqual({ rotationDeg: 2.5, rotate180: false })
    expect(
      resolveReuseInputRotation({
        transform: { rotationDeg: 12, rotate180: false },
        sessionPreprocess: { rotationDeg: 40, rotate180: false },
      }),
    ).toEqual({ rotationDeg: 12, rotate180: false })
    expect(
      resolveReuseInputRotation({
        sessionPreprocess: { rotationDeg: 0, rotate180: true, autoRotationDeg: 1 },
      }),
    ).toEqual({ rotationDeg: 0, rotate180: true, autoRotationDeg: 1 })
    expect(resolveReuseInputRotation({})).toBeNull()
  })

  it('zet scaleSpace=working als de rotatie al gebakken is', () => {
    expect(
      snapshotSourceUnderlayReuse({
        preprocess: { rotationDeg: 0, rotate180: false },
        sourceToWorking: { rotationDeg: 7, rotate180: false },
      }),
    ).toEqual({
      scaleSpace: 'working',
      inputRotation: { rotationDeg: 7, rotate180: false },
    })
    expect(
      snapshotSourceUnderlayReuse({
        preprocess: { rotationDeg: 4, rotate180: false },
        sourceToWorking: { rotationDeg: 0, rotate180: false },
      }),
    ).toEqual({
      scaleSpace: 'source',
      inputRotation: { rotationDeg: 4, rotate180: false },
    })
  })

  it('rechtzetten dan schalen: slider=0 houdt de gebakken hoek', () => {
    expect(
      snapshotSourceUnderlayReuse({
        preprocess: { rotationDeg: 0, rotate180: false },
        sourceToWorking: { rotationDeg: 5, rotate180: false },
        storedInputRotation: { rotationDeg: 5, rotate180: false },
      }),
    ).toEqual({
      scaleSpace: 'working',
      inputRotation: { rotationDeg: 5, rotate180: false },
    })
    expect(
      snapshotSourceUnderlayReuse({
        preprocess: { rotationDeg: 0, rotate180: false },
        sourceToWorking: { rotationDeg: 0, rotate180: false },
        storedInputRotation: { rotationDeg: 5, rotate180: false },
      }),
    ).toEqual({
      scaleSpace: 'working',
      inputRotation: { rotationDeg: 5, rotate180: false },
    })
  })

  it('schalen dan rechtzetten: live slider blijft source-ruimte', () => {
    expect(
      snapshotSourceUnderlayReuse({
        preprocess: { rotationDeg: 5, rotate180: false },
        sourceToWorking: { rotationDeg: 0, rotate180: false },
        storedInputRotation: null,
      }),
    ).toEqual({
      scaleSpace: 'source',
      inputRotation: { rotationDeg: 5, rotate180: false },
    })
  })

  it('schaal-schrijven veegt een bestaande hoek niet leeg', () => {
    expect(
      keepSourceUnderlayRotation(null, { rotationDeg: 5, rotate180: false }),
    ).toEqual({ rotationDeg: 5, rotate180: false })
    expect(
      keepSourceUnderlayRotation({ rotationDeg: 0, rotate180: false }, { rotationDeg: 5, rotate180: false }),
    ).toEqual({ rotationDeg: 5, rotate180: false })
    expect(
      keepSourceUnderlayRotation({ rotationDeg: 12, rotate180: true }, { rotationDeg: 5, rotate180: false }),
    ).toEqual({ rotationDeg: 12, rotate180: true })
    expect(keepSourceUnderlayRotation(null, null)).toBeNull()
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

  it('laadt de bronplaat + schaal (PDF-bytes alleen voor latere ROI)', async () => {
    const livePdf = { current: pdfSource('plan.pdf') as PdfUnderlaySource | null }
    const { project, loadUnderlayWithScale, loadUnderlayFromPdf } = createHarness(livePdf)
    const donorId = project.activeFloorId.value
    const scale = { distanceMmX: 1000, distanceMmY: 1000, confirmed: true }

    project.ensureSourceUnderlay(
      {
        src: PNG_SRC,
        name: 'plan.pdf',
        scale,
        inputRotation: { rotationDeg: 3.5, rotate180: false },
        scaleSpace: 'source',
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

    expect(loadUnderlayFromPdf).not.toHaveBeenCalled()
    expect(loadUnderlayWithScale).toHaveBeenCalledTimes(1)
    const [src, name, passedScale, pdf, opts] = loadUnderlayWithScale.mock.calls[0]
    expect(src).toBe(PNG_SRC)
    expect(name).toBe('plan.pdf')
    expect(passedScale).toEqual(scale)
    expect(pdf?.fileName).toBe('plan.pdf')
    expect(opts).toEqual({
      inputRotation: { rotationDeg: 3.5, rotate180: false },
      scaleSpace: 'source',
    })
  })

  it('herstel rotatie uit sourceToWorking als die niet op de bronscan staat', async () => {
    const livePdf = { current: pdfSource('plan.pdf') as PdfUnderlaySource | null }
    const { project, loadUnderlayWithScale } = createHarness(livePdf)
    const donorId = project.activeFloorId.value

    project.ensureSourceUnderlay(
      {
        src: PNG_SRC,
        name: 'plan.pdf',
        scale: { distanceMmX: 8500, distanceMmY: 8500, confirmed: true },
      },
      livePdf.current,
    )
    project.setPlanPlate({
      planUnderlay: { src: PNG_SRC, width: 3000, height: 2000 },
      sourceToWorking: {
        sourceWidthPx: 3000,
        sourceHeightPx: 2000,
        workingWidthPx: 2980,
        workingHeightPx: 2140,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        rotationDeg: 6,
        rotate180: false,
      },
    })

    project.addFloor({ name: '1e' })
    await project.reuseUnderlayFromProject(donorId)

    const opts = loadUnderlayWithScale.mock.calls[0][4]
    expect(opts?.inputRotation).toEqual({ rotationDeg: 6, rotate180: false })
    expect(opts?.scaleSpace).toBe('source')
  })

  it('gebruikt de sessie-store als Vue-state de PDF kwijt is', async () => {
    const livePdf = { current: null as PdfUnderlaySource | null }
    const { project, loadUnderlayWithScale, loadUnderlayFromPdf } = createHarness(livePdf)
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

    expect(loadUnderlayFromPdf).not.toHaveBeenCalled()
    expect(loadUnderlayWithScale.mock.calls[0][3]?.fileName).toBe('session.pdf')
  })

  it('gebruikt project-PDF als de donor-blob leeg is', async () => {
    const livePdf = { current: null as PdfUnderlaySource | null }
    const { project, loadUnderlayWithScale, loadUnderlayFromPdf } = createHarness(livePdf)
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

    expect(loadUnderlayFromPdf).not.toHaveBeenCalled()
    expect(loadUnderlayWithScale.mock.calls[0][3]?.fileName).toBe('shared.pdf')
  })

  it('wist rotatie niet bij een tweede schaal-bevestigen zonder hoek', () => {
    const livePdf = { current: null as PdfUnderlaySource | null }
    const { project } = createHarness(livePdf)
    const id = project.activeFloorId.value
    project.ensureSourceUnderlay(
      {
        src: PNG_SRC,
        name: 'scan.png',
        scale: { distanceMmX: 8500, distanceMmY: 8500, confirmed: true },
        inputRotation: { rotationDeg: 5, rotate180: false },
        scaleSpace: 'working',
      },
      null,
    )
    project.ensureSourceUnderlay(
      {
        src: PNG_SRC,
        name: 'scan.png',
        scale: { distanceMmX: 9000, distanceMmY: 9000, confirmed: true },
      },
      null,
    )
    const source = project.projectState.value.blobs[id]?.sourceUnderlay
    expect(source?.inputRotation).toEqual({ rotationDeg: 5, rotate180: false })
    expect(source?.scaleSpace).toBe('working')
    expect(source?.scale?.distanceMmX).toBe(9000)
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
