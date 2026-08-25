import { describe, expect, it } from 'vitest'
import {
  collectThinDoorMaskFaceIds,
  doorHypothesisDepthPx,
  isDoorHypothesisEligibleForMask,
  isDoorHypothesisSwingWithFrame,
} from '@/cv/doors/door-thin-mask'
import {
  isThinHypBetweenWalls,
  type ThinMaskBetweenWallsContext,
} from '@/cv/doors/door-thin-mask-between-walls'
import {
  buildBaselineWallMaskWithoutDoors,
  isThinHypWingBridge,
} from '@/cv/doors/door-thin-mask-wing-bridge'
import {
  isHypInPolylineBand,
  isHypPolylineBridge,
  isThinHypPolylineKeep,
} from '@/cv/doors/door-thin-mask-polyline-keep'
import type { Segment } from '@/cv/port/wallGraph'
import { mapClassesForWallPipeline, toWallPipelineClass } from '@/cv/walls/rooms/room-ink-classify'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'

type FaceDef = {
  label: number
  x: number
  y: number
  width: number
  height: number
}

function makeComponent(face: FaceDef): RasterRoomComponent {
  return {
    label: face.label,
    areaPx: face.width * face.height,
    bbox: { x: face.x, y: face.y, width: face.width, height: face.height },
    touchesBorder: false,
  }
}

function paintFace(
  labelsData: Int32Array,
  imageWidth: number,
  imageHeight: number,
  face: FaceDef,
): void {
  for (let y = face.y; y < face.y + face.height; y += 1) {
    if (y < 0 || y >= imageHeight) continue
    for (let x = face.x; x < face.x + face.width; x += 1) {
      if (x < 0 || x >= imageWidth) continue
      labelsData[y * imageWidth + x] = face.label
    }
  }
}

function sceneFromFaces(
  width: number,
  height: number,
  faces: FaceDef[],
  classes: Array<[number, RoomRasterClass]>,
): ThinMaskBetweenWallsContext {
  const labelsData = new Int32Array(width * height)
  for (const face of faces) paintFace(labelsData, width, height, face)
  return {
    labelsData,
    width,
    height,
    parentMap: new Map(),
    components: faces.map(makeComponent),
    classificationByLabel: new Map(classes),
    classificationGroupBy: 'component',
    referenceWallThicknessPx: 30,
  }
}

