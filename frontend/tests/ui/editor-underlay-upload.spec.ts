import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import type { FloorPlan } from '@/core/plan/types'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'

const { uploadUnderlayDataUrl, ensurePlanUnderlaysUploaded, renderPdfPageToPngDataUrlForFile, closePdfSession } =
  vi.hoisted(() => ({
    uploadUnderlayDataUrl: vi.fn(),
    ensurePlanUnderlaysUploaded: vi.fn(async (plan: FloorPlan) => ({
      plan,
      urls: [] as Array<{ floorIndex: number; url: string }>,
    })),
    renderPdfPageToPngDataUrlForFile: vi.fn(),
    closePdfSession: vi.fn(),
  }))

vi.mock('@/platform/image', () => ({
  loadImage: vi.fn(async () => ({ width: 3000, height: 2000 })),
  imageDimensions: (img: { width: number; height: number }) => ({
    width: img.width,
    height: img.height,
  }),
}))

vi.mock('@/platform/underlay-upload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/underlay-upload')>()
  return { ...actual, uploadUnderlayDataUrl, ensurePlanUnderlaysUploaded }
})

vi.mock('@/platform/upload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/upload')>()
  return {
    ...actual,
    renderPdfPageToPngDataUrlForFile,
    closePdfSession,
  }
})

import { useEditorUnderlay } from '@/ui/composables/editor/useEditorUnderlay'
import { useEditorLoad } from '@/ui/composables/editor/useEditorLoad'

const HTTPS = 'https://pub.example/v1/editor/bg/aaa.png'
const DATA = 'data:image/png;base64,AAA'

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0) as unknown as number
}

function emptyPlan(): FloorPlan {
  return {
    name: 't',
    floors: [{ name: 'bg', level: 0, height: 260, walls: [] }],
  }
}

function fileEvent(file: File): Event {
  return {
    target: { files: [file], value: '' },
  } as unknown as Event
}

function setupUnderlay(planValue: FloorPlan | null = emptyPlan()) {
  const plan = ref<FloorPlan | null>(planValue)
  const gevelsMode = ref(false)
  const elevationGroupId = ref('')
  const elevationUnderlaySrc = ref<string | null>(null)
  const elevationUnderlayWidthPx = ref(0)
  const elevationUnderlayHeightPx = ref(0)
  const elevationUnderlayLayout = ref<PreviewUnderlayLayout | null>(null)
  const underlay = useEditorUnderlay({
    plan,
    activeFloorIndex: ref(0),
    activeFloor: computed(() => plan.value?.floors[0] ?? null),
    floors: computed(() => plan.value?.floors ?? []),
    inspectMode: ref(false),
    gevelsMode,
    elevationGroupId,
    elevationUnderlaySrc,
    elevationUnderlayWidthPx,
    elevationUnderlayHeightPx,
    elevationUnderlayLayout,
    activeUnderlayLayout: computed(() => elevationUnderlayLayout.value),
    activeUnderlayWidthPx: elevationUnderlayWidthPx,
    activeUnderlayHeightPx: elevationUnderlayHeightPx,
    syncElevationUnderlayFromPlan: async () => {},
    previewCanvasRef: ref(null),
    t: (key) => key,
  })
  return { plan, gevelsMode, elevationGroupId, ...underlay }
}

describe('editor onderlegger-upload → https', () => {
  beforeEach(() => {
    uploadUnderlayDataUrl.mockReset()
    uploadUnderlayDataUrl.mockResolvedValue(HTTPS)
  })

  it('zet drawing.url na upload op de R2-https', async () => {
    renderPdfPageToPngDataUrlForFile.mockResolvedValue({
      dataUrl: DATA,
      pageRenderScale: 2,
      pageWidthPx: 3000,
      pageHeightPx: 2000,
    })
    closePdfSession.mockResolvedValue(undefined)
    const { plan, onUnderlayFileInput, confirmPdfPage } = setupUnderlay()
    const file = new File([new Uint8Array([1, 2, 3])], 'scan.pdf', { type: 'application/pdf' })

    await onUnderlayFileInput(fileEvent(file))
    await confirmPdfPage(1)

    expect(uploadUnderlayDataUrl).toHaveBeenCalled()
    expect(plan.value?.floors[0]?.drawing?.url).toBe(HTTPS)
  })

  it('houdt de data-URL als R2 faalt', async () => {
    uploadUnderlayDataUrl.mockResolvedValueOnce(null)
    renderPdfPageToPngDataUrlForFile.mockResolvedValue({
      dataUrl: DATA,
      pageRenderScale: 2,
      pageWidthPx: 3000,
      pageHeightPx: 2000,
    })
    closePdfSession.mockResolvedValue(undefined)
    const { plan, onUnderlayFileInput, confirmPdfPage } = setupUnderlay()
    const file = new File([new Uint8Array([1, 2, 3])], 'scan.pdf', { type: 'application/pdf' })

    await onUnderlayFileInput(fileEvent(file))
    await confirmPdfPage(1)

    expect(plan.value?.floors[0]?.drawing?.url).toBe(DATA)
  })
})

describe('loadPlan extra R2-check', () => {
  it('schrijft de https-URL op het live plan', async () => {
    ensurePlanUnderlaysUploaded.mockImplementationOnce(async (plan: FloorPlan) => ({
      plan: {
        ...plan,
        floors: plan.floors.map((floor) =>
          floor.drawing ? { ...floor, drawing: { ...floor.drawing, url: HTTPS } } : floor,
        ),
      },
      urls: [{ floorIndex: 0, url: HTTPS }],
    }))
    const plan = ref<FloorPlan | null>(null)
    const api = useEditorLoad({
      plan,
      warnings: ref([]),
      error: ref(null),
      fileName: ref(null),
      activeFloorIndex: ref(0),
      orientByFloor: ref({}),
      pendingAlignRebase: ref(null),
      contentOpacity: ref(0.8),
      hidePlanText: ref(false),
      floors: ref([]),
      t: (key) => key,
      flushPreviewFieldCommits: vi.fn(),
      cancelPlanRescale: vi.fn(),
      cancelUnderlayScale: vi.fn(),
      persistActiveUnderlayDrawing: vi.fn(),
      clearUnderlayState: vi.fn(),
      syncUnderlayForActiveFloor: vi.fn(async () => undefined),
      resetInspectState: vi.fn(),
      applyThicknessCatalog: vi.fn(),
      clearUndoStacks: vi.fn(),
      pushUndo: vi.fn(),
    })

    await api.loadPlan(
      {
        name: 'converter',
        floors: [
          {
            name: 'bg',
            level: 0,
            height: 260,
            walls: [{ id: 'w0', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, thickness: 20, openings: [] }],
            drawing: {
              x: 0,
              y: 0,
              width: 100,
              height: 80,
              rotation: 0,
              url: DATA,
            },
          },
        ],
      },
      'project.plg',
    )

    expect(plan.value?.floors[0]?.drawing?.url).toBe(HTTPS)
  })
})
