import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  analyzeDoorSwingRef,
  buildDoorSwingRefBandFromStraightened,
  resolveReferenceSizing,
} from '@/cv/doors'
import { runRefStages } from '@/cv/refs/ref-stages'
import { selectSwingSectorFace } from '@/cv/refs/ref-swing-arc'
import { computeDoorHingeFromMask } from '@/cv/doors/door-swing-hinge'
import type { RefFace } from '@/cv/refs/types'

vi.mock('@/cv/refs/ref-stages', () => ({
  runRefStages: vi.fn(),
}))
vi.mock('@/cv/refs/ref-swing-arc', () => ({
  selectSwingSectorFace: vi.fn(),
  rankSwingSectorFaces: vi.fn(),
}))
vi.mock('@/cv/doors/door-swing-hinge', () => ({
  computeDoorHingeFromMask: vi.fn(() => ({
    hingePx: { x: 10, y: 10 },
    axes: [
      { a: { x: 10, y: 10 }, b: { x: 40, y: 10 }, angleDeg: 0, supportLength: 30 },
      { a: { x: 10, y: 10 }, b: { x: 10, y: 40 }, angleDeg: 90, supportLength: 30 },
    ],
    swingAngleDeg: 90,
    swingSpanPx: 44,
    sectorPolygon: [],
    supportScore: 60,
  })),
}))

function makeBw(
  width: number,
  height: number,
  painter: (setBlack: (x: number, y: number) => void) => void,
): Uint8Array {
  const data = new Uint8Array(width * height).fill(255)
  const setBlack = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    data[y * width + x] = 0
  }
  painter(setBlack)
  return data
}

function mockStraightenedStages(data: Uint8Array, width: number, height: number): void {
  vi.mocked(runRefStages).mockResolvedValue({
    straightened: {
      bwData: data,
      width,
      height,
      originalCanvas: {} as never,
    },
  } as never)
}

const stubPreprocess = {} as never

