import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildFaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { runDoorStagePipeline, type DoorSwingRefBand } from '@/cv/doors'

vi.mock('@/cv/doors/door-swing-hinge', async () => {
  const actual = await vi.importActual<typeof import('@/cv/doors/door-swing-hinge')>(
    '@/cv/doors/door-swing-hinge',
  )
  return {
    ...actual,
    computeDoorHingeFromFaces: vi.fn(() => ({
      hingePx: { x: 10, y: 10 },
      axes: [
        { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, angleDeg: 0, supportLength: 10 },
        { a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, angleDeg: 16, supportLength: 10 },
      ],
      swingAngleDeg: 16,
      swingSpanPx: 50,
      sectorPolygon: [],
      supportScore: 1,
    })),
    computeDoorHingeFromMask: vi.fn(() => null),
  }
})

/** Driehoek ≈ fill 0.5 zodat absolute 0.80-cap en too_full-vs-ref passeren. */
function paintWedge(
  labels: Int32Array,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  label: number,
): void {
  for (let y = 0; y < h; y += 1) {
    const rowW = Math.max(1, Math.round(((y + 1) / h) * w))
    for (let x = 0; x < rowW; x += 1) {
      labels[(y0 + y) * width + (x0 + x)] = label
    }
  }
}

function paintRect(
  labels: Int32Array,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  label: number,
): void {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      labels[y * width + x] = label
    }
  }
}

describe('runDoorStagePipeline angle-rescue inject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('injecteert angle-rescue in stage2Accepted (bypass fill)', () => {
    // Halve swing: diepte OK (24), span te kort/aspect fout voor Stage-1 single vs ref 86×24.
    // Wall-strip links van wedge zodat wall-touch gate doorlaat.
    const width = 140
    const height = 80
    const raw = new Int32Array(width * height)
    const ink = new Int32Array(width * height)
    paintWedge(raw, width, 20, 20, 46, 24, 360)
    paintWedge(ink, width, 20, 20, 46, 24, 360)
    paintRect(raw, width, 16, 20, 4, 24, 1)
    paintRect(ink, width, 16, 20, 4, 24, 1)

    const dual = buildFaceDualSpace({
      rawLabelsData: raw,
      labelsData: ink,
      width,
      height,
      classificationByLabel: new Map([
        [360, 'surface'],
        [1, 'wall'],
      ]),
    })

    const refBands: DoorSwingRefBand[] = [
      {
        aspectRef: 86 / 24,
        swingWpx: 86,
        swingHpx: 24,
        areaPx: 1072,
        swingAngleDeg: 16,
        swingSpanPx: 86,
        wallRatio: 1,
        depthRatio: 24 / 86,
        areaSpan2Ratio: 1072 / (86 * 86),
      },
    ]

    const pipe = runDoorStagePipeline({
      dual,
      cv: {} as never,
      refBands,
      sizeBand: { wallMinPx: 35, wallMaxPx: 167 },
      pxPerMmX: 0.14,
      pxPerMmY: 0.14,
    })

    const rescued = pipe.stage2Accepted.filter((h) => h.source === 'angle_rescue')
    expect(pipe.angleRescueCount).toBeGreaterThanOrEqual(1)
    expect(rescued.some((h) => h.faceIds.includes(360))).toBe(true)
    expect(pipe.wallTouchRejectedCount).toBe(0)
  })

  it('wall-touch: angle-rescue zonder wall-buur komt niet in stage2Accepted', () => {
    const width = 140
    const height = 80
    const raw = new Int32Array(width * height)
    const ink = new Int32Array(width * height)
    paintWedge(raw, width, 20, 20, 46, 24, 360)
    paintWedge(ink, width, 20, 20, 46, 24, 360)
    // Muur ver weg — geen ink-adjacency met 360.
    paintRect(raw, width, 0, 0, width, 4, 1)
    paintRect(ink, width, 0, 0, width, 4, 1)

    const dual = buildFaceDualSpace({
      rawLabelsData: raw,
      labelsData: ink,
      width,
      height,
      classificationByLabel: new Map([
        [360, 'surface'],
        [1, 'wall'],
      ]),
    })

    const refBands: DoorSwingRefBand[] = [
      {
        aspectRef: 86 / 24,
        swingWpx: 86,
        swingHpx: 24,
        areaPx: 1072,
        swingAngleDeg: 16,
        swingSpanPx: 86,
        wallRatio: 1,
        depthRatio: 24 / 86,
        areaSpan2Ratio: 1072 / (86 * 86),
      },
    ]

    const pipe = runDoorStagePipeline({
      dual,
      cv: {} as never,
      refBands,
      sizeBand: { wallMinPx: 35, wallMaxPx: 167 },
      pxPerMmX: 0.14,
      pxPerMmY: 0.14,
    })

    expect(pipe.angleRescueCount).toBeGreaterThanOrEqual(1)
    expect(pipe.wallTouchRejectedCount).toBeGreaterThanOrEqual(1)
    expect(pipe.wallTouchRejected.some((r) => r.hypothesis.faceIds.includes(360))).toBe(true)
    expect(pipe.stage2Accepted.some((h) => h.faceIds.includes(360))).toBe(false)
  })

  it('existingDoorsOnly: angle-rescue alleen voor reeds class=door (geen unknown→deur)', () => {
    const width = 140
    const height = 80
    const raw = new Int32Array(width * height)
    const ink = new Int32Array(width * height)
    paintWedge(raw, width, 20, 20, 46, 24, 360)
    paintWedge(ink, width, 20, 20, 46, 24, 360)
    paintWedge(raw, width, 70, 20, 46, 24, 361)
    paintWedge(ink, width, 70, 20, 46, 24, 361)
    // Geen wall-adjacency nodig: existingDoorsOnly slaat wall-touch over.
    paintRect(raw, width, 0, 0, width, 4, 1)
    paintRect(ink, width, 0, 0, width, 4, 1)

    const dual = buildFaceDualSpace({
      rawLabelsData: raw,
      labelsData: ink,
      width,
      height,
      classificationByLabel: new Map([
        [360, 'door'],
        [361, 'surface'],
        [1, 'wall'],
      ]),
    })

    const refBands: DoorSwingRefBand[] = [
      {
        aspectRef: 86 / 24,
        swingWpx: 86,
        swingHpx: 24,
        areaPx: 1072,
        swingAngleDeg: 16,
        swingSpanPx: 86,
        wallRatio: 1,
        depthRatio: 24 / 86,
        areaSpan2Ratio: 1072 / (86 * 86),
      },
    ]

    const pipe = runDoorStagePipeline({
      dual,
      cv: {} as never,
      refBands,
      sizeBand: { wallMinPx: 35, wallMaxPx: 167 },
      pxPerMmX: 0.14,
      pxPerMmY: 0.14,
      existingDoorsOnly: true,
    })

    const rescued = pipe.stage2Accepted.filter((h) => h.source === 'angle_rescue')
    expect(pipe.wallTouchRejectedCount).toBe(0)
    expect(rescued.some((h) => h.faceIds.includes(360))).toBe(true)
    expect(rescued.some((h) => h.faceIds.includes(361))).toBe(false)
  })
})
