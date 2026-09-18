import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import type { FloorPlan } from '@/core/plan/types'
import type { PreviewUnderlayLayout } from '@/ui/composables/project/types'

const { renderPdfPageToPngDataUrlForFile, closePdfSession } = vi.hoisted(() => ({
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

vi.mock('@/platform/upload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/upload')>()
  return {
    ...actual,
    renderPdfPageToPngDataUrlForFile,
    closePdfSession,
  }
})

import { useEditorUnderlay } from '@/ui/composables/editor/useEditorUnderlay'

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

function setup(planValue: FloorPlan | null = emptyPlan()) {
  const plan = ref<FloorPlan | null>(planValue)
  const activeFloorIndex = ref(0)
  const gevelsMode = ref(false)
  const elevationGroupId = ref('')
  const elevationUnderlaySrc = ref<string | null>(null)
  const elevationUnderlayWidthPx = ref(0)
  const elevationUnderlayHeightPx = ref(0)
  const elevationUnderlayLayout = ref<PreviewUnderlayLayout | null>(null)
  const underlay = useEditorUnderlay({
    plan,
    activeFloorIndex,
    activeFloor: computed(() => plan.value?.floors[activeFloorIndex.value] ?? null),
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
  return {
    plan,
    gevelsMode,
    elevationGroupId,
    elevationUnderlaySrc,
    ...underlay,
  }
}

describe('editor PDF-onderlegger', () => {
  beforeEach(() => {
    renderPdfPageToPngDataUrlForFile.mockReset()
    closePdfSession.mockReset()
    renderPdfPageToPngDataUrlForFile.mockResolvedValue({
      dataUrl: 'data:image/png;base64,AAA',
      pageRenderScale: 2,
      pageWidthPx: 3000,
      pageHeightPx: 2000,
    })
    closePdfSession.mockResolvedValue(undefined)
  })

  it('opent de paginadialoog voor een PDF en past nog niets toe', async () => {
    const { plan, showPdfPageDialog, pendingPdfFile, onUnderlayFileInput } = setup()
    const file = new File([new Uint8Array([1, 2, 3])], 'scan.pdf', { type: 'application/pdf' })

    await onUnderlayFileInput(fileEvent(file))

    expect(showPdfPageDialog.value).toBe(true)
    expect(pendingPdfFile.value).toBe(file)
    expect(plan.value?.floors[0]?.drawing).toBeUndefined()
    expect(renderPdfPageToPngDataUrlForFile).not.toHaveBeenCalled()
  })

  it('rastert de gekozen pagina naar PNG en bewaart geen PDF-bytes', async () => {
    const { plan, showPdfPageDialog, onUnderlayFileInput, confirmPdfPage, underlaySrc } = setup()
    const file = new File([new Uint8Array([1, 2, 3])], 'scan.pdf', { type: 'application/pdf' })

    await onUnderlayFileInput(fileEvent(file))
    await confirmPdfPage(2)

    expect(renderPdfPageToPngDataUrlForFile).toHaveBeenCalledWith(file, 2)
    expect(closePdfSession).toHaveBeenCalled()
    expect(showPdfPageDialog.value).toBe(false)
    expect(plan.value?.floors[0]?.drawing?.url).toBe('data:image/png;base64,AAA')
    expect(underlaySrc.value).toBe('data:image/png;base64,AAA')
    expect(plan.value?.floors[0]?.drawing?.extras).toBeUndefined()
  })

  it('annuleren sluit de dialoog zonder tekening', async () => {
    const { plan, showPdfPageDialog, onUnderlayFileInput, cancelPdfPage } = setup()
    const file = new File([new Uint8Array([1, 2, 3])], 'scan.pdf', { type: 'application/pdf' })

    await onUnderlayFileInput(fileEvent(file))
    cancelPdfPage()

    expect(showPdfPageDialog.value).toBe(false)
    expect(plan.value?.floors[0]?.drawing).toBeUndefined()
    expect(renderPdfPageToPngDataUrlForFile).not.toHaveBeenCalled()
  })

  it('houdt de dialoog open als rasteren faalt', async () => {
    renderPdfPageToPngDataUrlForFile.mockRejectedValueOnce(new Error('boom'))
    const { plan, showPdfPageDialog, pdfPageConfirmError, onUnderlayFileInput, confirmPdfPage } =
      setup()
    const file = new File([new Uint8Array([1, 2, 3])], 'scan.pdf', { type: 'application/pdf' })

    await onUnderlayFileInput(fileEvent(file))
    await confirmPdfPage(1)

    expect(showPdfPageDialog.value).toBe(true)
    expect(pdfPageConfirmError.value).toBeTruthy()
    expect(plan.value?.floors[0]?.drawing).toBeUndefined()
  })

  it('opent geen PDF-dialoog voor een JPG', async () => {
    const { showPdfPageDialog, onUnderlayFileInput } = setup()
    const file = new File([new Uint8Array([1, 2, 3])], 'scan.jpg', { type: 'image/jpeg' })

    await onUnderlayFileInput(fileEvent(file))

    expect(showPdfPageDialog.value).toBe(false)
    expect(renderPdfPageToPngDataUrlForFile).not.toHaveBeenCalled()
  })
})
