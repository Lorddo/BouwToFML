import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import type { ExtractionOutput } from '@/core/extraction'
import type { FloorPlan } from '@/core/fml/types'
import { useWorkspaceFml } from '@/ui/composables/useWorkspaceFml'

const minimalOutput: ExtractionOutput = {
  candidates: [],
  segments: [{ type: 'wall', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, templateIndex: 0 }],
  meta: { extractorId: 'test', elapsedMs: 0, templateKernels: [10] },
}

function createFmlHarness(confirmOverwrite: (message: string) => boolean = () => true) {
  const imageName = ref('test-plan.png')
  const combinedOutput = ref<ExtractionOutput | null>(minimalOutput)
  const scale = {
    confirmed: ref(true),
    pixelsPerMillimeterX: ref(1),
    pixelsPerMillimeterY: ref(1),
  }
  let lastError: string | null = null
  const api = useWorkspaceFml({
    imageName,
    combinedOutput,
    scale: scale as never,
    underlaySrc: ref<string | null>(null),
    underlaySize: ref<{ width: number; height: number } | null>(null),
    underlayOpacity: ref(0),
    getBaseWallBw: () => null,
    setLocalError: (message) => {
      lastError = message
    },
    confirmOverwrite,
  })
  return { api, imageName, combinedOutput, scale, getLastError: () => lastError }
}

describe('useWorkspaceFml — export volgt canvas-bewerkingen', () => {
  it('download-FML-text bevat gewijzigde muurdikte na updatePreviewPlan', () => {
    const { api } = createFmlHarness()
    const base = api.previewPlan.value
    expect(base).not.toBeNull()

    const edited: FloorPlan = JSON.parse(JSON.stringify(base)) as FloorPlan
    edited.floors[0].walls[0].thickness = 42
    edited.floors[0].walls[0].b.x = 250

    api.updatePreviewPlan(edited)

    const exported = JSON.parse(api.buildGeneratedFmlText())
    const wall = exported.floors[0].designs[0].walls[0]
    expect(wall.thickness).toBe(42)
    expect(wall.b.x).toBe(250)
  })

  it('buildGeneratedFmlText volgt verplaatste muur, niet alleen ruwe detectie', () => {
    const { api } = createFmlHarness()
    const before = JSON.parse(api.buildGeneratedFmlText())
    const originalB = before.floors[0].designs[0].walls[0].b.x

    const edited: FloorPlan = JSON.parse(JSON.stringify(api.previewPlan.value)) as FloorPlan
    edited.floors[0].walls[0].b.x = originalB + 77
    api.updatePreviewPlan(edited)

    const after = JSON.parse(api.buildGeneratedFmlText())
    expect(after.floors[0].designs[0].walls[0].b.x).toBe(originalB + 77)
  })

  it('fmlLimitsDirty alleen na dikte-edit, niet na hoogte / bovenlicht', async () => {
    const { api } = createFmlHarness(() => true)
    expect(api.fmlLimitsDirty.value).toBe(false)

    await api.setFmlWallHeightCm(api.fmlWallHeightCm.value + 10)
    expect(api.fmlLimitsDirty.value).toBe(false)
    expect(api.previewPlan.value?.floors[0]?.height).toBe(api.fmlWallHeightCm.value)

    await api.setFmlBovenlichtDefault(true)
    expect(api.fmlLimitsDirty.value).toBe(false)

    api.setFmlThicknessCms([...api.fmlThicknessCms.value.slice(0, -1), api.fmlThicknessMaxCm.value + 5])
    expect(api.fmlLimitsDirty.value).toBe(true)

    api.syncAppliedFromDraft()
    expect(api.fmlLimitsDirty.value).toBe(false)
  })

  it('hoogtewijziging na canvas-edit blijft op editedPreviewPlan (geen regeneratie)', async () => {
    const { api } = createFmlHarness(() => true)

    const edited: FloorPlan = JSON.parse(JSON.stringify(api.previewPlan.value)) as FloorPlan
    edited.floors[0].walls[0].b.x = 333
    api.updatePreviewPlan(edited)

    await api.setFmlWallHeightCm(310)
    expect(api.fmlWallHeightCm.value).toBe(310)
    expect(api.previewPlan.value?.floors[0]?.walls[0]?.b.x).toBe(333)
    expect(api.previewPlan.value?.floors[0]?.height).toBe(310)
  })

  it('hoogte-confirm annuleren past niets toe', async () => {
    const { api } = createFmlHarness(() => false)
    const before = api.fmlWallHeightCm.value
    const floorBefore = api.previewPlan.value?.floors[0]?.height

    await api.setFmlWallHeightCm(before + 25)
    expect(api.fmlWallHeightCm.value).toBe(before)
    expect(api.previewPlan.value?.floors[0]?.height).toBe(floorBefore)
  })
})