describe('door-swing-ref', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('leidt aspectRef af en houdt ondiepe sector anders dan volle sector', async () => {
    const width = 90
    const height = 80
    const full = makeBw(width, height, () => {})
    mockStraightenedStages(full, width, height)
    vi.mocked(selectSwingSectorFace).mockReturnValueOnce({
      face: { label: 1, bbox: { width: 46, height: 45 }, areaPx: 1200 } as never,
      score: 10,
    })
    const fullBand = await analyzeDoorSwingRef({
      cv: {} as never,
      image: {} as never,
      rect: { x: 0, y: 0, width, height },
      preprocess: stubPreprocess,
    })

    const shallow = makeBw(width, height, () => {})
    mockStraightenedStages(shallow, width, height)
    vi.mocked(selectSwingSectorFace).mockReturnValueOnce({
      face: { label: 2, bbox: { width: 68, height: 34 }, areaPx: 950 } as never,
      score: 9,
    })
    const shallowBand = await analyzeDoorSwingRef({
      cv: {} as never,
      image: {} as never,
      rect: { x: 0, y: 0, width, height },
      preprocess: stubPreprocess,
    })

    expect(fullBand).not.toBeNull()
    expect(shallowBand).not.toBeNull()
    expect(shallowBand!.aspectRef).toBeGreaterThan(fullBand!.aspectRef)
    // Face-AABB max(w,h), niet hinge.swingSpanPx (mock=44).
    expect(fullBand!.swingSpanPx).toBe(46)
    expect(shallowBand!.swingSpanPx).toBe(68)
    expect(fullBand!.ratioBlade).toBeGreaterThan(0)
    expect(fullBand!.framingPx).toBeGreaterThanOrEqual(0)
    expect(fullBand!.wallRatio).toBeCloseTo(1, 6)
    expect(fullBand!.depthRatio).toBeCloseTo(45 / 46, 6)
    expect(fullBand!.areaSpan2Ratio).toBeCloseTo(1200 / (46 * 46), 6)
    expect(fullBand!.clearOverhangAlongRatio).toBeGreaterThan(0)
    expect(fullBand!.clearOverhangOppositeRatio).toBeGreaterThanOrEqual(0)
    expect(runRefStages).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'door',
        preprocess: stubPreprocess,
      }),
    )
    expect(computeDoorHingeFromMask).toHaveBeenCalled()
  })

  it('geeft null terug als er geen bruikbaar swing-vlak is', async () => {
    const width = 70
    const height = 50
    const noSwing = new Uint8Array(width * height).fill(255)
    mockStraightenedStages(noSwing, width, height)
    vi.mocked(selectSwingSectorFace).mockReturnValue(null)
    const band = await analyzeDoorSwingRef({
      cv: {} as never,
      image: {} as never,
      rect: { x: 0, y: 0, width, height },
      preprocess: stubPreprocess,
    })
    expect(band).toBeNull()
  })

  it('geeft null terug als hinge-resolve faalt', async () => {
    const width = 70
    const height = 50
    const noSwing = new Uint8Array(width * height).fill(255)
    mockStraightenedStages(noSwing, width, height)
    vi.mocked(selectSwingSectorFace).mockReturnValue({
      face: { label: 3, bbox: { width: 30, height: 22 }, areaPx: 250 } as never,
      score: 6,
    })
    vi.mocked(computeDoorHingeFromMask).mockReturnValueOnce(null)
    const band = await analyzeDoorSwingRef({
      cv: {} as never,
      image: {} as never,
      rect: { x: 0, y: 0, width, height },
      preprocess: stubPreprocess,
    })
    expect(band).toBeNull()
  })

  it('buildDoorSwingRefBandFromStraightened: pickt op aangeleverde rechte crop (geen her-orient)', () => {
    const width = 120
    const height = 40
    const data = makeBw(width, height, () => {})
    vi.mocked(selectSwingSectorFace).mockReturnValue({
      face: { label: 6, bbox: { width: 110, height: 21 }, areaPx: 1414 } as never,
      score: 12,
    })
    const band = buildDoorSwingRefBandFromStraightened({
      cv: {} as never,
      bwData: data,
      width,
      height,
    })
    expect(band).not.toBeNull()
    expect(band!.swingWpx).toBe(110)
    expect(band!.swingHpx).toBe(21)
    expect(band!.areaPx).toBe(1414)
    expect(band!.aspectRef).toBeCloseTo(110 / 21, 6)
    expect(runRefStages).not.toHaveBeenCalled()
  })

  it('meet asymmetrische overhangs t.o.v. boog-scharnier (ondiepe pivot niet op kozijn)', () => {
    const makeKozijn = (params: {
      label: number
      x: number
      width: number
    }): RefFace =>
      ({
        label: params.label,
        role: 'interior',
        areaPx: params.width * 15,
        bbox: { x: params.x, y: 4, width: params.width, height: 15 },
        centroid: { x: params.x + params.width / 2, y: 11.5 },
        relativeCentroid: { x: 0.5, y: 0.5 },
        touchesBorder: false,
      }) as RefFace

    const sizing = resolveReferenceSizing({
      faces: [makeKozijn({ label: 1, x: 4, width: 12 }), makeKozijn({ label: 2, x: 108, width: 13 })],
      axis: 'x',
      swingSpanPx: 80,
      fallbackTotalPx: 120,
      hingePx: { x: 87.7, y: 22 },
      freeDir: { x: -1, y: 0 },
    })
    // low=4, high=121, hinge≈87.7, free toward left
    expect(sizing.overhangAlongPx).toBeCloseTo(87.7 - 4, 0)
    expect(sizing.overhangOppositePx).toBeCloseTo(121 - 87.7, 0)
    expect(sizing.totalRefPx).toBeCloseTo(117, 0)
    expect(sizing.overhangAlongPx).not.toBeCloseTo(sizing.overhangOppositePx, 0)
  })

  it('valt terug op de swing-span als een kozijn gemist wordt (geen mini-deur)', () => {
    const makeKozijn = (params: {
      label: number
      x: number
      width: number
    }): RefFace =>
      ({
        label: params.label,
        role: 'interior',
        areaPx: params.width * 12,
        bbox: { x: params.x, y: 4, width: params.width, height: 12 },
        centroid: { x: params.x + params.width / 2, y: 10 },
        relativeCentroid: { x: 0.5, y: 0.5 },
        touchesBorder: false,
      }) as RefFace

    // Beide "kozijn"-vlakken vlak bij het scharnier (rechter kozijn @x≈128 gemist),
    // net als BouwTek11 (totalRefPx=13, swingSpanPx=113 → ratioBlade=0.1 → ~10 cm deur).
    const sizing = resolveReferenceSizing({
      faces: [makeKozijn({ label: 1, x: 1, width: 3 }), makeKozijn({ label: 2, x: 11, width: 3 })],
      axis: 'x',
      swingSpanPx: 113,
      fallbackTotalPx: 114,
      hingePx: { x: 13, y: 19 },
      freeDir: { x: 1, y: 0 },
    })

    // Guard grijpt in: opening ~ swing-span i.p.v. de kapotte 13px kozijnmeting.
    expect(sizing.totalRefPx).toBeGreaterThanOrEqual(113)
    expect(sizing.bladeRefPx).toBeGreaterThanOrEqual(113)
    expect(sizing.ratioBlade).toBeGreaterThan(0.8)
    expect(sizing.clearOverhangAlongRatio).toBeCloseTo(sizing.ratioBlade, 6)
    expect(sizing.clearOverhangOppositeRatio).toBe(0)
  })
})
