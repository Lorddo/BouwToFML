import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildFaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import {
  DOOR_ANGLE_RESCUE_TUNING,
  computeDoorHingeFromFaces,
  runDoorSwingAngleRescue,
  type DoorSizeBandPx,
  type DoorSwingRefBand,
} from '@/cv/doors'

vi.mock('@/cv/doors/door-swing-hinge', async () => {
  const actual = await vi.importActual<typeof import('@/cv/doors/door-swing-hinge')>(
    '@/cv/doors/door-swing-hinge',
  )
  return {
    ...actual,
    computeDoorHingeFromFaces: vi.fn(),
  }
})

const defaultSizeBand: DoorSizeBandPx = { wallMinPx: 35, wallMaxPx: 167 }

/** Driehoekige vulling ≈ 0.5 fill in de bbox (onder 0.80-cap). */
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

function shallowRef(overrides: Partial<DoorSwingRefBand> = {}): DoorSwingRefBand {
  return {
    aspectRef: 86 / 24,
    swingWpx: 86,
    swingHpx: 24,
    areaPx: 1072,
    swingAngleDeg: 16,
    ...overrides,
  }
}

function hingeOk(angleDeg = 16) {
  return {
    hingePx: { x: 10, y: 10 },
    axes: [
      { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, angleDeg: 0, supportLength: 10 },
      { a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, angleDeg: angleDeg, supportLength: 10 },
    ] as [
      {
        a: { x: number; y: number }
        b: { x: number; y: number }
        angleDeg: number
        supportLength: number
      },
      {
        a: { x: number; y: number }
        b: { x: number; y: number }
        angleDeg: number
        supportLength: number
      },
    ],
    swingAngleDeg: angleDeg,
    swingSpanPx: 50,
    sectorPolygon: [],
    supportScore: 1,
  }
}

function dualWithFace(params: {
  width: number
  height: number
  label: number
  whiteRect: { x: number; y: number; w: number; h: number }
  inkRect?: { x: number; y: number; w: number; h: number }
  /** default wedge (fill~0.5); 'solid' = volle bbox (fill~1) */
  fill?: 'wedge' | 'solid'
}) {
  const raw = new Int32Array(params.width * params.height)
  const ink = new Int32Array(params.width * params.height)
  const paint = params.fill === 'solid' ? paintRect : paintWedge
  paint(
    raw,
    params.width,
    params.whiteRect.x,
    params.whiteRect.y,
    params.whiteRect.w,
    params.whiteRect.h,
    params.label,
  )
  const inkRect = params.inkRect ?? params.whiteRect
  paint(ink, params.width, inkRect.x, inkRect.y, inkRect.w, inkRect.h, params.label)
  return buildFaceDualSpace({
    rawLabelsData: raw,
    labelsData: ink,
    width: params.width,
    height: params.height,
    classificationByLabel: new Map([[params.label, 'surface']]),
  })
}