describe('door-thin-mask guard', () => {
  it('depth = min(w,h)', () => {
    expect(doorHypothesisDepthPx({ width: 100, height: 30 })).toBe(30)
    expect(doorHypothesisDepthPx({ width: 32, height: 140 })).toBe(32)
  })

  it('eligible alleen met geldige muur-ref en depth ≤ ref', () => {
    expect(isDoorHypothesisEligibleForMask(30, 40)).toBe(true)
    expect(isDoorHypothesisEligibleForMask(40, 40)).toBe(true)
    expect(isDoorHypothesisEligibleForMask(41, 40)).toBe(false)
    expect(isDoorHypothesisEligibleForMask(20, null)).toBe(false)
    expect(isDoorHypothesisEligibleForMask(20, 0)).toBe(false)
  })

  it('collecteert alle faces van dunne hyps; dikke hyps overslaan', () => {
    const ids = collectThinDoorMaskFaceIds(
      [
        { faceIds: [10, 11], unionBBox: { width: 120, height: 28 } },
        { faceIds: [20], unionBBox: { width: 90, height: 90 } },
        { faceIds: [30], unionBBox: { width: 40, height: 35 } },
      ],
      40,
    )
    expect(ids).toEqual([10, 11, 30])
  })

  it('zonder face-bbox: alle thin faces van de hyp (zelfde union-fallback)', () => {
    const ids = collectThinDoorMaskFaceIds(
      [{ faceIds: [1, 2, 3], unionBBox: { width: 80, height: 25 } }],
      30,
    )
    expect(ids).toEqual([1, 2, 3])
  })

  it('D-62-swing met doorframeFaceIds → geen maskKeep (blad punch)', () => {
    expect(
      isDoorHypothesisSwingWithFrame({
        faceIds: [285],
        unionBBox: { width: 100, height: 37 },
        doorframeFaceIds: [268],
      }),
    ).toBe(true)
    const ids = collectThinDoorMaskFaceIds(
      [
        {
          faceIds: [285],
          unionBBox: { width: 100, height: 37 },
          doorframeFaceIds: [268],
        },
        {
          faceIds: [99],
          unionBBox: { width: 80, height: 25 },
        },
      ],
      40,
    )
    expect(ids).toEqual([99])
    expect(ids).not.toContain(285)
    expect(ids).not.toContain(268)
  })

  it('hyp met window/doorframe face-class → geen maskKeep', () => {
    const classForFaceId = (id: number) => {
      if (id === 50) return 'window' as const
      if (id === 60) return 'doorframe' as const
      return 'door' as const
    }
    const ids = collectThinDoorMaskFaceIds(
      [
        { faceIds: [50], unionBBox: { width: 80, height: 20 } },
        { faceIds: [60], unionBBox: { width: 70, height: 22 } },
        { faceIds: [70], unionBBox: { width: 90, height: 24 } },
      ],
      40,
      { classForFaceId },
    )
    expect(ids).toEqual([70])
  })

  it('window-face in dezelfde hyp: alleen de deur-sibling keep', () => {
    const classForFaceId = (id: number) => (id === 50 ? ('window' as const) : ('door' as const))
    const ids = collectThinDoorMaskFaceIds(
      [{ faceIds: [50, 70], unionBBox: { width: 90, height: 24 } }],
      40,
      { classForFaceId },
    )
    expect(ids).toEqual([70])
  })

  it('bekijkt alle hyps: DF-sibling faces geblokt ook als andere hyp thin is', () => {
    const ids = collectThinDoorMaskFaceIds(
      [
        {
          faceIds: [1],
          unionBBox: { width: 200, height: 200 },
          doorframeFaceIds: [99],
        },
        {
          faceIds: [99, 2],
          unionBBox: { width: 50, height: 20 },
        },
      ],
      40,
    )
    // hyp1 skipped (has DF); hyp2 thin but face 99 is DF-sibling of hyp1 → blocked
    expect(ids).toEqual([2])
  })
})

