import { describe, expect, it } from 'vitest'
import { CONCEPT_DOOR_REFID } from '@/core/fml/types'
import { resolveDoorCandidates, type DoorSwingHypothesis, type DoorSwingRefBand } from '@/cv/doors'

function makeHypothesis(params: {
  id: string
  faceIds: number[]
  source?: 'single' | 'cluster'
  refIndex?: number
  bbox: { x: number; y: number; width: number; height: number }
}): DoorSwingHypothesis {
  return {
    id: params.id,
    faceIds: params.faceIds,
    unionBBox: params.bbox,
    filledAreaPx: params.bbox.width * params.bbox.height,
    score: 0.92,
    source: params.source ?? 'single',
    matchedRefIndex: params.refIndex ?? 0,
  }
}

describe('door-resolve', () => {
  it('past ratio-model toe: widthPx = geschaalde overhangs (of fallback framing)', () => {
    const hypotheses = [
      makeHypothesis({
        id: 'door-a',
        faceIds: [1],
        bbox: { x: 20, y: 20, width: 100, height: 50 },
      }),
    ]
    const refs: DoorSwingRefBand[] = [
      {
        aspectRef: 2,
        swingWpx: 100,
        swingHpx: 50,
        areaPx: 2000,
        swingSpanPx: 100,
        ratioBlade: 1.2,
        framingPx: 12,
        overhangAlongPx: 90,
        overhangOppositePx: 30,
        fmlRefId: CONCEPT_DOOR_REFID,
        kind: 'single',
      },
    ]
    const resolved = resolveDoorCandidates({
      hypotheses,
      refBands: refs,
      pxPerMmX: 2,
      pxPerMmY: 2,
    })
    expect(resolved).toHaveLength(1)
    const door = resolved[0]
    expect(door.overhangAlongPx).toBeCloseTo(90, 1)
    expect(door.overhangOppositePx).toBeCloseTo(30, 1)
    expect(door.widthPx).toBeCloseTo(120, 1)
    expect(door.widthCm).toBeCloseTo(door.widthPx / 20, 2)
  })

  it('houdt kozijnbreedte vast bij grotere/kleinere swing (geen meeschalen)', () => {
    const hypotheses = [
      makeHypothesis({
        id: 'door-large',
        faceIds: [1],
        bbox: { x: 20, y: 20, width: 200, height: 100 },
      }),
    ]
    const refs: DoorSwingRefBand[] = [
      {
        aspectRef: 2,
        swingWpx: 100,
        swingHpx: 50,
        areaPx: 2000,
        swingSpanPx: 100,
        ratioBlade: 1,
        framingPx: 25,
        overhangAlongPx: 90,
        overhangOppositePx: 30,
        framingAlongPx: 12,
        framingOppositePx: 13,
        fmlRefId: CONCEPT_DOOR_REFID,
        kind: 'single',
      },
    ]
    const resolved = resolveDoorCandidates({
      hypotheses,
      refBands: refs,
      pxPerMmX: 2,
      pxPerMmY: 2,
    })
    expect(resolved).toHaveLength(1)
    const door = resolved[0]
    expect(door.swingSpanPx).toBeCloseTo(200, 1)
    expect(door.framingAlongPx).toBe(12)
    expect(door.framingOppositePx).toBe(13)
    expect(door.framingPx).toBe(25)
    expect(door.overhangAlongPx).toBeCloseTo(168, 1)
    expect(door.overhangOppositePx).toBeCloseTo(47, 1)
    expect(door.widthPx).toBeCloseTo(215, 1)
  })

  it('hanteert framing/ratio per referentie', () => {
    const hypotheses = [
      makeHypothesis({
        id: 'door-ref-1',
        faceIds: [1],
        bbox: { x: 30, y: 40, width: 90, height: 60 },
        refIndex: 0,
      }),
      makeHypothesis({
        id: 'door-ref-2',
        faceIds: [2],
        bbox: { x: 130, y: 40, width: 90, height: 60 },
        refIndex: 1,
      }),
    ]
    const refs: DoorSwingRefBand[] = [
      {
        aspectRef: 1.5,
        swingWpx: 90,
        swingHpx: 60,
        areaPx: 2400,
        swingSpanPx: 90,
        ratioBlade: 1.1,
        framingPx: 8,
        overhangAlongPx: 70,
        overhangOppositePx: 20,
        fmlRefId: CONCEPT_DOOR_REFID,
        kind: 'single',
      },
      {
        aspectRef: 1.5,
        swingWpx: 90,
        swingHpx: 60,
        areaPx: 2400,
        swingSpanPx: 90,
        ratioBlade: 1.4,
        framingPx: 22,
        overhangAlongPx: 100,
        overhangOppositePx: 40,
        fmlRefId: CONCEPT_DOOR_REFID,
        kind: 'single',
      },
    ]
    const resolved = resolveDoorCandidates({
      hypotheses,
      refBands: refs,
      pxPerMmX: 2.4,
      pxPerMmY: 2.4,
    })
    expect(resolved).toHaveLength(2)
    const first = resolved.find((row) => row.id === 'door-ref-1')!
    const second = resolved.find((row) => row.id === 'door-ref-2')!
    expect(first.widthPx).toBeLessThan(second.widthPx)
    expect(first.overhangAlongPx).toBeCloseTo(70, 1)
    expect(second.overhangOppositePx).toBeCloseTo(40, 1)
    expect(first.framingPx).toBe(8)
    expect(second.framingPx).toBe(22)
    expect(first.ratioBlade).toBe(1.1)
    expect(second.ratioBlade).toBe(1.4)
  })

  it('gebruikt clear-overhang ratios uit ref-build (geen cand/ref-scale nodig)', () => {
    const hypotheses = [
      makeHypothesis({
        id: 'door-clear-ratio',
        faceIds: [1],
        bbox: { x: 40, y: 40, width: 100, height: 50 },
      }),
    ]
    const refs: DoorSwingRefBand[] = [
      {
        aspectRef: 2,
        swingWpx: 90,
        swingHpx: 45,
        areaPx: 1800,
        swingSpanPx: 90,
        ratioBlade: 1.1,
        framingPx: 14,
        framingAlongPx: 6,
        framingOppositePx: 8,
        overhangAlongPx: 200,
        overhangOppositePx: 90,
        clearOverhangAlongRatio: 0.75,
        clearOverhangOppositeRatio: 0.1,
        fmlRefId: CONCEPT_DOOR_REFID,
        kind: 'single',
      },
    ]
    const resolved = resolveDoorCandidates({
      hypotheses,
      refBands: refs,
      pxPerMmX: 2,
      pxPerMmY: 2,
    })
    expect(resolved).toHaveLength(1)
    const door = resolved[0]
    expect(door.overhangAlongPx).toBeCloseTo(100 * 0.75 + 6, 2)
    expect(door.overhangOppositePx).toBeCloseTo(100 * 0.1 + 8, 2)
  })

  it('houdt cluster type/refid gelijk aan gematchte ref', () => {
    const hypotheses = [
      makeHypothesis({
        id: 'door-cluster',
        faceIds: [1, 2],
        bbox: { x: 40, y: 40, width: 100, height: 60 },
        source: 'cluster',
      }),
    ]
    const refs: DoorSwingRefBand[] = [
      {
        aspectRef: 1.66,
        swingWpx: 100,
        swingHpx: 60,
        areaPx: 3600,
        ratioBlade: 1.2,
        framingPx: 14,
        fmlRefId: CONCEPT_DOOR_REFID,
        kind: 'single',
      },
    ]
    const resolved = resolveDoorCandidates({
      hypotheses,
      refBands: refs,
      pxPerMmX: 2,
      pxPerMmY: 2,
    })
    expect(resolved).toHaveLength(1)
    expect(resolved[0].kind).toBe('single')
    expect(resolved[0].fmlRefId).toBe(CONCEPT_DOOR_REFID)
  })

  it('dropt niet meer bij ontbrekende hinge (hinge pas in L12)', () => {
    const resolved = resolveDoorCandidates({
      hypotheses: [
        makeHypothesis({
          id: 'door-no-hinge-yet',
          faceIds: [1],
          bbox: { x: 20, y: 20, width: 60, height: 60 },
        }),
      ],
      refBands: [
        {
          aspectRef: 1,
          swingWpx: 60,
          swingHpx: 60,
          areaPx: 3000,
          ratioBlade: 1,
          framingPx: 0,
          fmlRefId: CONCEPT_DOOR_REFID,
          kind: 'single',
        },
      ],
      pxPerMmX: 2,
      pxPerMmY: 2,
    })
    expect(resolved).toHaveLength(1)
    expect(resolved[0].id).toBe('door-no-hinge-yet')
    expect(resolved[0].swingSpanPx).toBe(60)
  })

  it('schaalt op face-bbox (BouwTek11 single-7)', () => {
    const resolved = resolveDoorCandidates({
      hypotheses: [
        makeHypothesis({
          id: 'door-swing-single-7',
          faceIds: [1],
          bbox: { x: 804, y: 724, width: 116, height: 114 },
        }),
      ],
      refBands: [
        {
          aspectRef: 1.03,
          swingWpx: 114,
          swingHpx: 118,
          areaPx: 9871,
          swingSpanPx: 112.75,
          swingAngleDeg: 90,
          ratioBlade: 1.05,
          framingPx: 0,
          overhangAlongPx: 118,
          overhangOppositePx: 0,
          framingAlongPx: 0,
          framingOppositePx: 0,
          fmlRefId: CONCEPT_DOOR_REFID,
          kind: 'single',
        },
      ],
      pxPerMmX: 0.1264,
      pxPerMmY: 0.1289,
    })
    expect(resolved).toHaveLength(1)
    const door = resolved[0]
    expect(door.swingSpanPx).toBe(116)
    expect(door.widthCm).toBeLessThan(110)
    expect(door.widthCm).toBeGreaterThan(80)
  })
})
