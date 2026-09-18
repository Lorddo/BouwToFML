import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { FloorPlan } from '@/core/plan/types'
import { useEditorDownload } from '@/ui/composables/editor/useEditorDownload'
import type { PlanExportFormat } from '@/ui/composables/plan-chrome-dialog'

const downloads: Array<{ filename: string; content: string }> = []
const exportChoice = vi.fn<(...args: unknown[]) => Promise<PlanExportFormat | null>>()

vi.mock('@/core/fml/downloadFml', () => ({
  downloadFml: (content: string, filename: string) => downloads.push({ content, filename }),
  downloadText: (content: string, filename: string) => downloads.push({ content, filename }),
}))

vi.mock('@/ui/composables/plan-chrome-dialog', () => ({
  promptPlanExportFormat: () => exportChoice(),
  alertPlanChrome: () => Promise.resolve(),
}))

function planWithWall(name = 'Woonhuis'): FloorPlan {
  return {
    name,
    floors: [
      {
        name: 'bg',
        level: 0,
        height: 260,
        walls: [
          { id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, thickness: 20, openings: [] },
        ],
      },
    ],
  }
}

function setup(options: { plan?: FloorPlan | null; fileName?: string | null } = {}) {
  const plan = ref<FloorPlan | null>(options.plan === undefined ? planWithWall() : options.plan)
  const calls: string[] = []
  const api = useEditorDownload({
    plan,
    fileName: ref(options.fileName ?? null),
    scaleInputUnit: ref('cm'),
    thicknessPresetCms: ref([10, 20, 30]),
    activeFloorIndex: ref(0),
    flushPendingFieldCommits: () => calls.push('flush'),
    persistActiveUnderlayDrawing: () => calls.push('persist'),
  })
  return { plan, calls, ...api }
}

describe('useEditorDownload', () => {
  beforeEach(() => {
    downloads.length = 0
    exportChoice.mockReset()
  })

  it('flusht velden en onderlegger vóór het serialiseren', async () => {
    const { calls, downloadCurrentFml } = setup()

    await downloadCurrentFml()

    expect(calls).toEqual(['flush', 'persist'])
    expect(downloads).toHaveLength(1)
  })

  it('doet niets zonder plan', async () => {
    const { downloadCurrentFml, downloadCurrentPlg } = setup({ plan: null })

    await downloadCurrentFml()
    await downloadCurrentPlg()

    expect(downloads).toEqual([])
  })

  it('bestandsnaam komt van het geopende bestand als dat er is', async () => {
    const { downloadCurrentFml } = setup({ fileName: 'Kinderdijkstraat.plg' })

    await downloadCurrentFml()

    expect(downloads[0]?.filename).toBe('Kinderdijkstraat.fml')
  })

  it('valt zonder bestandsnaam terug op de plannaam', async () => {
    const { downloadCurrentFml, downloadCurrentPlg } = setup()

    await downloadCurrentFml()
    await downloadCurrentPlg()

    expect(downloads[0]?.filename).toBe('Woonhuis.fml')
    expect(downloads[1]?.filename).toBe('Woonhuis.plg')
  })

  it('valt zonder naam terug op een vaste naam per formaat', async () => {
    const { downloadCurrentFml, downloadCurrentPlg } = setup({ plan: planWithWall('  ') })

    await downloadCurrentFml()
    await downloadCurrentPlg()

    expect(downloads[0]?.filename).toBe('fml-export.fml')
    expect(downloads[1]?.filename).toBe('plan-export.plg')
  })

  it('schrijft een `.plg`-document met de plattegrond erin', async () => {
    const { downloadCurrentPlg } = setup()

    await downloadCurrentPlg()

    const doc = JSON.parse(downloads[0]?.content ?? '{}')
    expect(doc.format).toBe('plg-plan')
    expect(doc.plan.floors[0].walls).toHaveLength(1)
    expect(doc.settings.scaleInputUnit).toBe('cm')
    expect(doc.settings.defaults.thicknessCms).toEqual([10, 20, 30])
  })

  it('buildCurrentFmlText geeft leeg terug zonder plan', () => {
    const { buildCurrentFmlText } = setup({ plan: null })

    expect(buildCurrentFmlText()).toBe('')
  })

  it('downloadCurrentExport volgt de popup-keuze', async () => {
    const { downloadCurrentExport } = setup()
    exportChoice.mockResolvedValueOnce('fml')
    await downloadCurrentExport()
    expect(downloads[0]?.filename).toBe('Woonhuis.fml')

    exportChoice.mockResolvedValueOnce('plg')
    await downloadCurrentExport()
    expect(downloads[1]?.filename).toBe('Woonhuis.plg')
  })

  it('downloadCurrentExport doet niets bij annuleren', async () => {
    const { downloadCurrentExport, calls } = setup()
    exportChoice.mockResolvedValueOnce(null)

    await downloadCurrentExport()

    expect(downloads).toEqual([])
    expect(calls).toEqual([])
  })

  it('downloadCurrentExport doet niets zonder plan', async () => {
    const { downloadCurrentExport } = setup({ plan: null })

    await downloadCurrentExport()

    expect(exportChoice).not.toHaveBeenCalled()
    expect(downloads).toEqual([])
  })

  it('PLG en FML krijgen dezelfde https-plaat; data-URL verdwijnt uit beide', async () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const https =
      'https://pub.example.com/v1/p/f/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'
    const source = planWithWall()
    source.floors[0]!.drawing = {
      x: 1,
      y: 2,
      width: 10,
      height: 8,
      rotation: 0,
      url: png,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ url: https }), { status: 200 })),
    )
    const { downloadCurrentFml, downloadCurrentPlg } = setup({ plan: source })

    await downloadCurrentFml()
    await downloadCurrentPlg()

    const fml = JSON.parse(downloads[0]?.content ?? '{}')
    const plg = JSON.parse(downloads[1]?.content ?? '{}')
    expect(fml.floors[0].drawing.url).toBe(https)
    expect(plg.plan.floors[0].drawing.url).toBe(https)
    vi.unstubAllGlobals()
  })

  it('download gaat door als de upload faalt; bestand zonder data-URL', async () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const source = planWithWall()
    source.floors[0]!.drawing = {
      x: 1,
      y: 2,
      width: 10,
      height: 8,
      rotation: 0,
      url: png,
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })))
    const { downloadCurrentFml, downloadCurrentPlg } = setup({ plan: source })

    await downloadCurrentFml()
    await downloadCurrentPlg()

    const fml = JSON.parse(downloads[0]?.content ?? '{}')
    const plg = JSON.parse(downloads[1]?.content ?? '{}')
    expect(fml.floors[0].drawing.url).toBeUndefined()
    expect(plg.plan.floors[0].drawing.url).toBeUndefined()
    vi.unstubAllGlobals()
  })
})