describe('door-thin-mask between-walls keep-poort', () => {
  it('H-kozijn L+R muur → keep; swing met muur aan één kant → geen keep', () => {
    const ctx = sceneFromFaces(
      220,
      160,
      [
        { label: 10, x: 40, y: 20, width: 140, height: 40 },
        { label: 17, x: 40, y: 60, width: 20, height: 30 },
        { label: 19, x: 160, y: 60, width: 20, height: 30 },
        { label: 268, x: 60, y: 60, width: 100, height: 24 },
        { label: 285, x: 70, y: 84, width: 80, height: 28 },
        { label: 11, x: 40, y: 112, width: 140, height: 30 },
      ],
      [
        [10, 'surface'],
        [11, 'surface'],
        [17, 'wall'],
        [19, 'wall'],
        [268, 'door'],
        [285, 'door'],
      ],
    )

    expect(
      isThinHypBetweenWalls(
        { faceIds: [268], unionBBox: { x: 60, y: 60, width: 100, height: 24 } },
        ctx,
      ),
    ).toBe(true)
    expect(
      isThinHypBetweenWalls(
        { faceIds: [285], unionBBox: { x: 70, y: 84, width: 80, height: 28 } },
        ctx,
      ),
    ).toBe(false)

    const ids = collectThinDoorMaskFaceIds(
      [
        { faceIds: [268], unionBBox: { x: 60, y: 60, width: 100, height: 24 } },
        { faceIds: [285], unionBBox: { x: 70, y: 84, width: 80, height: 28 } },
      ],
      30,
      { betweenWalls: ctx },
    )
    expect(ids).toEqual([268])
  })

  it('cluster kozijn+swing in één hyp: alleen kozijn (niet union-depth)', () => {
    const ctx = sceneFromFaces(
      220,
      160,
      [
        { label: 10, x: 40, y: 20, width: 140, height: 40 },
        { label: 17, x: 40, y: 60, width: 20, height: 30 },
        { label: 19, x: 160, y: 60, width: 20, height: 30 },
        { label: 268, x: 60, y: 60, width: 100, height: 24 },
        { label: 285, x: 70, y: 84, width: 80, height: 28 },
        { label: 11, x: 40, y: 112, width: 140, height: 30 },
      ],
      [
        [10, 'surface'],
        [11, 'surface'],
        [17, 'wall'],
        [19, 'wall'],
        [268, 'door'],
        [285, 'door'],
      ],
    )
    // Union-depth ≈ 52 > ref 30 → oude per-hyp keepte niemand.
    const ids = collectThinDoorMaskFaceIds(
      [
        {
          faceIds: [268, 285],
          unionBBox: { x: 60, y: 60, width: 100, height: 52 },
        },
      ],
      30,
      { betweenWalls: ctx },
    )
    expect(ids).toEqual([268])
    expect(ids).not.toContain(285)
  })

  it('muur + meubel andere kant → geen keep', () => {
    const ctx = sceneFromFaces(
      200,
      100,
      [
        { label: 17, x: 20, y: 30, width: 20, height: 30 },
        { label: 50, x: 40, y: 35, width: 80, height: 20 },
        { label: 80, x: 120, y: 30, width: 40, height: 40 }, // furniture-ish surface
      ],
      [
        [17, 'wall'],
        [50, 'door'],
        [80, 'surface'],
      ],
    )
    expect(
      isThinHypBetweenWalls(
        { faceIds: [50], unionBBox: { x: 40, y: 35, width: 80, height: 20 } },
        ctx,
      ),
    ).toBe(false)
  })

  it('majority: één sample-lek (mini-uitstolpsel) → nog keep', () => {
    // Mid-hoogte rechts: surface-nib tussen kozijn en muur (boog-rand);
    // 0.25 + 0.75 raken wél wall → ≥2/3.
    const ctx = sceneFromFaces(
      220,
      100,
      [
        { label: 17, x: 40, y: 30, width: 20, height: 40 },
        { label: 19, x: 160, y: 30, width: 20, height: 40 },
        { label: 268, x: 60, y: 35, width: 100, height: 24 },
        // nib alleen op mid-sample (~y=47): blokkeert unaniem, niet majority
        { label: 99, x: 160, y: 46, width: 4, height: 4 },
      ],
      [
        [17, 'wall'],
        [19, 'wall'],
        [268, 'door'],
        [99, 'surface'],
      ],
    )
    // Paint surface nib over wall 19 at mid so mid-ray hits surface first
    const { labelsData, width } = ctx
    for (let y = 46; y < 50; y += 1) {
      for (let x = 160; x < 164; x += 1) {
        labelsData[y * width + x] = 99
      }
    }
    expect(
      isThinHypBetweenWalls(
        { faceIds: [268], unionBBox: { x: 60, y: 35, width: 100, height: 24 } },
        ctx,
      ),
    ).toBe(true)
  })

  it('micro-stomp (arcering) via soft pad → keep', () => {
    // Image shortSide=160 → micro max ≈ 4.8px; 4×20 = micro wall stubs.
    const ctx = sceneFromFaces(
      200,
      160,
      [
        { label: 17, x: 50, y: 60, width: 4, height: 24 },
        { label: 19, x: 154, y: 60, width: 4, height: 24 },
        { label: 268, x: 54, y: 60, width: 100, height: 24 },
      ],
      [
        [17, 'wall'],
        [19, 'wall'],
        [268, 'door'],
      ],
    )
    expect(
      isThinHypBetweenWalls(
        { faceIds: [268], unionBBox: { x: 54, y: 60, width: 100, height: 24 } },
        ctx,
      ),
    ).toBe(true)
  })

  it('window/doorframe als stomp → keep', () => {
    const ctx = sceneFromFaces(
      220,
      100,
      [
        { label: 17, x: 40, y: 30, width: 20, height: 30 },
        { label: 19, x: 160, y: 30, width: 20, height: 30 },
        { label: 268, x: 60, y: 35, width: 100, height: 20 },
      ],
      [
        [17, 'window'],
        [19, 'doorframe'],
        [268, 'door'],
      ],
    )
    expect(
      isThinHypBetweenWalls(
        { faceIds: [268], unionBBox: { x: 60, y: 35, width: 100, height: 20 } },
        ctx,
      ),
    ).toBe(true)
  })

  it('twee overlappende dunne hyps: hoogstens de between-walls', () => {
    const ctx = sceneFromFaces(
      220,
      160,
      [
        { label: 17, x: 40, y: 60, width: 20, height: 30 },
        { label: 19, x: 160, y: 60, width: 20, height: 30 },
        { label: 268, x: 60, y: 60, width: 100, height: 24 },
        { label: 285, x: 70, y: 70, width: 80, height: 28 }, // overlaps frame bbox
        { label: 11, x: 40, y: 112, width: 140, height: 30 },
      ],
      [
        [11, 'surface'],
        [17, 'wall'],
        [19, 'wall'],
        [268, 'door'],
        [285, 'door'],
      ],
    )
    const ids = collectThinDoorMaskFaceIds(
      [
        { faceIds: [268], unionBBox: { x: 60, y: 60, width: 100, height: 24 } },
        { faceIds: [285], unionBBox: { x: 70, y: 70, width: 80, height: 28 } },
      ],
      30,
      { betweenWalls: ctx },
    )
    expect(ids).toEqual([268])
    expect(ids).not.toContain(285)
  })

  it('twee overlappende beide between-walls → hoogstens één', () => {
    // Zelfde L/R-stompen; Y-overlap zodat beide BW zijn; dunnere wint.
    const ctx = sceneFromFaces(
      220,
      100,
      [
        { label: 17, x: 40, y: 30, width: 20, height: 40 },
        { label: 19, x: 160, y: 30, width: 20, height: 40 },
        { label: 100, x: 60, y: 30, width: 100, height: 20 },
        { label: 101, x: 60, y: 35, width: 100, height: 16 },
      ],
      [
        [17, 'wall'],
        [19, 'wall'],
        [100, 'door'],
        [101, 'door'],
      ],
    )
    const ids = collectThinDoorMaskFaceIds(
      [
        { faceIds: [100], unionBBox: { x: 60, y: 30, width: 100, height: 20 } },
        { faceIds: [101], unionBBox: { x: 60, y: 35, width: 100, height: 16 } },
      ],
      30,
      { betweenWalls: ctx },
    )
    // Dunnere (16) wint overlap-pick
    expect(ids).toEqual([101])
  })
})

