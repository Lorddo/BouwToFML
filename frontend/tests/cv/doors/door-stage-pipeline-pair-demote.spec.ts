import { describe, expect, it } from 'vitest'
import { buildFaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { runDoorStagePipeline, type DoorSwingRefBand } from '@/cv/doors'

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

/** Solid fill → refFill 1.0 zodat Stage-2 fill-band doorlaat. */
const refBands: DoorSwingRefBand[] = [
  {
    aspectRef: 100 / 24,
    swingWpx: 100,
    swingHpx: 24,
    areaPx: 100 * 24,
    swingSpanPx: 100,
    wallRatio: 1,
    depthRatio: 24 / 100,
    areaSpan2Ratio: 1,
    framingPx: 8,
    overhangAlongPx: 90,
    overhangOppositePx: 10,
    clearOverhangAlongRatio: 0.85,
    clearOverhangOppositeRatio: 0.05,
    framingAlongPx: 4,
    framingOppositePx: 4,
    ratioBlade: 0.9,
    fmlRefId: 'test-door',
    kind: 'single',
  },
]

/**
 * wallL loopt door naast swing → wall-touch OK;
 * frame L+R wall → betweenWalls; swing L wall / R surface → geen betweenWalls.
 */
function buildFrameSwingDual() {
  const width = 220
  const height = 160
  const raw = new Int32Array(width * height)
  const ink = new Int32Array(width * height)
  const faces: Array<{
    label: number
    x: number
    y: number
    w: number
    h: number
  }> = [
    { label: 10, x: 40, y: 20, w: 140, h: 40 },
    { label: 17, x: 40, y: 60, w: 20, h: 54 }, // wall L (door tot onder swing)
    { label: 19, x: 160, y: 60, w: 20, h: 24 }, // wall R alleen naast frame
    { label: 268, x: 60, y: 60, w: 100, h: 24 }, // frame
    { label: 285, x: 60, y: 84, w: 100, h: 24 }, // swing (zelfde aspect)
    { label: 11, x: 160, y: 84, w: 20, h: 30 }, // surface rechts van swing
    { label: 12, x: 60, y: 108, w: 120, h: 30 },
  ]
  for (const f of faces) {
    paintRect(raw, width, f.x, f.y, f.w, f.h, f.label)
    paintRect(ink, width, f.x, f.y, f.w, f.h, f.label)
  }
  return buildFaceDualSpace({
    rawLabelsData: raw,
    labelsData: ink,
    width,
    height,
    classificationByLabel: new Map([
      [10, 'surface'],
      [11, 'surface'],
      [12, 'surface'],
      [17, 'wall'],
      [19, 'wall'],
      [268, 'door'],
      [285, 'door'],
    ]),
  })
}

describe('runDoorStagePipeline pair/demote (D-62)', () => {
  it('pair → swing in resolved met doorframeFaceIds; frame in bridgeWallFaceIds', () => {
    const pipe = runDoorStagePipeline({
      dual: buildFrameSwingDual(),
      cv: {} as never,
      refBands,
      sizeBand: { wallMinPx: 40, wallMaxPx: 200 },
      pxPerMmX: 0.14,
      pxPerMmY: 0.14,
      allowedSeedClasses: ['door'],
    })

    expect(pipe.bridgeWallFaceIds).toContain(268)
    expect(pipe.stage2Accepted.some((h) => h.faceIds.includes(268))).toBe(false)
    expect(pipe.stage2Accepted.some((h) => h.faceIds.includes(285))).toBe(true)
    const swing = pipe.resolved.find((d) => d.faceIds.includes(285))
    expect(swing).toBeDefined()
    expect(swing?.doorframeFaceIds).toContain(268)
    expect(pipe.resolved.some((d) => d.faceIds.includes(268))).toBe(false)
  })

  it('existingDoorsOnly: pair/demote no-op (beide door-faces blijven)', () => {
    const pipe = runDoorStagePipeline({
      dual: buildFrameSwingDual(),
      cv: {} as never,
      refBands,
      sizeBand: { wallMinPx: 40, wallMaxPx: 200 },
      pxPerMmX: 0.14,
      pxPerMmY: 0.14,
      existingDoorsOnly: true,
    })

    expect(pipe.bridgeWallFaceIds).not.toContain(268)
    const faceIds = pipe.stage2Accepted.flatMap((h) => h.faceIds)
    expect(faceIds).toContain(268)
    expect(faceIds).toContain(285)
  })
})