describe('door-swing-angle-rescue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skipt fill ≥ 0.80 (dichte solid)', () => {
    const dual = dualWithFace({
      width: 120,
      height: 60,
      label: 7,
      whiteRect: { x: 10, y: 10, w: 50, h: 24 },
      fill: 'solid',
    })
    vi.mocked(computeDoorHingeFromFaces).mockReturnValue(hingeOk(16))

    const result = runDoorSwingAngleRescue({
      cv: {} as never,
      dual,
      parentMap: new Map([[7, 7]]),
      refBands: [shallowRef()],
      sizeBand: defaultSizeBand,
      claimedFaceIds: new Set(),
    })

    expect(result.matchedCount).toBe(0)
    expect(computeDoorHingeFromFaces).not.toHaveBeenCalled()
    expect(result.diagnostics[0]?.status).toBe('rejected_fill_cap')
    expect(result.diagnostics[0]?.fill).toBeGreaterThanOrEqual(0.8)
  })

  it('laat fill tussen ref×1.2 en 0.80 door naar hinge (262-case)', () => {
    // Volle bbox 50×24, ~70% pixels → fill=0.70 (onder 0.80, boven oude 1.2×refFill).
    const width = 120
    const height = 60
    const raw = new Int32Array(width * height)
    const ink = new Int32Array(width * height)
    const x0 = 10
    const y0 = 10
    const w = 50
    const h = 24
    let painted = 0
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        const i = (y - y0) * w + (x - x0)
        if (i % 10 >= 7) continue
        raw[y * width + x] = 7
        ink[y * width + x] = 7
        painted += 1
      }
    }
    raw[y0 * width + x0] = 7
    raw[y0 * width + (x0 + w - 1)] = 7
    raw[(y0 + h - 1) * width + x0] = 7
    raw[(y0 + h - 1) * width + (x0 + w - 1)] = 7
    ink[y0 * width + x0] = 7
    ink[y0 * width + (x0 + w - 1)] = 7
    ink[(y0 + h - 1) * width + x0] = 7
    ink[(y0 + h - 1) * width + (x0 + w - 1)] = 7
    expect(painted / (w * h)).toBeLessThan(0.8)
    expect(painted / (w * h)).toBeGreaterThan(0.623)

    const dual = buildFaceDualSpace({
      rawLabelsData: raw,
      labelsData: ink,
      width,
      height,
      classificationByLabel: new Map([[7, 'surface']]),
    })
    vi.mocked(computeDoorHingeFromFaces).mockReturnValue(hingeOk(16))

    const result = runDoorSwingAngleRescue({
      cv: {} as never,
      dual,
      parentMap: new Map([[7, 7]]),
      refBands: [shallowRef()],
      sizeBand: defaultSizeBand,
      claimedFaceIds: new Set(),
    })

    expect(result.matchedCount).toBe(1)
    expect(computeDoorHingeFromFaces).toHaveBeenCalled()
    expect(result.diagnostics[0]?.status).toBe('accepted')
    expect(result.diagnostics[0]?.fill).toBeLessThan(0.8)
  })

  it('skipt lange as boven wallMaxPx (1200mm-band)', () => {
    const dual = dualWithFace({
      width: 220,
      height: 60,
      label: 7,
      whiteRect: { x: 5, y: 10, w: 200, h: 24 },
    })
    vi.mocked(computeDoorHingeFromFaces).mockReturnValue(hingeOk(16))

    const result = runDoorSwingAngleRescue({
      cv: {} as never,
      dual,
      parentMap: new Map([[7, 7]]),
      refBands: [shallowRef()],
      sizeBand: defaultSizeBand,
      claimedFaceIds: new Set(),
    })

    expect(result.matchedCount).toBe(0)
    expect(computeDoorHingeFromFaces).not.toHaveBeenCalled()
    expect(result.diagnostics[0]?.status).toBe('rejected_too_long')
    expect(result.diagnostics[0]?.longPx).toBeGreaterThan(defaultSizeBand.wallMaxPx)
  })

  it('accepteert face met diepte ±15% en hoek binnen ±10°', () => {
    const dual = dualWithFace({
      width: 120,
      height: 60,
      label: 7,
      whiteRect: { x: 10, y: 10, w: 50, h: 24 },
    })
    vi.mocked(computeDoorHingeFromFaces).mockReturnValue(hingeOk(16))

    const result = runDoorSwingAngleRescue({
      cv: {} as never,
      dual,
      parentMap: new Map([[7, 7]]),
      refBands: [shallowRef()],
      sizeBand: defaultSizeBand,
      claimedFaceIds: new Set(),
    })

    expect(result.matchedCount).toBe(1)
    expect(result.accepted[0]?.source).toBe('angle_rescue')
    expect(result.diagnostics[0]?.status).toBe('accepted')
    expect(result.diagnostics[0]?.candidateAngleDeg).toBe(16)
    const call = vi.mocked(computeDoorHingeFromFaces).mock.calls[0][0]
    expect(call.options?.expectedAngleDeg).toBe(16)
    expect(call.options?.preferredWallAxis).toBe('h')
  })

  it('slaagt niet voor ref met swingAngleDeg ≥ 60', () => {
    const dual = dualWithFace({
      width: 120,
      height: 60,
      label: 7,
      whiteRect: { x: 10, y: 10, w: 50, h: 24 },
    })

    const result = runDoorSwingAngleRescue({
      cv: {} as never,
      dual,
      parentMap: new Map([[7, 7]]),
      refBands: [shallowRef({ swingAngleDeg: 90 })],
      sizeBand: defaultSizeBand,
      claimedFaceIds: new Set(),
    })

    expect(result.matchedCount).toBe(0)
    expect(computeDoorHingeFromFaces).not.toHaveBeenCalled()
  })

  it('rejectt wanneer hinge null is (geen arc)', () => {
    const dual = dualWithFace({
      width: 80,
      height: 80,
      label: 3,
      whiteRect: { x: 10, y: 10, w: 50, h: 24 },
    })
    vi.mocked(computeDoorHingeFromFaces).mockReturnValue(null)

    const result = runDoorSwingAngleRescue({
      cv: {} as never,
      dual,
      parentMap: new Map([[3, 3]]),
      refBands: [shallowRef()],
      sizeBand: defaultSizeBand,
      claimedFaceIds: new Set(),
    })

    expect(result.scannedCount).toBe(1)
    expect(result.matchedCount).toBe(0)
    expect(result.diagnostics[0]?.status).toBe('rejected_no_hinge')
  })

  it('skipt height buiten ±15%', () => {
    const dual = dualWithFace({
      width: 120,
      height: 60,
      label: 7,
      whiteRect: { x: 10, y: 10, w: 80, h: 40 },
    })

    const result = runDoorSwingAngleRescue({
      cv: {} as never,
      dual,
      parentMap: new Map([[7, 7]]),
      refBands: [shallowRef()],
      sizeBand: defaultSizeBand,
      claimedFaceIds: new Set(),
    })

    expect(result.scannedCount).toBe(0)
    expect(result.matchedCount).toBe(0)
    expect(computeDoorHingeFromFaces).not.toHaveBeenCalled()
  })

  it('diepte ±15%: short=20 blijft skip (floor 20.4 bij ref depth 24)', () => {
    // ref depth 24 → ±15% floor 20.4; short=20 blijft buiten de band
    const dual = dualWithFace({
      width: 120,
      height: 60,
      label: 7,
      whiteRect: { x: 10, y: 10, w: 50, h: 20 },
    })
    vi.mocked(computeDoorHingeFromFaces).mockReturnValue(hingeOk(16))

    const result = runDoorSwingAngleRescue({
      cv: {} as never,
      dual,
      parentMap: new Map([[7, 7]]),
      refBands: [shallowRef()],
      sizeBand: defaultSizeBand,
      claimedFaceIds: new Set(),
    })

    expect(result.scannedCount).toBe(0)
    expect(result.matchedCount).toBe(0)
    expect(computeDoorHingeFromFaces).not.toHaveBeenCalled()
  })

  it('height via ink, hoek altijd op white wanneer white bestaat', () => {
    const dual = dualWithFace({
      width: 120,
      height: 60,
      label: 9,
      // white short=10 (buiten band), ink short=24 (in band)
      whiteRect: { x: 10, y: 10, w: 50, h: 10 },
      inkRect: { x: 10, y: 10, w: 50, h: 24 },
    })
    vi.mocked(computeDoorHingeFromFaces).mockReturnValue(hingeOk(18))

    const result = runDoorSwingAngleRescue({
      cv: {} as never,
      dual,
      parentMap: new Map([[9, 9]]),
      refBands: [shallowRef()],
      sizeBand: defaultSizeBand,
      claimedFaceIds: new Set(),
    })

    expect(result.matchedCount).toBe(1)
    // Meet-bbox = white (h=10), niet ink
    expect(result.accepted[0]?.unionBBox.height).toBe(10)
    expect(result.diagnostics[0]?.space).toBe('white')
    const call = vi.mocked(computeDoorHingeFromFaces).mock.calls[0][0]
    expect(call.labelsData).toBe(dual.white.labelsData)
    expect(call.options?.expectedAngleDeg).toBe(16)
    expect(call.options?.preferredWallAxis).toBe('h')
  })

  it('hoek buiten margin → geen match', () => {
    const dual = dualWithFace({
      width: 120,
      height: 60,
      label: 7,
      whiteRect: { x: 10, y: 10, w: 50, h: 24 },
    })
    vi.mocked(computeDoorHingeFromFaces).mockReturnValue(
      hingeOk(16 + DOOR_ANGLE_RESCUE_TUNING.angleMarginDeg + 1),
    )

    const result = runDoorSwingAngleRescue({
      cv: {} as never,
      dual,
      parentMap: new Map([[7, 7]]),
      refBands: [shallowRef()],
      sizeBand: defaultSizeBand,
      claimedFaceIds: new Set(),
    })

    expect(result.scannedCount).toBe(1)
    expect(result.matchedCount).toBe(0)
    expect(result.diagnostics[0]?.status).toBe('rejected_angle_mismatch')
  })

  it('claimed faces worden overgeslagen', () => {
    const dual = dualWithFace({
      width: 120,
      height: 60,
      label: 7,
      whiteRect: { x: 10, y: 10, w: 50, h: 24 },
    })

    const result = runDoorSwingAngleRescue({
      cv: {} as never,
      dual,
      parentMap: new Map([[7, 7]]),
      refBands: [shallowRef()],
      sizeBand: defaultSizeBand,
      claimedFaceIds: new Set([7]),
    })

    expect(result.matchedCount).toBe(0)
    expect(computeDoorHingeFromFaces).not.toHaveBeenCalled()
  })
})