describe('door-thin-mask laag 2 vleugel-brug', () => {
  function wingCtx(bw: ThinMaskBetweenWallsContext) {
    return {
      labelsData: bw.labelsData,
      width: bw.width,
      height: bw.height,
      parentMap: bw.parentMap,
      classificationByLabel: bw.classificationByLabel,
      classificationGroupBy: bw.classificationGroupBy,
      referenceWallThicknessPx: bw.referenceWallThicknessPx,
    }
  }

  it('kozijn dat twee muurvleugels lijmt → L2 keep (ook als L1 uitstaat)', () => {
    const bw = sceneFromFaces(
      280,
      120,
      [
        { label: 17, x: 20, y: 30, width: 40, height: 50 },
        { label: 19, x: 200, y: 30, width: 40, height: 50 },
        { label: 50, x: 60, y: 40, width: 140, height: 18 },
      ],
      [
        [17, 'wall'],
        [19, 'wall'],
        [50, 'door'],
      ],
    )
    bw.referenceWallThicknessPx = 20
    const baseline = buildBaselineWallMaskWithoutDoors(wingCtx(bw))
    expect(
      isThinHypWingBridge({
        baselineMask: baseline,
        faceIds: [50],
        labelsData: bw.labelsData,
        width: bw.width,
        height: bw.height,
        parentMap: bw.parentMap,
        referenceWallThicknessPx: 20,
      }),
    ).toBe(true)

    // assumeBetweenWalls false → L1 drop; L2 redt de brug
    const ids = collectThinDoorMaskFaceIds(
      [{ faceIds: [50], unionBBox: { x: 60, y: 40, width: 140, height: 18 } }],
      20,
      { assumeBetweenWalls: false, wingBridge: wingCtx(bw) },
    )
    expect(ids).toEqual([50])
  })

  it('uitsteeksel op één blob → geen L2 keep', () => {
    const bw = sceneFromFaces(
      200,
      120,
      [
        { label: 17, x: 20, y: 30, width: 120, height: 40 },
        { label: 50, x: 60, y: 70, width: 40, height: 16 },
      ],
      [
        [17, 'wall'],
        [50, 'door'],
      ],
    )
    bw.referenceWallThicknessPx = 20
    const baseline = buildBaselineWallMaskWithoutDoors(wingCtx(bw))
    expect(
      isThinHypWingBridge({
        baselineMask: baseline,
        faceIds: [50],
        labelsData: bw.labelsData,
        width: bw.width,
        height: bw.height,
        parentMap: bw.parentMap,
        referenceWallThicknessPx: 20,
      }),
    ).toBe(false)

    const ids = collectThinDoorMaskFaceIds(
      [{ faceIds: [50], unionBBox: { x: 60, y: 70, width: 40, height: 16 } }],
      20,
      { assumeBetweenWalls: false, wingBridge: wingCtx(bw) },
    )
    expect(ids).toEqual([])
  })

  it('klein gat kozijn↔muur (~6 px) → L2 keep via gap-slack', () => {
    // ref 40 → slack min(8, 6)=6; frame raakt L, 6 px leeg tot R
    const bw = sceneFromFaces(
      280,
      120,
      [
        { label: 17, x: 20, y: 30, width: 40, height: 50 },
        { label: 19, x: 206, y: 30, width: 40, height: 50 },
        { label: 50, x: 60, y: 40, width: 140, height: 18 }, // ends x=200; R starts 206
      ],
      [
        [17, 'wall'],
        [19, 'wall'],
        [50, 'door'],
      ],
    )
    bw.referenceWallThicknessPx = 40
    const baseline = buildBaselineWallMaskWithoutDoors(wingCtx(bw))
    expect(
      isThinHypWingBridge({
        baselineMask: baseline,
        faceIds: [50],
        labelsData: bw.labelsData,
        width: bw.width,
        height: bw.height,
        parentMap: bw.parentMap,
        referenceWallThicknessPx: 40,
      }),
    ).toBe(true)
  })
})

describe('door-thin-mask laag 3 polylijn-keep', () => {
  it('in-band op bestaande hartlijn → keep; loodrechte swing → reject', () => {
    const wallRef = 20
    const band = wallRef * 0.25
    // Doorgaande H-hartlijn (stomp links+rechts als één lijn door het kozijn)
    const segments: Segment[] = [{ a: { x: 20, y: 50 }, b: { x: 200, y: 50 } }]
    const labelsData = new Int32Array(220 * 100)
    // paint frame face 50 as thin H strip on the line
    for (let y = 46; y < 54; y += 1) {
      for (let x = 80; x < 140; x += 1) {
        labelsData[y * 220 + x] = 50
      }
    }
    // swing face 60 hanging below (perpendicular)
    for (let y = 54; y < 90; y += 1) {
      for (let x = 100; x < 120; x += 1) {
        labelsData[y * 220 + x] = 60
      }
    }
    const parentMap = new Map<number, number>()
    const frame = {
      faceIds: [50],
      unionBBox: { x: 80, y: 46, width: 60, height: 8 },
    }
    const swing = {
      faceIds: [60],
      unionBBox: { x: 100, y: 54, width: 20, height: 36 },
    }
    const ctx = {
      segments,
      labelsData,
      width: 220,
      height: 100,
      parentMap,
      referenceWallThicknessPx: wallRef,
    }

    expect(
      isHypInPolylineBand({
        hyp: frame,
        segments,
        labelsData,
        width: 220,
        height: 100,
        parentMap,
        bandPx: band,
      }),
    ).toBe(true)
    expect(isThinHypPolylineKeep(frame, ctx)).toBe(true)
    expect(isThinHypPolylineKeep(swing, ctx)).toBe(false)

    const ids = collectThinDoorMaskFaceIds([frame, swing], wallRef, {
      assumeBetweenWalls: false,
      polylineKeep: ctx,
    })
    expect(ids).toEqual([50])
    expect(ids).not.toContain(60)

    const clustered = collectThinDoorMaskFaceIds(
      [
        {
          faceIds: [50, 60],
          unionBBox: { x: 80, y: 46, width: 60, height: 44 },
        },
      ],
      wallRef,
      {
        assumeBetweenWalls: false,
        betweenWalls: {
          labelsData,
          width: 220,
          height: 100,
          parentMap,
          components: [
            {
              label: 50,
              areaPx: 60 * 8,
              bbox: { x: 80, y: 46, width: 60, height: 8 },
              touchesBorder: false,
            },
            {
              label: 60,
              areaPx: 20 * 36,
              bbox: { x: 100, y: 54, width: 20, height: 36 },
              touchesBorder: false,
            },
          ],
          classificationByLabel: new Map([
            [50, 'door'],
            [60, 'door'],
          ]),
          classificationGroupBy: 'component',
          referenceWallThicknessPx: wallRef,
        },
        polylineKeep: ctx,
      },
    )
    expect(clustered).toEqual([50])
    expect(clustered).not.toContain(60)
  })

  it('bridge tussen twee I-einden → keep', () => {
    const wallRef = 20
    const segments: Segment[] = [
      { a: { x: 10, y: 40 }, b: { x: 70, y: 40 } },
      { a: { x: 150, y: 40 }, b: { x: 210, y: 40 } },
    ]
    expect(
      isHypPolylineBridge({
        hyp: {
          faceIds: [1],
          unionBBox: { x: 75, y: 32, width: 70, height: 16 },
        },
        segments,
        wallRefPx: wallRef,
      }),
    ).toBe(true)

    const ids = collectThinDoorMaskFaceIds(
      [{ faceIds: [1], unionBBox: { x: 75, y: 32, width: 70, height: 16 } }],
      wallRef,
      {
        assumeBetweenWalls: false,
        polylineKeep: {
          segments,
          labelsData: new Int32Array(220 * 80),
          width: 220,
          height: 80,
          parentMap: new Map(),
          referenceWallThicknessPx: wallRef,
        },
      },
    )
    expect(ids).toEqual([1])
  })
})

describe('mapClassesForWallPipeline thin keep', () => {
  it('houdt dunne door-faces als wall in pipeline; display-door blijft via pick', () => {
    const input = new Map([
      [1, 'door' as const],
      [2, 'door' as const],
      [3, 'wall' as const],
    ])
    const mapped = mapClassesForWallPipeline(input, {
      maskKeepDoorFaceIds: new Set([1]),
    })
    expect(mapped.get(1)).toBe('wall')
    expect(mapped.get(2)).toBe('unknown')
    expect(mapped.get(3)).toBe('wall')
    expect(toWallPipelineClass('door')).toBe('unknown')
    expect(toWallPipelineClass('door', { keepDoorInMask: true })).toBe('wall')
  })
})
